package expo.modules.lenswireproxy

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.zip.GZIPInputStream
import java.util.zip.Inflater
import java.util.zip.InflaterInputStream

/** Body classification and capture display helpers for LocalProxyServer. */
internal object CaptureFormatting {
  private const val MAX_TEXT_CHARS = 256 * 1024
  private const val MAX_IMAGE_PREVIEW_BYTES = 512 * 1024
  private const val MAX_BINARY_PREVIEW_BYTES = 16 * 1024
  private const val MAX_DECODED_BYTES = HttpIo.MAX_BODY_BYTES

  fun classifyBody(
    body: ByteArray,
    contentType: String?,
    contentEncoding: String? = null,
  ): Map<String, Any?> {
    if (body.isEmpty()) return mapOf("kind" to "empty", "size" to 0)

    val decoded = maybeDecodeEncoding(body, contentEncoding)
    val payload = decoded.bytes
    val encodingDecoded = decoded.decoded
    val size = payload.size
    val lower = contentType?.lowercase() ?: ""

    if (lower.contains("multipart/form-data")) {
      val text = String(payload, Charsets.UTF_8)
      val boundary = lower.substringAfter("boundary=", "").trim().ifEmpty { null }
      val summary = if (boundary != null) summarizeMultipart(text, boundary) else text
      return textBodyResult("text", summary, size, encodingDecoded)
    }

    if (lower.startsWith("image/")) {
      return binaryBodyResult("image", payload, size, encodingDecoded, MAX_IMAGE_PREVIEW_BYTES)
    }

    val textLike = lower.contains("json") ||
      lower.startsWith("text/") ||
      lower.contains("xml") ||
      lower.contains("x-www-form-urlencoded") ||
      lower.contains("javascript")

    if (!textLike) {
      return binaryBodyResult("binary", payload, size, encodingDecoded, MAX_BINARY_PREVIEW_BYTES)
    }

    var text = String(payload, Charsets.UTF_8)
    val kind = if (lower.contains("json") || text.trimStart().firstOrNull() in setOf('{', '[')) {
      text = prettyJson(text)
      "json"
    } else {
      "text"
    }
    return textBodyResult(kind, text, size, encodingDecoded)
  }

  private fun textBodyResult(
    kind: String,
    text: String,
    size: Int,
    encodingDecoded: Boolean,
  ): Map<String, Any?> {
    val truncated = text.length > MAX_TEXT_CHARS
    val clipped = if (truncated) text.substring(0, MAX_TEXT_CHARS) + "\n\n...truncated..." else text
    return buildMap {
      put("kind", kind)
      put("text", clipped)
      put("size", size)
      put("truncated", truncated)
      if (encodingDecoded) put("encodingDecoded", true)
    }
  }

  private fun binaryBodyResult(
    kind: String,
    payload: ByteArray,
    size: Int,
    encodingDecoded: Boolean,
    maxPreview: Int,
  ): Map<String, Any?> {
    val truncated = payload.size > maxPreview
    val preview = if (truncated) payload.copyOf(maxPreview) else payload
    return buildMap {
      put("kind", kind)
      put("size", size)
      put("truncated", truncated)
      put("previewBase64", Base64.encodeToString(preview, Base64.NO_WRAP))
      if (encodingDecoded) put("encodingDecoded", true)
    }
  }

  private data class DecodedBody(val bytes: ByteArray, val decoded: Boolean)

  private fun maybeDecodeEncoding(body: ByteArray, contentEncoding: String?): DecodedBody {
    val enc = contentEncoding?.lowercase()?.trim().orEmpty()
    if (enc.isEmpty() || enc == "identity") {
      // Still try gzip magic when header missing (some clients leave compressed bytes).
      if (isGzip(body)) {
        return decodeGzip(body) ?: DecodedBody(body, false)
      }
      return DecodedBody(body, false)
    }
    if (enc.contains("gzip") || isGzip(body)) {
      return decodeGzip(body) ?: DecodedBody(body, false)
    }
    if (enc.contains("deflate")) {
      return decodeDeflate(body) ?: DecodedBody(body, false)
    }
    // brotli not available in Android stdlib — leave compressed
    return DecodedBody(body, false)
  }

