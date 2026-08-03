package expo.modules.lenswireproxy

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket
import java.net.SocketException

/** HTTP/1.1 read/write helpers and socket relay for LocalProxyServer. */
internal object HttpIo {
  const val MAX_BODY_BYTES = 2 * 1024 * 1024

  /** Result of streaming an upstream body to the client while capping capture memory. */
  data class TeeBodyResult(
    val capture: ByteArray,
    val truncated: Boolean,
    val wireBytes: Long,
  )

  fun writeHttpResponse(
    out: OutputStream,
    status: Int,
    headers: Map<String, String>,
    body: ByteArray,
    statusMessage: String? = null,
    connectionClose: Boolean = true,
  ) {
    writeHttpResponseHeaders(
      out = out,
      status = status,
      headers = headers,
      contentLength = body.size.toLong(),
      statusMessage = statusMessage,
      connectionClose = connectionClose,
      chunked = false,
    )
    out.write(body)
    out.flush()
  }

  /**
   * Stream [bodyStream] to the client without truncating the wire path.
   * Capture buffer is capped at [maxCaptureBytes]; excess bytes are still forwarded.
   *
   * Framing: when [contentLength] is known, write Content-Length and raw body.
   * Otherwise write Transfer-Encoding: chunked (keeps keep-alive usable).
   */
  fun streamHttpResponse(
    out: OutputStream,
    status: Int,
    headers: Map<String, String>,
    bodyStream: InputStream?,
    contentLength: Long? = null,
    statusMessage: String? = null,
    connectionClose: Boolean = true,
    maxCaptureBytes: Int = MAX_BODY_BYTES,
  ): TeeBodyResult {
    val knownLength = contentLength != null && contentLength >= 0
    writeHttpResponseHeaders(
      out = out,
      status = status,
      headers = headers,
      contentLength = if (knownLength) contentLength else null,
      statusMessage = statusMessage,
      connectionClose = connectionClose,
      chunked = !knownLength,
    )
    if (bodyStream == null) {
      if (!knownLength) {
        out.write("0\r\n\r\n".toByteArray(Charsets.ISO_8859_1))
        out.flush()
      }
      return TeeBodyResult(ByteArray(0), truncated = false, wireBytes = 0L)
    }
    return if (knownLength) {
      teeRawBody(bodyStream, out, maxCaptureBytes)
    } else {
      teeChunkedBody(bodyStream, out, maxCaptureBytes)
    }
  }

  fun writeHttpResponseHeaders(
    out: OutputStream,
    status: Int,
    headers: Map<String, String>,
    contentLength: Long?,
    statusMessage: String? = null,
    connectionClose: Boolean = true,
    chunked: Boolean = false,
  ) {
    val headerBuf = StringBuilder()
    headerBuf.append("HTTP/1.1 ").append(status).append(' ')
      .append(statusMessage ?: CaptureFormatting.statusText(status))
      .append("\r\n")
    headers.forEach { (key, value) ->
      if (key.equals("Transfer-Encoding", true)) return@forEach
      if (key.equals("Content-Length", true)) return@forEach
      if (key.equals("Connection", true)) return@forEach
      headerBuf.append(key).append(": ").append(value).append("\r\n")
    }
    if (chunked) {
      headerBuf.append("Transfer-Encoding: chunked\r\n")
    } else if (contentLength != null) {
      headerBuf.append("Content-Length: ").append(contentLength).append("\r\n")
    }
    headerBuf.append("Connection: ")
      .append(if (connectionClose) "close" else "keep-alive")
      .append("\r\n\r\n")
    out.write(headerBuf.toString().toByteArray(Charsets.ISO_8859_1))
    out.flush()
  }

  /** Pipe all bytes to [out]; keep only the first [maxCaptureBytes] for capture. */
  fun teeRawBody(
    input: InputStream,
    out: OutputStream,
    maxCaptureBytes: Int = MAX_BODY_BYTES,
  ): TeeBodyResult {
    val capture = ByteArrayOutputStream()
    val buf = ByteArray(32 * 1024)
    var wireBytes = 0L
    var truncated = false
    while (true) {
      val n = input.read(buf)
      if (n <= 0) break
      out.write(buf, 0, n)
      wireBytes += n
      if (capture.size() < maxCaptureBytes) {
        val room = maxCaptureBytes - capture.size()
        capture.write(buf, 0, minOf(n, room))
        if (n > room) truncated = true
      } else {
        truncated = true
      }
    }
    out.flush()
    return TeeBodyResult(capture.toByteArray(), truncated = truncated, wireBytes = wireBytes)
  }

