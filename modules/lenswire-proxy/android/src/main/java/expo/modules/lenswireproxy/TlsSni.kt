package expo.modules.lenswireproxy

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer

/**
 * Minimal TLS ClientHello SNI peek for Path B MITM host recovery.
 * Parses only what we need from the first handshake record(s).
 */
object TlsSni {
  data class ClientHelloMeta(
    val recordVersion: String?,
    val clientVersion: String?,
    val alpnProtocols: List<String>,
    val sniPresent: Boolean,
  )

  data class PeekResult(
    val bytes: ByteArray,
    val sniHostname: String?,
    val meta: ClientHelloMeta? = null,
  )

  /**
   * Reads the first TLS record (or enough handshake bytes) from [input] without leaving
   * partial records behind. Returns consumed bytes so the caller can replay them.
   */
  fun peekClientHello(input: InputStream, maxBytes: Int = 16 * 1024): PeekResult {
    val out = ByteArrayOutputStream()
    val header = ByteArray(5)
    var total = 0
    while (total < maxBytes) {
      val headerRead = readFully(input, header, 0, 5)
      if (headerRead < 5) {
        if (headerRead > 0) out.write(header, 0, headerRead)
        break
      }
      out.write(header, 0, 5)
      total += 5
      val contentType = header[0].toInt() and 0xff
      val versionMajor = header[1].toInt() and 0xff
      val length = ((header[3].toInt() and 0xff) shl 8) or (header[4].toInt() and 0xff)
      if (contentType != 0x16 || versionMajor < 3 || length <= 0 || length > 16 * 1024) {
        // Not a TLS handshake record we understand — return what we have.
        val body = ByteArray(minOf(length.coerceAtLeast(0), maxBytes - total))
        val bodyRead = readFully(input, body, 0, body.size)
        if (bodyRead > 0) out.write(body, 0, bodyRead)
        break
      }
      val body = ByteArray(length)
      val bodyRead = readFully(input, body, 0, length)
      if (bodyRead > 0) out.write(body, 0, bodyRead)
      total += bodyRead
      if (bodyRead < length) break

      val bytes = out.toByteArray()
      val meta = extractClientHelloMeta(bytes)
      val sni = meta?.let { extractSniHostname(bytes) }
      // ClientHello may span multiple records; stop once we have SNI or a full handshake msg.
      if (sni != null || hasCompleteHandshakeMessage(bytes)) {
        return PeekResult(bytes, sni, meta)
      }
    }
    val bytes = out.toByteArray()
    val meta = extractClientHelloMeta(bytes)
    return PeekResult(bytes, extractSniHostname(bytes), meta)
  }

  fun extractClientHelloMeta(clientHelloRecord: ByteArray): ClientHelloMeta? {
    val hello = parseClientHello(clientHelloRecord) ?: return null
    return ClientHelloMeta(
      recordVersion = hello.recordVersion,
      clientVersion = hello.clientVersion,
      alpnProtocols = hello.alpnProtocols,
      sniPresent = hello.sniHostname != null,
    )
  }

  fun extractSniHostname(clientHelloRecord: ByteArray): String? {
    return try {
      parseClientHello(clientHelloRecord)?.sniHostname
    } catch (_: Exception) {
      null
    }
  }

  private data class ParsedClientHello(
    val sniHostname: String?,
    val clientVersion: String?,
    val alpnProtocols: List<String>,
    val recordVersion: String?,
  )

  private fun parseClientHello(data: ByteArray): ParsedClientHello? {
    if (data.size < 9) return null
    val recordVersion = if (data.size >= 3) tlsVersionName(data[1].toInt() and 0xff, data[2].toInt() and 0xff) else null
    var offset = 0
    // Skip TLS record headers and gather handshake payload.
    val handshake = ByteArrayOutputStream()
    while (offset + 5 <= data.size) {
      val contentType = data[offset].toInt() and 0xff
      val length = ((data[offset + 3].toInt() and 0xff) shl 8) or (data[offset + 4].toInt() and 0xff)
      offset += 5
      if (contentType != 0x16) return null
      if (offset + length > data.size) {
        handshake.write(data, offset, data.size - offset)
        break
      }
      handshake.write(data, offset, length)
      offset += length
      if (hasCompleteHandshakeMessage(handshake.toByteArray())) break
    }

    val hs = ByteBuffer.wrap(handshake.toByteArray())
    if (hs.remaining() < 4) return null
    val msgType = hs.get().toInt() and 0xff
    if (msgType != 0x01) return null // ClientHello
    val msgLen = ((hs.get().toInt() and 0xff) shl 16) or
      ((hs.get().toInt() and 0xff) shl 8) or
      (hs.get().toInt() and 0xff)
    if (hs.remaining() < msgLen) return null

    if (hs.remaining() < 34) return null // version(2) + random(32)
    val clientVersionMajor = hs.get().toInt() and 0xff
    val clientVersionMinor = hs.get().toInt() and 0xff
    val clientVersion = tlsVersionName(clientVersionMajor, clientVersionMinor)
    hs.position(hs.position() + 32)

    if (hs.remaining() < 1) return null
    val sessionIdLen = hs.get().toInt() and 0xff
    if (hs.remaining() < sessionIdLen) return null
    hs.position(hs.position() + sessionIdLen)

    if (hs.remaining() < 2) return null
    val cipherLen = hs.short.toInt() and 0xffff
    if (hs.remaining() < cipherLen) return null
    hs.position(hs.position() + cipherLen)

    if (hs.remaining() < 1) return null
    val compLen = hs.get().toInt() and 0xff
    if (hs.remaining() < compLen) return null
    hs.position(hs.position() + compLen)

    if (hs.remaining() < 2) return null
    val extLen = hs.short.toInt() and 0xffff
    if (hs.remaining() < extLen) return null
    val extEnd = hs.position() + extLen
    var sniHostname: String? = null
    val alpn = ArrayList<String>()
    while (hs.position() + 4 <= extEnd) {
      val type = hs.short.toInt() and 0xffff
      val len = hs.short.toInt() and 0xffff
      if (hs.position() + len > extEnd) return null
      if (type == 0x0000) { // server_name
        sniHostname = parseServerNameExtension(hs, len)
        continue
      }
      if (type == 0x0010) { // alpn
        alpn.addAll(parseAlpnExtension(hs, len))
        continue
      }
      hs.position(hs.position() + len)
    }
    return ParsedClientHello(
      sniHostname = sniHostname,
      clientVersion = clientVersion,
      alpnProtocols = alpn,
      recordVersion = recordVersion,
    )
  }

