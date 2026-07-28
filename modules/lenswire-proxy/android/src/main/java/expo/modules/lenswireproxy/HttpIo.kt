package expo.modules.lenswireproxy

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket
import java.net.SocketException
import javax.net.ssl.SSLSocket

/** HTTP/1.1 read/write helpers and socket relay for LocalProxyServer. */
internal object HttpIo {
  const val MAX_BODY_BYTES = 2 * 1024 * 1024

  fun writeHttpResponse(
    out: OutputStream,
    status: Int,
    headers: Map<String, String>,
    body: ByteArray,
    statusMessage: String? = null,
  ) {
    val headerBuf = StringBuilder()
    headerBuf.append("HTTP/1.1 ").append(status).append(' ')
      .append(statusMessage ?: CaptureFormatting.statusText(status))
      .append("\r\n")
    headers.forEach { (key, value) ->
      if (key.equals("Transfer-Encoding", true)) return@forEach
      if (key.equals("Content-Length", true)) return@forEach
      headerBuf.append(key).append(": ").append(value).append("\r\n")
    }
    headerBuf.append("Content-Length: ").append(body.size).append("\r\n")
    headerBuf.append("Connection: close\r\n\r\n")
    out.write(headerBuf.toString().toByteArray(Charsets.ISO_8859_1))
    out.write(body)
    out.flush()
  }

  fun readHttpMessage(socket: SSLSocket): ByteArray {
    val input = socket.inputStream
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(4096)
    var headerEnd = -1
    var contentLength = 0
    while (out.size() < MAX_BODY_BYTES) {
      val read = input.read(buffer)
      if (read <= 0) break
      out.write(buffer, 0, read)
      val bytes = out.toByteArray()
      if (headerEnd < 0) {
        headerEnd = indexOfHeaderEnd(bytes)
        if (headerEnd >= 0) {
          val headerText = String(bytes, 0, headerEnd, Charsets.ISO_8859_1)
          contentLength = parseContentLength(headerText)
        }
      }
      if (headerEnd >= 0 && isChunkedHeader(String(bytes, 0, headerEnd, Charsets.ISO_8859_1))) {
        val body = bytes.copyOfRange(headerEnd + 4, bytes.size)
        val doneAt = chunkedPayloadLength(body)
        if (doneAt != null && body.size >= doneAt) break
      } else {
        if (headerEnd >= 0 && bytes.size >= headerEnd + 4 + contentLength) break
        if (headerEnd >= 0 && contentLength == 0) break
      }
    }
    return out.toByteArray()
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