  /** Pipe as HTTP/1.1 chunked; capture still stores decoded (raw) bytes up to the cap. */
  fun teeChunkedBody(
    input: InputStream,
    out: OutputStream,
    maxCaptureBytes: Int = MAX_BODY_BYTES,
  ): TeeBodyResult {
    val capture = ByteArrayOutputStream()
    val buf = ByteArray(32 * 1024)
    var wireBytes = 0L
    var truncated = false
    while (true) {
      val n = input.read(buf)
      if (n <= 0) break
      out.write(Integer.toHexString(n).toByteArray(Charsets.ISO_8859_1))
      out.write('\r'.code)
      out.write('\n'.code)
      out.write(buf, 0, n)
      out.write('\r'.code)
      out.write('\n'.code)
      wireBytes += n
      if (capture.size() < maxCaptureBytes) {
        val room = maxCaptureBytes - capture.size()
        capture.write(buf, 0, minOf(n, room))
        if (n > room) truncated = true
      } else {
        truncated = true
      }
    }
    out.write("0\r\n\r\n".toByteArray(Charsets.ISO_8859_1))
    out.flush()
    return TeeBodyResult(capture.toByteArray(), truncated = truncated, wireBytes = wireBytes)
  }

  /** HTTP/1.1 default keep-alive unless client sent Connection: close. */
  fun clientWantsKeepAlive(headers: Map<String, String>): Boolean {
    val connection = headers.entries
      .firstOrNull { it.key.equals("Connection", ignoreCase = true) }
      ?.value
      ?.lowercase()
      .orEmpty()
    if (connection.contains("close")) return false
    return true
  }

  /** Reads one HTTP/1.1 message, optionally starting from already-read [prefix] bytes. */
  fun readHttpMessage(input: InputStream, prefix: ByteArray = ByteArray(0)): ByteArray {
    val out = ByteArrayOutputStream()
    if (prefix.isNotEmpty()) out.write(prefix)
    val buffer = ByteArray(4096)
    var headerEnd = if (prefix.isNotEmpty()) indexOfHeaderEnd(prefix) else -1
    var contentLength = 0
    var chunked = false
    if (headerEnd >= 0) {
      val headerText = String(prefix, 0, headerEnd, Charsets.ISO_8859_1)
      contentLength = parseContentLength(headerText)
      chunked = isChunkedHeader(headerText)
      if (!chunked && (out.size() >= headerEnd + 4 + contentLength || contentLength == 0)) {
        return out.toByteArray()
      }
      if (chunked && messageComplete(out.toByteArray(), headerEnd, contentLength)) {
        return out.toByteArray()
      }
    }
    while (out.size() < MAX_BODY_BYTES) {
      val read = input.read(buffer)
      if (read <= 0) break
      out.write(buffer, 0, read)
      if (headerEnd < 0) {
        // Only materialize bytes until headers are located.
        val bytes = out.toByteArray()
        headerEnd = indexOfHeaderEnd(bytes)
        if (headerEnd >= 0) {
          val headerText = String(bytes, 0, headerEnd, Charsets.ISO_8859_1)
          contentLength = parseContentLength(headerText)
          chunked = isChunkedHeader(headerText)
        } else {
          continue
        }
      }
      if (!chunked) {
        if (out.size() >= headerEnd + 4 + contentLength || contentLength == 0) break
      } else if (messageComplete(out.toByteArray(), headerEnd, contentLength)) {
        break
      }
    }
    return out.toByteArray()
  }

  /**
   * First application-data chunk after TLS handshake (bounded; does not wait for HTTP headers).
   * Only `read < 0` is EOF. Some SSL streams return `0` contrary to InputStream contract —
   * treat that as would-block and retry until data, EOF, or the socket's read timeout.
   */
  fun readFirstChunk(input: InputStream, maxBytes: Int = 4096): ByteArray {
    val buffer = ByteArray(maxBytes)
    while (true) {
      val read = input.read(buffer)
      when {
        read < 0 -> return ByteArray(0)
        read > 0 -> return buffer.copyOf(read)
        // read == 0: retry (would-block / no bytes yet)
      }
    }
  }

  private fun messageComplete(bytes: ByteArray, headerEnd: Int, contentLength: Int): Boolean {
    if (headerEnd < 0) return false
    val headerText = String(bytes, 0, headerEnd, Charsets.ISO_8859_1)
    if (isChunkedHeader(headerText)) {
      val body = bytes.copyOfRange(headerEnd + 4, bytes.size)
      val doneAt = chunkedPayloadLength(body)
      return doneAt != null && body.size >= doneAt
    }
    return bytes.size >= headerEnd + 4 + contentLength || contentLength == 0
  }

