package expo.modules.lenswireproxy

import android.content.Context
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket

class LocalProxyServer(private val context: Context) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptPool: ExecutorService? = null
  private val relayPool: ExecutorService = Executors.newCachedThreadPool()
  private val mitmContexts = ConcurrentHashMap<String, SSLContext>()
  /** Hosts that rejected MITM (pinning / trust). Subsequent flows fail-open to passthrough. */
  private val mitmBypassHosts = ConcurrentHashMap.newKeySet<String>()

  fun start(port: Int = CaptureStore.PROXY_PORT) {
    if (!running.compareAndSet(false, true)) return
    val pool = Executors.newCachedThreadPool()
    acceptPool = pool
    try {
      // Only localhost: tun2socks/SOCKS already forward here; LAN must not reach MITM.
      serverSocket = ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))
    } catch (e: Exception) {
      running.set(false)
      acceptPool = null
      pool.shutdownNow()
      throw e
    }
    pool.execute {
      val server = serverSocket ?: return@execute
      while (running.get()) {
        try {
          val client = server.accept()
          pool.execute { handleClient(client) }
        } catch (_: Exception) {
          if (!running.get()) break
        }
      }
    }
  }

  fun stop() {
    running.set(false)
    try {
      serverSocket?.close()
    } catch (_: Exception) {
    }
    serverSocket = null
    acceptPool?.shutdownNow()
    acceptPool = null
    relayPool.shutdownNow()
    mitmBypassHosts.clear()
    mitmContexts.clear()
  }

  /** Drop cached MITM SSL contexts (and session bypass) after CA regenerate. */
  fun clearMitmState() {
    mitmContexts.clear()
    mitmBypassHosts.clear()
  }

  private fun handleClient(client: Socket) {
    try {
      client.soTimeout = 20_000
      val input = client.getInputStream()
      val headerBytes = HttpIo.readUntilHeaderEnd(input)
      if (headerBytes.isEmpty()) {
        client.close()
        return
      }
      val headerText = String(headerBytes, Charsets.ISO_8859_1)
      val lines = headerText.split("\r\n")
      val requestLine = lines.firstOrNull() ?: run {
        client.close()
        return
      }
      val parts = requestLine.split(" ")
      if (parts.size < 2) {
        client.close()
        return
      }
      val method = parts[0]
      val target = parts[1]
      val headers = LinkedHashMap<String, String>()
      lines.drop(1).forEach { line ->
        if (line.isEmpty()) return@forEach
        val idx = line.indexOf(':')
        if (idx > 0) {
          headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
        }
      }
      val requestBody = HttpIo.readRequestBody(input, headers)

      val id = UUID.randomUUID().toString()
      val startedAt = System.currentTimeMillis()

      val (sanitizedHeaders, clientAttribution) = ClientAttributionHeaders.stripAndExtract(headers)

      if (method == "CONNECT") {
        handleConnect(target, sanitizedHeaders, clientAttribution, client, id, startedAt)
        return
      }

      var host = "unknown"
      var path = "/"
      var scheme = "http"
      var query = ""
      val upstreamUrl = when {
        target.startsWith("http://") || target.startsWith("https://") -> {
          val uri = URI(target)
          host = uri.host ?: headers["Host"]?.substringBefore(':') ?: "unknown"
          path = uri.path.ifEmpty { "/" }
          scheme = uri.scheme ?: "http"
          query = uri.query ?: ""
          URL(target)
        }
        else -> {
          path = target.substringBefore('?').ifEmpty { "/" }
          query = target.substringAfter('?', missingDelimiterValue = "")
          host = headers["Host"]?.substringBefore(':') ?: "unknown"
          scheme = "http"
          URL("http://$host$path" + if (query.isNotEmpty()) "?$query" else "")
        }
      }

      forwardHttp(
        method = method,
        rawTarget = target,
        url = upstreamUrl,
        scheme = scheme,
        host = host,
        path = path,
        query = query,
        headers = sanitizedHeaders,
        clientAttribution = clientAttribution,
        requestBody = requestBody,
        client = client,
      )
    } catch (_: Exception) {
      try {
        client.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun handleConnect(
    target: String,
    headers: Map<String, String>,
    clientAttribution: ClientAttribution?,
    client: Socket,
    id: String,
    startedAt: Long,
  ) {
    val hostPort = target.split(":")
    val connectHost = hostPort.firstOrNull() ?: "unknown"
    val port = hostPort.getOrNull(1)?.toIntOrNull() ?: 443
    val headerSni = headers.entries
      .firstOrNull { it.key.equals("X-Lenswire-SNI", true) }
      ?.value
      ?.trim()
      ?.takeIf { it.isNotEmpty() }

    val out = client.getOutputStream()
    out.write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray(Charsets.ISO_8859_1))
    out.flush()

    // Always buffer ClientHello after 200 for PrefixedSocket replay.
    // SOCKS bridge peeks SNI first, then replays ClientHello here after our 200 —
    // skipping the peek (empty prefix) races the bidirectional relay and breaks MITM.
    client.soTimeout = 12_000
    val peek = try {
      TlsSni.peekClientHello(client.getInputStream())
    } catch (_: Exception) {
      TlsSni.PeekResult(ByteArray(0), headerSni)
    }
    val sniHostname = peek.sniHostname ?: headerSni
    val prefix = peek.bytes
    val tlsMeta = peek.meta

    val connectIsIp = TlsSni.isIpLiteral(connectHost)
    val (effectiveHost, hostnameSource, hostnameConfidence) = when {
      !sniHostname.isNullOrBlank() -> Triple(
        sniHostname,
        "sni",
        "high",
      )
      !connectIsIp -> Triple(connectHost, "connect", "medium")
      else -> Triple(connectHost, "ip", "low")
    }

    val decryptEnabled = httpsDecryptEnabled()
    val caReady = CertificateManager.loadCa(context) != null
    val bypassed = mitmBypassHosts.contains(effectiveHost.lowercase())
    val clientHelloExpected = prefix.isNotEmpty() || headerSni != null
    val canMitm = decryptEnabled &&
      caReady &&
      !TlsSni.isIpLiteral(effectiveHost) &&
      !bypassed &&
      clientHelloExpected

    val reasonCode = when {
      !decryptEnabled -> "decrypt_disabled"
      !caReady -> "ca_missing"
      bypassed -> "mitm_bypassed"
      TlsSni.isIpLiteral(effectiveHost) -> "ip_no_sni"
      !clientHelloExpected -> "no_client_hello"
      else -> null
    }

    if (!canMitm) {
      runPassthrough(
        connectHost = connectHost,
        displayHost = effectiveHost,
        port = port,
        client = client,
        prefix = prefix,
        id = id,
        startedAt = startedAt,
        reasonCode = reasonCode ?: "passthrough",
        clientAttribution = clientAttribution,
        hostnameSource = hostnameSource,
        hostnameConfidence = hostnameConfidence,
        sniHostname = sniHostname,
        tlsMeta = tlsMeta,
        clientHelloBytes = prefix.size,
      )
      return
    }

    val mitmResult = runMitm(
      mitmHost = effectiveHost,
      connectHost = connectHost,
      port = port,
      client = client,
      prefix = prefix,
      id = id,
      startedAt = startedAt,
      clientAttribution = clientAttribution,
      hostnameSource = hostnameSource,
      hostnameConfidence = hostnameConfidence,
      sniHostname = sniHostname,
      tlsMeta = tlsMeta,
      clientHelloBytes = prefix.size,
    )

    when (mitmResult) {
      is MitmOutcome.Success -> Unit
      is MitmOutcome.FailOpenPassthrough -> {
        // Safe only before any MITM TLS bytes were sent to the client.
        runPassthrough(
          connectHost = connectHost,
          displayHost = effectiveHost,
          port = port,
          client = client,
          prefix = prefix,
          id = id,
          startedAt = startedAt,
          reasonCode = "mitm_fail_open",
          clientAttribution = clientAttribution,
          hostnameSource = hostnameSource,
          hostnameConfidence = hostnameConfidence,
          sniHostname = sniHostname,
          tlsMeta = tlsMeta,
          clientHelloBytes = prefix.size,
          detail = mitmResult.detail,
        )
      }
      is MitmOutcome.HandshakeRejected -> {
        // Client already saw (or rejected) our MITM cert — ClientHello replay is impossible.
        mitmBypassHosts.add(effectiveHost.lowercase())
        appendTunnelCapture(
          id = id,
          startedAt = startedAt,
          host = effectiveHost,
          connectHost = connectHost,
          connectPort = port,
          status = 502,
          reasonCode = "mitm_handshake_failed",
          clientAttribution = clientAttribution,
          hostnameSource = hostnameSource,
          hostnameConfidence = hostnameConfidence,
          sniHostname = sniHostname,
          tlsMeta = tlsMeta,
          clientHelloBytes = prefix.size,
          note = mitmResult.detail,
        )
        runCatching { client.close() }
      }
      is MitmOutcome.HardFailure -> {
        // Do not bypass: next connection may still be HTTP/1.1 and decrypt fine.
        // Do not passthrough: TLS already started; raw ClientHello replay would desync.
        appendTunnelCapture(
          id = id,
          startedAt = startedAt,
          host = effectiveHost,
          connectHost = connectHost,
          connectPort = port,
          status = 502,
          reasonCode = "mitm_error",
          clientAttribution = clientAttribution,
          hostnameSource = hostnameSource,
          hostnameConfidence = hostnameConfidence,
          sniHostname = sniHostname,
          tlsMeta = tlsMeta,
          clientHelloBytes = prefix.size,
          note = mitmResult.detail,
        )
        runCatching { client.close() }
      }
    }
  }

  private sealed class MitmOutcome {
    data object Success : MitmOutcome()
    data class FailOpenPassthrough(val detail: String? = null) : MitmOutcome()
    data class HandshakeRejected(val detail: String? = null) : MitmOutcome()
    data class HardFailure(val detail: String? = null) : MitmOutcome()
  }

  private fun runMitm(
    mitmHost: String,
    connectHost: String,
    port: Int,
    client: Socket,
    prefix: ByteArray,
    id: String,
    startedAt: Long,
    clientAttribution: ClientAttribution?,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
  ): MitmOutcome {
    val mitmStartMs = System.currentTimeMillis()
    var handshakeStarted = false
    var socket: SSLSocket? = null
    return try {
      val handshakeStartMs = System.currentTimeMillis()
      val sslContext = getOrCreateMitmContext(mitmHost)
      val socketBase = if (prefix.isNotEmpty()) PrefixedSocket(client, prefix) else client
      socket = sslContext.socketFactory
        .createSocket(socketBase, mitmHost, port, true) as SSLSocket
      val tlsSocket = socket!!
      tlsSocket.useClientMode = false
      tlsSocket.soTimeout = 25_000
      runCatching {
        tlsSocket.enabledProtocols = tlsSocket.supportedProtocols
          .filter { it == "TLSv1.3" || it == "TLSv1.2" }
          .toTypedArray()
          .ifEmpty { tlsSocket.enabledProtocols }
      }
      runCatching {
        val params = tlsSocket.sslParameters
        params.applicationProtocols = arrayOf("http/1.1")
        tlsSocket.sslParameters = params
      }
      handshakeStarted = true
      tlsSocket.startHandshake()
      val handshakeDoneMs = System.currentTimeMillis()

      val requestData = HttpIo.readHttpMessage(tlsSocket)
      var parsed = parseHttpRequest(requestData)
      val stripped = ClientAttributionHeaders.stripAndExtract(parsed.headers)
      parsed = parsed.copy(headers = stripped.first)
      val effectiveClientAttribution = stripped.second ?: clientAttribution
      if (!isSupportedMethod(parsed.method)) {
        throw IllegalStateException("Unsupported HTTPS request method/protocol: ${parsed.method}")
      }
      val upstreamHost = hostFromHeaders(parsed.headers) ?: mitmHost
      var overrideApplied: String? = null

      val responseRule = OverrideRules.find(
        context,
        kind = "response",
        method = parsed.method,
        scheme = "https",
        host = upstreamHost,
        path = parsed.path,
        query = parsed.query,
      )
      if (responseRule != null) {
        val mockBody = responseRule.bodyBytes()
        val mockHeaders = responseRule.responseHeaders()
        HttpIo.writeHttpResponse(tlsSocket.outputStream, responseRule.status, mockHeaders, mockBody)
        tlsSocket.close()
        val doneMs = System.currentTimeMillis()
        CaptureStore.append(
          context,
          mapOf(
            "id" to id,
            "startedAt" to startedAt,
            "method" to parsed.method,
            "scheme" to "https",
            "host" to upstreamHost,
            "path" to parsed.path,
            "query" to parsed.query,
            "status" to responseRule.status,
            "requestHeaders" to parsed.headers,
            "responseHeaders" to mockHeaders,
            "requestBody" to classifyBodyWithHeaders(parsed.body, parsed.headers),
            "responseBody" to classifyBody(mockBody, responseRule.contentType.ifBlank { null }),
            "timing" to timing(
              tlsMs = maxOf(0L, handshakeDoneMs - handshakeStartMs).toInt(),
              totalMs = maxOf(1L, doneMs - mitmStartMs),
            ),
            "overrideApplied" to "response",
            "reasonCode" to "decrypted",
            "hostnameSource" to if (hostFromHeaders(parsed.headers) != null) "host_header" else hostnameSource,
            "hostnameConfidence" to if (hostFromHeaders(parsed.headers) != null) "high" else hostnameConfidence,
            "sniHostname" to sniHostname,
            "rawTarget" to "$connectHost:$port",
            "connectTarget" to "$connectHost:$port",
            "connectHost" to connectHost,
            "connectPort" to port,
            "effectiveHost" to upstreamHost,
            "captureMode" to "mitm",
            "httpPayloadAvailable" to true,
            "captureSummary" to "Response overridden (full mock); upstream not contacted.",
            "tlsClientHelloBytes" to clientHelloBytes,
            "tlsRecordVersion" to tlsMeta?.recordVersion,
            "tlsClientVersion" to tlsMeta?.clientVersion,
            "tlsAlpnProtocols" to if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null,
            "tlsSniPresent" to (tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()),
          ) + ClientAttributionHeaders.asCaptureFields(effectiveClientAttribution),
        )
        return MitmOutcome.Success
      }

      val requestRule = OverrideRules.find(
        context,
        kind = "request",
        method = parsed.method,
        scheme = "https",
        host = upstreamHost,
        path = parsed.path,
        query = parsed.query,
      )
      if (requestRule != null) {
        val rewritten = OverrideRules.rewriteRequest(parsed.headers, requestRule)
        parsed = parsed.copy(headers = rewritten.first, body = rewritten.second)
        overrideApplied = "request"
      }

      val upstream = fetchHttps(upstreamHost, port, parsed)
      HttpIo.writeHttpResponse(tlsSocket.outputStream, upstream.status, upstream.headers, upstream.body)
      tlsSocket.close()
      val doneMs = System.currentTimeMillis()

      CaptureStore.append(
        context,
        mapOf(
          "id" to id,
          "startedAt" to startedAt,
          "method" to parsed.method,
          "scheme" to "https",
          "host" to upstreamHost,
          "path" to parsed.path,
          "query" to parsed.query,
          "status" to upstream.status,
          "requestHeaders" to parsed.headers,
          "responseHeaders" to upstream.headers,
          "requestBody" to classifyBodyWithHeaders(parsed.body, parsed.headers),
          "responseBody" to classifyBodyWithHeaders(upstream.body, upstream.headers),
          "timing" to timing(
            connectMs = maxOf(0, upstream.totalMs - upstream.ttfbMs - upstream.downloadMs),
            tlsMs = maxOf(0L, handshakeDoneMs - handshakeStartMs).toInt(),
            ttfbMs = upstream.ttfbMs,
            downloadMs = upstream.downloadMs,
            totalMs = maxOf(1L, doneMs - mitmStartMs),
          ),
          "overrideApplied" to overrideApplied,
          "reasonCode" to "decrypted",
          "hostnameSource" to if (hostFromHeaders(parsed.headers) != null) "host_header" else hostnameSource,
          "hostnameConfidence" to if (hostFromHeaders(parsed.headers) != null) "high" else hostnameConfidence,
          "sniHostname" to sniHostname,
          "rawTarget" to "$connectHost:$port",
          "connectTarget" to "$connectHost:$port",
          "connectHost" to connectHost,
          "connectPort" to port,
          "effectiveHost" to upstreamHost,
          "captureMode" to "mitm",
          "httpPayloadAvailable" to true,
          "captureSummary" to if (overrideApplied == "request") {
            "Request body overridden before upstream; TLS decrypted via MITM."
          } else {
            "TLS decrypted via MITM; full HTTP payload available."
          },
          "tlsClientHelloBytes" to clientHelloBytes,
          "tlsRecordVersion" to tlsMeta?.recordVersion,
          "tlsClientVersion" to tlsMeta?.clientVersion,
          "tlsAlpnProtocols" to if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null,
          "tlsSniPresent" to (tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()),
        ) + ClientAttributionHeaders.asCaptureFields(effectiveClientAttribution),
      )
      MitmOutcome.Success
    } catch (e: Exception) {
      runCatching { socket?.close() }
      if (handshakeStarted) {
        runCatching { client.close() }
      }
      val detail = "${e.javaClass.simpleName}: ${e.message ?: "no message"}"
      android.util.Log.w("LenswireMITM", "MITM failed host=$mitmHost handshakeStarted=$handshakeStarted $detail", e)
      if (!handshakeStarted) {
        MitmOutcome.FailOpenPassthrough(detail)
      } else if (isTlsHandshakeFailure(e)) {
        MitmOutcome.HandshakeRejected(detail)
      } else {
        MitmOutcome.HardFailure(detail)
      }
    }
  }

  private fun runPassthrough(
    connectHost: String,
    displayHost: String,
    port: Int,
    client: Socket,
    prefix: ByteArray,
    id: String,
    startedAt: Long,
    reasonCode: String,
    clientAttribution: ClientAttribution?,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    detail: String? = null,
  ) {
    try {
      val upstream = Socket(connectHost, port)
      upstream.soTimeout = 25_000
      if (prefix.isNotEmpty()) {
        upstream.getOutputStream().write(prefix)
        upstream.getOutputStream().flush()
      }
      appendTunnelCapture(
        id = id,
        startedAt = startedAt,
        host = displayHost,
        connectHost = connectHost,
        connectPort = port,
        status = 200,
        reasonCode = reasonCode,
        clientAttribution = clientAttribution,
        hostnameSource = hostnameSource,
        hostnameConfidence = hostnameConfidence,
        sniHostname = sniHostname,
        tlsMeta = tlsMeta,
        clientHelloBytes = clientHelloBytes,
        note = detail,
      )
      relayBidirectional(client, upstream)
    } catch (e: Exception) {
      appendTunnelCapture(
        id = id,
        startedAt = startedAt,
        host = displayHost,
        connectHost = connectHost,
        connectPort = port,
        status = 502,
        reasonCode = "upstream_connect_failed",
        clientAttribution = clientAttribution,
        hostnameSource = hostnameSource,
        hostnameConfidence = hostnameConfidence,
        sniHostname = sniHostname,
        tlsMeta = tlsMeta,
        clientHelloBytes = clientHelloBytes,
        note = e.message,
      )
      runCatching { client.close() }
    }
  }

  private fun appendTunnelCapture(
    id: String,
    startedAt: Long,
    host: String,
    connectHost: String,
    connectPort: Int,
    status: Int,
    reasonCode: String,
    clientAttribution: ClientAttribution?,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    note: String?,
  ) {
    val bodyText = buildString {
      append(reasonCode)
      if (!note.isNullOrBlank()) append(": ").append(note)
    }
    CaptureStore.append(
      context,
      mapOf(
        "id" to id,
        "startedAt" to startedAt,
        "method" to "CONNECT",
        "scheme" to "https",
        "host" to host,
        "path" to "/",
        "query" to "",
        "status" to status,
        "requestHeaders" to emptyMap<String, String>(),
        "responseHeaders" to emptyMap<String, String>(),
        "requestBody" to mapOf("kind" to "empty", "size" to 0),
        "responseBody" to classifyBody(bodyText.toByteArray(), "text/plain"),
        "timing" to timing(totalMs = maxOf(1L, System.currentTimeMillis() - startedAt)),
        "reasonCode" to reasonCode,
        "hostnameSource" to hostnameSource,
        "hostnameConfidence" to hostnameConfidence,
        "sniHostname" to sniHostname,
        "rawTarget" to "$connectHost:$connectPort",
        "connectTarget" to "$connectHost:$connectPort",
        "connectHost" to connectHost,
        "connectPort" to connectPort,
        "effectiveHost" to host,
        "captureMode" to "tunnel",
        "httpPayloadAvailable" to false,
        "captureSummary" to summaryForReason(reasonCode, note),
        "tlsClientHelloBytes" to clientHelloBytes,
        "tlsRecordVersion" to tlsMeta?.recordVersion,
        "tlsClientVersion" to tlsMeta?.clientVersion,
        "tlsAlpnProtocols" to if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null,
        "tlsSniPresent" to (tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()),
      ) + ClientAttributionHeaders.asCaptureFields(clientAttribution),
    )
  }

  private fun forwardHttp(
    method: String,
    rawTarget: String,
    url: URL,
    scheme: String,
    host: String,
    path: String,
    query: String,
    headers: Map<String, String>,
    clientAttribution: ClientAttribution?,
    requestBody: ByteArray,
    client: Socket,
  ): Int {
    val startMs = System.currentTimeMillis()
    val captureHost = host.ifBlank { url.host ?: "unknown" }
    val capturePath = path.ifEmpty { "/" }
    val captureScheme = if (scheme == "https") "https" else "http"

    val responseRule = OverrideRules.find(
      context,
      kind = "response",
      method = method,
      scheme = captureScheme,
      host = captureHost,
      path = capturePath,
      query = query,
    )
    if (responseRule != null) {
      val mockBody = responseRule.bodyBytes()
      val mockHeaders = responseRule.responseHeaders()
      try {
        HttpIo.writeHttpResponse(client.getOutputStream(), responseRule.status, mockHeaders, mockBody)
        client.close()
      } catch (_: Exception) {
      }
      CaptureStore.append(
        context,
        mapOf(
          "id" to UUID.randomUUID().toString(),
          "startedAt" to System.currentTimeMillis(),
          "method" to method,
          "scheme" to captureScheme,
          "host" to captureHost,
          "path" to capturePath,
          "query" to query,
          "status" to responseRule.status,
          "requestHeaders" to headers,
          "responseHeaders" to mockHeaders,
          "requestBody" to classifyBodyWithHeaders(requestBody, headers),
          "responseBody" to classifyBody(mockBody, responseRule.contentType.ifBlank { null }),
          "timing" to timing(totalMs = maxOf(1L, System.currentTimeMillis() - startMs)),
          "overrideApplied" to "response",
          "reasonCode" to "http_plain",
          "hostnameSource" to "host_header",
          "hostnameConfidence" to "high",
          "sniHostname" to null,
          "rawTarget" to rawTarget,
          "connectTarget" to null,
          "connectHost" to null,
          "connectPort" to null,
          "effectiveHost" to captureHost,
          "captureMode" to "http",
          "httpPayloadAvailable" to true,
          "captureSummary" to "Response overridden (full mock); upstream not contacted.",
        ) + ClientAttributionHeaders.asCaptureFields(clientAttribution),
      )
      return responseRule.status
    }

    var effectiveHeaders = headers
    var effectiveBody = requestBody
    var overrideApplied: String? = null
    val requestRule = OverrideRules.find(
      context,
      kind = "request",
      method = method,
      scheme = captureScheme,
      host = captureHost,
      path = capturePath,
      query = query,
    )
    if (requestRule != null) {
      val rewritten = OverrideRules.rewriteRequest(headers, requestRule)
      effectiveHeaders = rewritten.first
      effectiveBody = rewritten.second
      overrideApplied = "request"
    }

    return try {
      val conn = (url.openConnection(Proxy.NO_PROXY) as HttpURLConnection).apply {
        requestMethod = method
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 20_000
        doInput = true
        effectiveHeaders.forEach { (k, v) ->
          if (
            !k.equals("Proxy-Connection", true) &&
            !k.equals("Connection", true) &&
            !k.equals("Content-Length", true) &&
            !k.equals("Transfer-Encoding", true)
          ) {
            setRequestProperty(k, v)
          }
        }
        if (effectiveBody.isNotEmpty()) {
          doOutput = true
        }
      }
      try {
        if (effectiveBody.isNotEmpty()) {
          conn.outputStream.use { it.write(effectiveBody) }
        }
        val requestWrittenMs = System.currentTimeMillis()
        val code = conn.responseCode
        val headersMs = System.currentTimeMillis()
        val bodyStream = try {
          conn.inputStream
        } catch (_: Exception) {
          conn.errorStream
        }
        val body = bodyStream?.let { HttpIo.readBounded(it) } ?: ByteArray(0)
        val bodyDoneMs = System.currentTimeMillis()
        HttpIo.writeHttpResponse(
          client.getOutputStream(),
          code,
          responseHeaders(conn),
          body,
          statusMessage = conn.responseMessage,
        )
        client.close()
        CaptureStore.append(
          context,
          mapOf(
            "id" to UUID.randomUUID().toString(),
            "startedAt" to System.currentTimeMillis(),
            "method" to method,
            "scheme" to captureScheme,
            "host" to captureHost,
            "path" to capturePath,
            "query" to query,
            "status" to code,
            "requestHeaders" to effectiveHeaders,
            "responseHeaders" to responseHeaders(conn),
            "requestBody" to classifyBodyWithHeaders(effectiveBody, effectiveHeaders),
            "responseBody" to classifyBodyWithHeaders(body, responseHeaders(conn)),
            "timing" to timing(
              connectMs = maxOf(0L, requestWrittenMs - startMs).toInt(),
              ttfbMs = maxOf(0L, headersMs - requestWrittenMs).toInt(),
              downloadMs = maxOf(0L, bodyDoneMs - headersMs).toInt(),
              totalMs = maxOf(1L, bodyDoneMs - startMs),
            ),
            "overrideApplied" to overrideApplied,
            "reasonCode" to "http_plain",
            "hostnameSource" to "host_header",
            "hostnameConfidence" to "high",
            "sniHostname" to null,
            "rawTarget" to rawTarget,
            "connectTarget" to null,
            "connectHost" to null,
            "connectPort" to null,
            "effectiveHost" to captureHost,
            "captureMode" to "http",
            "httpPayloadAvailable" to true,
            "captureSummary" to if (overrideApplied == "request") {
              "Request body overridden before upstream; plain HTTP capture."
            } else {
              "Plain HTTP capture; full request/response payload available."
            },
          ) + ClientAttributionHeaders.asCaptureFields(clientAttribution),
        )
        code
      } finally {
        runCatching { conn.disconnect() }
      }
    } catch (_: Exception) {
      val body = "Lenswire upstream error\r\n".toByteArray()
      try {
        HttpIo.writeHttpResponse(client.getOutputStream(), 502, emptyMap(), body, statusMessage = "Bad Gateway")
        client.close()
      } catch (_: Exception) {
      }
      502
    }
  }

  private data class ParsedRequest(
    val method: String,
    val path: String,
    val query: String,
    val pathWithQuery: String,
    val headers: Map<String, String>,
    val body: ByteArray,
  )

  private data class UpstreamResponse(
    val status: Int,
    val headers: Map<String, String>,
    val body: ByteArray,
    val ttfbMs: Int,
    val downloadMs: Int,
    val totalMs: Int,
  )

  private fun parseHttpRequest(data: ByteArray): ParsedRequest {
    val text = String(data, Charsets.ISO_8859_1)
    val headerEnd = text.indexOf("\r\n\r\n")
    val headerText = if (headerEnd >= 0) text.substring(0, headerEnd) else text
    val body = if (headerEnd >= 0) data.copyOfRange(headerEnd + 4, data.size) else ByteArray(0)
    val lines = headerText.split("\r\n")
    val requestLine = lines.firstOrNull() ?: "GET / HTTP/1.1"
    val parts = requestLine.split(" ")
    val method = parts.getOrNull(0)?.uppercase() ?: "GET"
    val pathWithQuery = parts.getOrNull(1)?.ifEmpty { "/" } ?: "/"
    val path = pathWithQuery.substringBefore('?').ifEmpty { "/" }
    val query = pathWithQuery.substringAfter('?', "")
    val headers = LinkedHashMap<String, String>()
    lines.drop(1).forEach { line ->
      val idx = line.indexOf(':')
      if (idx > 0) headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
    }
    val decodedBody = if (HttpIo.isChunked(headers)) HttpIo.decodeChunkedBody(body) ?: body else body
    return ParsedRequest(method, path, query, pathWithQuery, headers, decodedBody)
  }

  private fun fetchHttps(host: String, port: Int, req: ParsedRequest): UpstreamResponse {
    val startMs = System.currentTimeMillis()
    val pathWithQuery = if (req.pathWithQuery.startsWith("/")) req.pathWithQuery else "/${req.pathWithQuery}"
    val url = URL("https", host, if (port == 443) -1 else port, pathWithQuery)
    val conn = (url.openConnection(Proxy.NO_PROXY) as HttpsURLConnection).apply {
      requestMethod = req.method
      instanceFollowRedirects = false
      connectTimeout = 20_000
      readTimeout = 25_000
      doInput = true
      if (req.body.isNotEmpty()) {
        doOutput = true
      }
      req.headers.forEach { (k, v) ->
        val lower = k.lowercase()
        if (
          lower == "proxy-connection" ||
          lower == "connection" ||
          lower == "content-length" ||
          lower == "transfer-encoding" ||
          lower == "host"
        ) {
          return@forEach
        }
        setRequestProperty(k, v)
      }
    }
    try {
      if (req.body.isNotEmpty()) {
        conn.outputStream.use { it.write(req.body) }
      }
      val requestWrittenMs = System.currentTimeMillis()
      val status = conn.responseCode
      val headersMs = System.currentTimeMillis()
      val resBody = try {
        conn.inputStream?.let { HttpIo.readBounded(it) } ?: ByteArray(0)
      } catch (_: Exception) {
        conn.errorStream?.let { HttpIo.readBounded(it) } ?: ByteArray(0)
      }
      val bodyDoneMs = System.currentTimeMillis()
      return UpstreamResponse(
        status = status,
        headers = responseHeaders(conn),
        body = resBody,
        ttfbMs = maxOf(0L, headersMs - requestWrittenMs).toInt(),
        downloadMs = maxOf(0L, bodyDoneMs - headersMs).toInt(),
        totalMs = maxOf(1L, bodyDoneMs - startMs).toInt(),
      )
    } finally {
      runCatching { conn.disconnect() }
    }
  }

  private fun responseHeaders(conn: HttpURLConnection): Map<String, String> {
    val out = LinkedHashMap<String, String>()
    conn.headerFields.forEach { (key, values) ->
      if (key == null || values.isNullOrEmpty()) return@forEach
      out[key] = values.joinToString(", ")
    }
    return out
  }

  private fun hostFromHeaders(headers: Map<String, String>): String? {
    val hostHeader = headers.entries.firstOrNull { it.key.equals("Host", true) }?.value ?: return null
    val trimmed = hostHeader.trim()
    if (trimmed.isEmpty()) return null
    if (trimmed.startsWith("[")) {
      val end = trimmed.indexOf(']')
      if (end > 0) return trimmed.substring(1, end)
    }
    return trimmed.substringBefore(':').ifEmpty { null }
  }

  private fun createServerSslContext(host: String): SSLContext? {
    val keyStore = CertificateManager.leafKeyStore(context, host) ?: return null
    val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
    kmf.init(keyStore, CertificateManager.leafPassword())
    // Prefer TLSv1.3 when available; always keep TLSv1.2 for older clients.
    val context = runCatching { SSLContext.getInstance("TLSv1.3") }
      .getOrElse { SSLContext.getInstance("TLS") }
    context.init(kmf.keyManagers, null, null)
    return context
  }

  @Synchronized
  private fun getOrCreateMitmContext(host: String): SSLContext {
    val key = host.lowercase()
    val existing = mitmContexts[key]
    if (existing != null) return existing
    val created = createServerSslContext(host) ?: throw IllegalStateException("Failed to create cert")
    mitmContexts[key] = created
    return created
  }

  private fun httpsDecryptEnabled(): Boolean {
    return context
      .getSharedPreferences("lenswire_settings", Context.MODE_PRIVATE)
      .getBoolean("httpsDecrypt", true)
  }

  private fun isTlsHandshakeFailure(error: Exception): Boolean {
    // Do NOT match generic "protocol" — that false-positives HTTP/2 "Unsupported … method/protocol".
    val message = (error.message ?: "").lowercase()
    val name = error.javaClass.name.lowercase()
    if (message.contains("unsupported https request method")) return false
    return name.contains("ssl") ||
      name.contains("certificate") ||
      message.contains("handshake") ||
      message.contains("certificate") ||
      message.contains("trust anchor") ||
      message.contains("trustmanager") ||
      message.contains("sslv") ||
      message.contains("pkix") ||
      message.contains("certpath")
  }

  private fun summaryForReason(reasonCode: String, detail: String? = null): String {
    val base = when (reasonCode) {
      "decrypted" -> "TLS decrypted via MITM; full HTTP payload available."
      "http_plain" -> "Plain HTTP capture; full request/response payload available."
      "decrypt_disabled" -> "HTTPS decrypt is disabled; connection is captured as a tunnel only."
      "ca_missing" -> "CA certificate is missing; connection is captured as a tunnel only."
      "ip_no_sni" -> "Target is an IP without SNI; connection is captured as a tunnel only."
      "no_client_hello" -> "No TLS ClientHello observed; connection is captured as a tunnel only."
      "mitm_bypassed" -> "Host is in MITM bypass list; connection is captured as a tunnel only. Stop VPN to clear."
      "mitm_fail_open" -> "MITM failed; proxy switched to fail-open tunnel mode."
      "mitm_handshake_failed" -> "TLS handshake rejected (client did not trust Lenswire CA, or TLS mismatch). Host bypassed for this VPN session."
      "mitm_error" -> "MITM proxy error after TLS handshake; connection closed (not fail-open tunnel)."
      "upstream_connect_failed" -> "Proxy could not connect to upstream target."
      "passthrough" -> "HTTPS passthrough tunnel; HTTP payload is unavailable."
      else -> reasonCode.replace('_', ' ')
    }
    return if (detail.isNullOrBlank()) base else "$base\n$detail"
  }

  private fun classifyBody(
    body: ByteArray,
    contentType: String?,
    contentEncoding: String? = null,
  ): Map<String, Any?> {
    return CaptureFormatting.classifyBody(body, contentType, contentEncoding)
  }

  private fun headerValue(headers: Map<String, String>, name: String): String? =
    headers.entries.firstOrNull { it.key.equals(name, true) }?.value

  private fun classifyBodyWithHeaders(body: ByteArray, headers: Map<String, String>): Map<String, Any?> =
    classifyBody(body, headerValue(headers, "Content-Type"), headerValue(headers, "Content-Encoding"))


  private fun timing(
    dnsMs: Int = 0,
    connectMs: Int = 0,
    tlsMs: Int = 0,
    ttfbMs: Int = 0,
    downloadMs: Int = 0,
    totalMs: Long = 0,
  ): Map<String, Int> = CaptureFormatting.timing(
    dnsMs = dnsMs,
    connectMs = connectMs,
    tlsMs = tlsMs,
    ttfbMs = ttfbMs,
    downloadMs = downloadMs,
    totalMs = totalMs,
  )

  private fun relayBidirectional(left: Socket, right: Socket) {
    val closeBoth = {
      runCatching { left.close() }
      runCatching { right.close() }
    }
    relayPool.execute {
      HttpIo.relay(left, right)
      closeBoth()
    }
    relayPool.execute {
      HttpIo.relay(right, left)
      closeBoth()
    }
  }

  private fun isSupportedMethod(method: String): Boolean {
    return method == "GET" ||
      method == "POST" ||
      method == "PUT" ||
      method == "PATCH" ||
      method == "DELETE" ||
      method == "HEAD" ||
      method == "OPTIONS"
  }
}