  private fun isGzip(body: ByteArray): Boolean =
    body.size >= 2 && body[0] == 0x1f.toByte() && body[1] == 0x8b.toByte()

  private fun decodeGzip(body: ByteArray): DecodedBody? {
    return try {
      GZIPInputStream(ByteArrayInputStream(body)).use { input ->
        DecodedBody(HttpIo.readBounded(input, MAX_DECODED_BYTES), true)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun decodeDeflate(body: ByteArray): DecodedBody? {
    return try {
      // Try zlib-wrapped first, then raw deflate.
      inflate(body, nowrap = false) ?: inflate(body, nowrap = true)
    } catch (_: Exception) {
      null
    }
  }

  private fun inflate(body: ByteArray, nowrap: Boolean): DecodedBody? {
    return try {
      val inflater = Inflater(nowrap)
      InflaterInputStream(ByteArrayInputStream(body), inflater).use { input ->
        DecodedBody(HttpIo.readBounded(input, MAX_DECODED_BYTES), true)
      }
    } catch (_: Exception) {
      null
    }
  }

  fun summarizeMultipart(rawBody: String, boundaryToken: String): String {
    val marker = "--$boundaryToken"
    val out = StringBuilder("multipart/form-data summary")
    var index = 0
    rawBody.split(marker).forEach { part ->
      val trimmed = part.trim()
      if (trimmed.isEmpty() || trimmed == "--") return@forEach
      val normalized = part.trim('\r', '\n')
      val headerEnd = normalized.indexOf("\r\n\r\n")
      if (headerEnd <= 0) return@forEach
      val headersBlock = normalized.substring(0, headerEnd)
      val payload = normalized.substring(headerEnd + 4).trimEnd('\r', '\n')
      val disposition = headersBlock.lineSequence().firstOrNull {
        it.startsWith("Content-Disposition", ignoreCase = true)
      } ?: ""
      val contentType = headersBlock.lineSequence().firstOrNull {
        it.startsWith("Content-Type", ignoreCase = true)
      } ?: "Content-Type: text/plain"
      val name = disposition.substringAfter("name=\"", "").substringBefore('"')
      val filename = disposition.substringAfter("filename=\"", "").substringBefore('"')
      val bytes = payload.toByteArray(Charsets.UTF_8).size

      index += 1
      out.append("\n")
      out.append(index).append(". ")
      out.append("name=").append(name.ifEmpty { "(unnamed)" })
      if (filename.isNotEmpty()) out.append(", file=").append(filename)
      out.append(", ").append(contentType.substringAfter(':').trim())
      out.append(", size=").append(bytes).append(" B")
    }
    return out.toString()
  }

  fun prettyJson(raw: String): String {
    return try {
      if (raw.trim().startsWith("[")) JSONArray(raw).toString(2) else JSONObject(raw).toString(2)
    } catch (_: Exception) {
      raw
    }
  }

  fun timing(
    dnsMs: Int = 0,
    connectMs: Int = 0,
    tlsMs: Int = 0,
    ttfbMs: Int = 0,
    downloadMs: Int = 0,
    totalMs: Long = 0,
  ): Map<String, Int> = mapOf(
    "dnsMs" to maxOf(0, dnsMs),
    "connectMs" to maxOf(0, connectMs),
    "tlsMs" to maxOf(0, tlsMs),
    "ttfbMs" to maxOf(0, ttfbMs),
    "downloadMs" to maxOf(0, downloadMs),
    "totalMs" to maxOf(0L, totalMs).toInt(),
  )

  fun statusText(status: Int): String {
    return when (status) {
      200 -> "OK"
      201 -> "Created"
      204 -> "No Content"
      301 -> "Moved Permanently"
      302 -> "Found"
      304 -> "Not Modified"
      400 -> "Bad Request"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      408 -> "Request Timeout"
      429 -> "Too Many Requests"
      500 -> "Internal Server Error"
      502 -> "Bad Gateway"
      503 -> "Service Unavailable"
      504 -> "Gateway Timeout"
      else -> "OK"
    }
  }
}