  fun readUntilHeaderEnd(input: InputStream, maxBytes: Int = 64 * 1024): ByteArray {
    val out = ByteArrayOutputStream()
    var prev3 = 0
    var prev2 = 0
    var prev1 = 0
    while (out.size() < maxBytes) {
      val b = input.read()
      if (b < 0) break
      out.write(b)
      if (prev3 == '\r'.code && prev2 == '\n'.code && prev1 == '\r'.code && b == '\n'.code) {
        break
      }
      prev3 = prev2
      prev2 = prev1
      prev1 = b
    }
    return out.toByteArray()
  }

  fun isChunked(headers: Map<String, String>): Boolean {
    val value = headers.entries.firstOrNull { it.key.equals("Transfer-Encoding", true) }?.value
    return value?.lowercase()?.contains("chunked") == true
  }

  fun readRequestBody(input: InputStream, headers: Map<String, String>): ByteArray {
    if (isChunked(headers)) {
      return readChunkedBody(input)
    }
    val contentLength = headers.entries
      .firstOrNull { it.key.equals("Content-Length", true) }
      ?.value
      ?.trim()
      ?.toIntOrNull()
      ?: 0
    if (contentLength <= 0) return ByteArray(0)
    val toRead = minOf(contentLength, MAX_BODY_BYTES)
    val body = readExactly(input, toRead)
    // Drain excess so the connection stays usable for capture/response paths.
    if (contentLength > MAX_BODY_BYTES) {
      skipFully(input, contentLength.toLong() - MAX_BODY_BYTES.toLong())
    }
    return body
  }

  /** Reads up to [maxBytes] from [input], truncating oversized payloads. */
  fun readBounded(input: InputStream, maxBytes: Int = MAX_BODY_BYTES): ByteArray {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(32 * 1024)
    var total = 0
    while (total < maxBytes) {
      val n = input.read(buf, 0, minOf(buf.size, maxBytes - total))
      if (n <= 0) break
      out.write(buf, 0, n)
      total += n
    }
    return out.toByteArray()
  }

  fun decodeChunkedBody(raw: ByteArray): ByteArray? {
    var index = 0
    val out = ByteArrayOutputStream()
    while (index < raw.size) {
      val lineEnd = indexOfCrlf(raw, index) ?: return null
      val line = String(raw, index, lineEnd - index, Charsets.ISO_8859_1)
      val chunkSize = line.substringBefore(';').trim().toIntOrNull(16) ?: return null
      index = lineEnd + 2
      if (chunkSize < 0) return null
      if (raw.size < index + chunkSize + 2) return null
      if (chunkSize > 0) out.write(raw, index, chunkSize)
      index += chunkSize
      if (raw[index] != '\r'.code.toByte() || raw[index + 1] != '\n'.code.toByte()) return null
      index += 2
      if (chunkSize == 0) {
        while (true) {
          if (raw.size < index + 2) return null
          if (raw[index] == '\r'.code.toByte() && raw[index + 1] == '\n'.code.toByte()) {
            return out.toByteArray()
          }
          val trailerEnd = indexOfCrlf(raw, index) ?: return null
          index = trailerEnd + 2
        }
      }
    }
    return null
  }

  fun relay(source: Socket, sink: Socket) {
    try {
      val input = source.getInputStream()
      val output = sink.getOutputStream()
      val buf = ByteArray(32 * 1024)
      while (true) {
        val read = input.read(buf)
        if (read <= 0) break
        output.write(buf, 0, read)
        output.flush()
      }
    } catch (_: SocketException) {
      // Expected when either side closes first.
    } catch (_: IOException) {
      // Ignore teardown races.
    }
  }

  private fun indexOfHeaderEnd(bytes: ByteArray): Int {
    if (bytes.size < 4) return -1
    for (i in 0..bytes.size - 4) {
      if (bytes[i] == '\r'.code.toByte() &&
        bytes[i + 1] == '\n'.code.toByte() &&
        bytes[i + 2] == '\r'.code.toByte() &&
        bytes[i + 3] == '\n'.code.toByte()
      ) {
        return i
      }
    }
    return -1
  }

  private fun parseContentLength(headerText: String): Int {
    headerText.split("\r\n").forEach { line ->
      if (line.lowercase().startsWith("content-length:")) {
        return line.substringAfter(':').trim().toIntOrNull() ?: 0
      }
    }
    return 0
  }