  private fun parseServerNameExtension(buf: ByteBuffer, length: Int): String? {
    val end = buf.position() + length
    if (buf.remaining() < 2) return null
    val listLen = buf.short.toInt() and 0xffff
    val listEnd = minOf(end, buf.position() + listLen)
    while (buf.position() + 3 <= listEnd) {
      val nameType = buf.get().toInt() and 0xff
      val nameLen = buf.short.toInt() and 0xffff
      if (buf.position() + nameLen > listEnd) return null
      if (nameType == 0x00) {
        val bytes = ByteArray(nameLen)
        buf.get(bytes)
        val host = String(bytes, Charsets.US_ASCII).trim().trimEnd('.')
        if (host.isNotEmpty() && !isIpLiteral(host)) return host
        return host.ifEmpty { null }
      }
      buf.position(buf.position() + nameLen)
    }
    return null
  }

  private fun parseAlpnExtension(buf: ByteBuffer, length: Int): List<String> {
    val end = buf.position() + length
    if (buf.remaining() < 2) return emptyList()
    val listLen = buf.short.toInt() and 0xffff
    val listEnd = minOf(end, buf.position() + listLen)
    val protocols = ArrayList<String>()
    while (buf.position() < listEnd) {
      if (buf.position() + 1 > listEnd) break
      val protocolLen = buf.get().toInt() and 0xff
      if (protocolLen <= 0 || buf.position() + protocolLen > listEnd) break
      val bytes = ByteArray(protocolLen)
      buf.get(bytes)
      val value = String(bytes, Charsets.US_ASCII).trim()
      if (value.isNotEmpty()) protocols.add(value)
    }
    if (buf.position() < end) {
      buf.position(end)
    }
    return protocols
  }

  private fun hasCompleteHandshakeMessage(data: ByteArray): Boolean {
    // Strip record headers into handshake buffer length check.
    var offset = 0
    var hsLen = 0
    val hs = ByteArrayOutputStream()
    while (offset + 5 <= data.size) {
      val length = ((data[offset + 3].toInt() and 0xff) shl 8) or (data[offset + 4].toInt() and 0xff)
      offset += 5
      val take = minOf(length, data.size - offset)
      if (take <= 0) break
      hs.write(data, offset, take)
      hsLen += take
      offset += take
      if (take < length) return false
      val bytes = hs.toByteArray()
      if (bytes.size >= 4) {
        val msgLen = ((bytes[1].toInt() and 0xff) shl 16) or
          ((bytes[2].toInt() and 0xff) shl 8) or
          (bytes[3].toInt() and 0xff)
        return bytes.size >= 4 + msgLen
      }
    }
    return false
  }

  private fun readFully(input: InputStream, buffer: ByteArray, off: Int, len: Int): Int {
    var readTotal = 0
    while (readTotal < len) {
      val n = input.read(buffer, off + readTotal, len - readTotal)
      if (n < 0) break
      readTotal += n
    }
    return readTotal
  }

  fun isIpLiteral(host: String): Boolean {
    val value = host.trim().removePrefix("[").removeSuffix("]")
    if (value.isEmpty()) return false
    if (value.contains(':')) {
      // IPv6 candidates: only hex + colon (no DNS).
      return value.all { ch ->
        ch == ':' || ch in '0'..'9' || ch in 'a'..'f' || ch in 'A'..'F'
      } && value.contains(':')
    }
    val parts = value.split('.')
    if (parts.size != 4) return false
    return parts.all { part ->
      val n = part.toIntOrNull() ?: return false
      n in 0..255 && part == n.toString()
    }
  }

  private fun tlsVersionName(major: Int, minor: Int): String {
    return when (minor) {
      0 -> "SSL 3.0"
      1 -> "TLS 1.0"
      2 -> "TLS 1.1"
      3 -> "TLS 1.2"
      4 -> "TLS 1.3"
      else -> "TLS $major.$minor"
    }
  }
}
