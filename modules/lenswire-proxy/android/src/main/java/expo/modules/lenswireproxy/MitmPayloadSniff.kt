package expo.modules.lenswireproxy

/**
 * Classifies the first decrypted bytes after a MITM TLS handshake so HardFailure
 * captures can show protocol guess + hex preview (HTTP/2, binary, unsupported method).
 */
internal object MitmPayloadSniff {
  private val HTTP2_PREFACE = "PRI * HTTP/2.0".toByteArray(Charsets.US_ASCII)
  private val SUPPORTED_METHODS = setOf(
    "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  )
  private const val PRINTABLE_RATIO = 0.85

  enum class Guess {
    EMPTY,
    HTTP2,
    HTTP11,
    NON_HTTP,
  }

  data class Result(
    val guess: Guess,
    val method: String?,
    val firstLine: String?,
  ) {
    val looksLikeHttp11: Boolean get() = guess == Guess.HTTP11
  }

  fun isSupportedMethod(method: String): Boolean = SUPPORTED_METHODS.contains(method.uppercase())

  fun analyze(bytes: ByteArray): Result {
    if (bytes.isEmpty()) {
      return Result(Guess.EMPTY, method = null, firstLine = null)
    }
    // Full or partial HTTP/2 connection preface (before OPTIONS * matching).
    if (startsWith(bytes, HTTP2_PREFACE) || looksLikeHttp2Preface(bytes)) {
      return Result(Guess.HTTP2, method = "PRI", firstLine = firstLineOf(bytes))
    }
    val firstLine = firstLineOf(bytes)
    val method = methodFromRequestLine(firstLine)
    if (method != null && looksLikeHttpRequestLine(firstLine)) {
      return Result(Guess.HTTP11, method = method, firstLine = firstLine)
    }
    return Result(Guess.NON_HTTP, method = method, firstLine = firstLine)
  }

  /**
   * Whether MITM should stop immediately after the first peek.
   * Abort on EOF, HTTP/2, clear binary, or unsupported HTTP/1.1 method.
   * Do **not** abort on ambiguous printable fragments (e.g. `"GET"` without a path) —
   * those continue into [HttpIo.readHttpMessage] with the peek as prefix.
   */
  fun shouldAbortMitm(result: Result, bytes: ByteArray): Boolean {
    return when (result.guess) {
      Guess.EMPTY, Guess.HTTP2 -> true
      Guess.HTTP11 -> result.method != null && !isSupportedMethod(result.method)
      Guess.NON_HTTP -> isClearlyNonHttp(bytes)
    }
  }

  fun isMostlyPrintable(bytes: ByteArray, threshold: Double = PRINTABLE_RATIO): Boolean {
    if (bytes.isEmpty()) return false
    var printable = 0
    for (b in bytes) {
      val c = b.toInt() and 0xff
      if (c == 9 || c == 10 || c == 13 || c in 0x20..0x7e) printable++
    }
    return printable.toDouble() / bytes.size >= threshold
  }

  fun formatDetail(result: Result, bytes: ByteArray, maxHexBytes: Int = 64): String {
    val parts = mutableListOf<String>()
    parts.add("guess=${result.guess.name.lowercase()}")
    if (!result.method.isNullOrBlank()) {
      parts.add("method=${result.method}")
    }
    if (!result.firstLine.isNullOrBlank()) {
      parts.add("firstLine=${result.firstLine.take(120)}")
    }
    if (bytes.isNotEmpty()) {
      parts.add("hex=${toHexPreview(bytes, maxHexBytes)}")
      parts.add("ascii=${toAsciiPreview(bytes, maxHexBytes)}")
    } else {
      parts.add("bytes=0")
    }
    return parts.joinToString("; ")
  }

  fun toHexPreview(bytes: ByteArray, maxBytes: Int = 64): String {
    val n = minOf(bytes.size, maxBytes)
    val sb = StringBuilder(n * 3)
    for (i in 0 until n) {
      if (i > 0) sb.append(' ')
      sb.append(String.format("%02x", bytes[i].toInt() and 0xff))
    }
    if (bytes.size > maxBytes) sb.append(" …")
    return sb.toString()
  }

  fun toAsciiPreview(bytes: ByteArray, maxBytes: Int = 64): String {
    val n = minOf(bytes.size, maxBytes)
    val sb = StringBuilder(n)
    for (i in 0 until n) {
      val c = bytes[i].toInt() and 0xff
      sb.append(if (c in 0x20..0x7e) c.toChar() else '.')
    }
    if (bytes.size > maxBytes) sb.append("…")
    return sb.toString()
  }

  private fun isClearlyNonHttp(bytes: ByteArray): Boolean {
    if (bytes.isEmpty()) return true
    if (!isMostlyPrintable(bytes)) return true
    // Printable but not an HTTP method start — treat as opaque text/protocol.
    val first = bytes[0].toInt() and 0xff
    return first !in 'A'.code..'Z'.code && first !in 'a'.code..'z'.code
  }

  /** True when bytes look like the HTTP/2 preface before the full `PRI * HTTP/2.0` arrives. */
  private fun looksLikeHttp2Preface(bytes: ByteArray): Boolean {
    if (bytes.isNotEmpty() && bytes.size < HTTP2_PREFACE.size) {
      if (bytes.contentEquals(HTTP2_PREFACE.copyOf(bytes.size))) return true
    }
    val line = firstLineOf(bytes) ?: return false
    val method = methodFromRequestLine(line) ?: return false
    if (method != "PRI") return false
    val parts = line.split(' ', limit = 3)
    return parts.size >= 2 && parts[1] == "*"
  }

  private fun startsWith(bytes: ByteArray, prefix: ByteArray): Boolean {
    if (bytes.size < prefix.size) return false
    for (i in prefix.indices) {
      if (bytes[i] != prefix[i]) return false
    }
    return true
  }

  private fun firstLineOf(bytes: ByteArray): String? {
    var end = bytes.size
    for (i in bytes.indices) {
      if (bytes[i] == '\n'.code.toByte()) {
        end = i
        break
      }
    }
    if (end == 0) return null
    var sliceEnd = end
    if (sliceEnd > 0 && bytes[sliceEnd - 1] == '\r'.code.toByte()) sliceEnd -= 1
    val raw = String(bytes, 0, sliceEnd, Charsets.ISO_8859_1)
    val cleaned = buildString(raw.length) {
      for (ch in raw) {
        append(if (ch.code in 0x20..0x7e) ch else '.')
      }
    }
    return cleaned.ifBlank { null }
  }

  private fun methodFromRequestLine(line: String?): String? {
    if (line.isNullOrBlank()) return null
    val method = line.substringBefore(' ').trim()
    if (method.isEmpty()) return null
    if (!method.all { it in 'A'..'Z' || it in 'a'..'z' }) return null
    return method.uppercase()
  }

  private fun looksLikeHttpRequestLine(line: String?): Boolean {
    if (line.isNullOrBlank()) return false
    val parts = line.split(' ', limit = 3)
    if (parts.size < 2) return false
    val method = parts[0]
    if (method.isEmpty() || !method.all { it in 'A'..'Z' || it in 'a'..'z' }) return false
    if (method.equals("PRI", ignoreCase = true)) return false
    // Path or asterisk (OPTIONS *) or absolute-form URL
    val target = parts[1]
    return target.startsWith("/") || target == "*" || target.contains("://")
  }
}