  private fun isChunkedHeader(headerText: String): Boolean {
    headerText.split("\r\n").forEach { line ->
      val lower = line.lowercase()
      if (lower.startsWith("transfer-encoding:") && lower.contains("chunked")) {
        return true
      }
    }
    return false
  }

  private fun readChunkedBody(input: InputStream): ByteArray {
    val out = ByteArrayOutputStream()
    while (out.size() < MAX_BODY_BYTES) {
      val line = readLineCrlf(input) ?: break
      val sizeToken = line.substringBefore(';').trim()
      val chunkSize = sizeToken.toIntOrNull(16) ?: break
      if (chunkSize == 0) {
        while (true) {
          val trailer = readLineCrlf(input) ?: break
          if (trailer.isEmpty()) break
        }
        break
      }
      val room = MAX_BODY_BYTES - out.size()
      val toRead = minOf(chunkSize, room)
      val chunk = readExactly(input, toRead)
      out.write(chunk)
      if (chunkSize > toRead) {
        skipFully(input, (chunkSize - toRead).toLong())
      }
      val lineBreak = readExactly(input, 2)
      if (
        lineBreak.size != 2 ||
        lineBreak[0] != '\r'.code.toByte() ||
        lineBreak[1] != '\n'.code.toByte()
      ) {
        break
      }
      if (chunkSize > toRead) {
        // Truncated; drain remaining chunks without storing.
        while (true) {
          val drainLine = readLineCrlf(input) ?: break
          val drainSize = drainLine.substringBefore(';').trim().toIntOrNull(16) ?: break
          if (drainSize == 0) {
            while (true) {
              val trailer = readLineCrlf(input) ?: break
              if (trailer.isEmpty()) break
            }
            break
          }
          skipFully(input, drainSize.toLong())
          skipFully(input, 2)
        }
        break
      }
    }
    return out.toByteArray()
  }

  private fun skipFully(input: InputStream, count: Long) {
    var left = count
    while (left > 0) {
      val skipped = input.skip(left)
      if (skipped > 0) {
        left -= skipped
        continue
      }
      if (input.read() < 0) break
      left -= 1
    }
  }

  private fun readLineCrlf(input: InputStream, maxBytes: Int = 8 * 1024): String? {
    val out = ByteArrayOutputStream()
    var prev = -1
    while (out.size() < maxBytes) {
      val curr = input.read()
      if (curr < 0) break
      if (prev == '\r'.code && curr == '\n'.code) {
        val bytes = out.toByteArray()
        return String(bytes, 0, bytes.size - 1, Charsets.ISO_8859_1)
      }
      out.write(curr)
      prev = curr
    }
    return if (out.size() > 0) String(out.toByteArray(), Charsets.ISO_8859_1) else null
  }

  private fun readExactly(input: InputStream, size: Int): ByteArray {
    if (size <= 0) return ByteArray(0)
    val out = ByteArray(size)
    var readTotal = 0
    while (readTotal < size) {
      val n = input.read(out, readTotal, size - readTotal)
      if (n <= 0) break
      readTotal += n
    }
    return if (readTotal == size) out else out.copyOf(readTotal)
  }

  private fun chunkedPayloadLength(raw: ByteArray): Int? {
    var index = 0
    while (index < raw.size) {
      val lineEnd = indexOfCrlf(raw, index) ?: return null
      val line = String(raw, index, lineEnd - index, Charsets.ISO_8859_1)
      val chunkSize = line.substringBefore(';').trim().toIntOrNull(16) ?: return null
      index = lineEnd + 2
      if (raw.size < index + chunkSize + 2) return null
      index += chunkSize
      if (raw[index] != '\r'.code.toByte() || raw[index + 1] != '\n'.code.toByte()) return null
      index += 2
      if (chunkSize == 0) {
        while (true) {
          if (raw.size < index + 2) return null
          if (raw[index] == '\r'.code.toByte() && raw[index + 1] == '\n'.code.toByte()) {
            return index + 2
          }
          val trailerEnd = indexOfCrlf(raw, index) ?: return null
          index = trailerEnd + 2
        }
      }
    }
    return null
  }

  private fun indexOfCrlf(bytes: ByteArray, start: Int): Int? {
    var i = start
    while (i + 1 < bytes.size) {
      if (bytes[i] == '\r'.code.toByte() && bytes[i + 1] == '\n'.code.toByte()) {
        return i
      }
      i += 1
    }
    return null
  }
}
