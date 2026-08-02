package expo.modules.lenswireproxy

import android.content.Context
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URL
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

class LocalProxyServer(
  private val context: Context,
  private val protectSocket: ((Socket) -> Boolean)? = null,
) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptPool: ExecutorService? = null
  private val relayPool: ExecutorService = Executors.newCachedThreadPool()
  private val mitmContexts = ConcurrentHashMap<String, SSLContext>()
  /**
   * Session MITM bypass: host → cause reasonCode that first triggered bypass
   * (e.g. mitm_handshake_failed, mitm_unsupported, mitm_no_request).
   */
  private val mitmBypassHosts = ConcurrentHashMap<String, String>()

  private fun addMitmBypass(host: String, cause: String) {
    mitmBypassHosts.putIfAbsent(host.lowercase(), cause)
  }

  private fun mitmBypassCause(host: String): String? = mitmBypassHosts[host.lowercase()]

  fun listMitmBypass(): List<Map<String, String>> =
    mitmBypassHosts.entries
      .sortedBy { it.key }
      .map { mapOf("host" to it.key, "cause" to it.value) }

  fun removeMitmBypass(host: String) {
    val key = host.lowercase()
    mitmBypassHosts.remove(key)
    mitmContexts.remove(key)
  }

  fun clearMitmBypass() {
    mitmBypassHosts.clear()
    mitmContexts.clear()
  }

  private fun connectUpstreamSocket(host: String, port: Int, timeoutMs: Int): Socket =
    UnderlyingNetwork.connect(host, port, timeoutMs)

  private fun applyUpstreamSocketFactory(conn: HttpURLConnection) {
    if (conn is HttpsURLConnection) {
      conn.sslSocketFactory = ProtectedSslSocketFactory(conn.connectTimeout.coerceAtLeast(1_000))
    }
  }

  /**
   * SSLSocketFactory that dials TCP via [UnderlyingNetwork] (protect + bind + scoped DNS)
   * before wrapping with the platform TLS stack.
   */
  private class ProtectedSslSocketFactory(
    private val connectTimeoutMs: Int,
  ) : SSLSocketFactory() {
    private val defaultSsl = SSLSocketFactory.getDefault() as SSLSocketFactory

    override fun getDefaultCipherSuites(): Array<String> = defaultSsl.defaultCipherSuites
    override fun getSupportedCipherSuites(): Array<String> = defaultSsl.supportedCipherSuites

    override fun createSocket(s: Socket, host: String, port: Int, autoClose: Boolean): Socket {
      UnderlyingNetwork.prepareTcpSocket(s)
      return defaultSsl.createSocket(s, host, port, autoClose)
    }

    override fun createSocket(host: String, port: Int): Socket {
      val tcp = UnderlyingNetwork.connect(host, port, connectTimeoutMs)
      return defaultSsl.createSocket(tcp, host, port, true)
    }

    override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket {
      val tcp = UnderlyingNetwork.socketFactory().createSocket(host, port, localHost, localPort)
      return defaultSsl.createSocket(tcp, host, port, true)
    }

    override fun createSocket(address: InetAddress, port: Int): Socket {
      val tcp = UnderlyingNetwork.socketFactory().createSocket(address, port)
      return defaultSsl.createSocket(tcp, address.hostAddress ?: address.hostName, port, true)
    }

    override fun createSocket(
      address: InetAddress,
      port: Int,
      localAddress: InetAddress,
      localPort: Int,
    ): Socket {
      val tcp = UnderlyingNetwork.socketFactory().createSocket(address, port, localAddress, localPort)
      return defaultSsl.createSocket(tcp, address.hostAddress ?: address.hostName, port, true)
    }
  }

  fun start(port: Int = CaptureStore.PROXY_PORT) {
    if (!running.compareAndSet(false, true)) return
    // Keep egress helper in sync when started outside VpnService (tests / probe-only).
    UnderlyingNetwork.configure(context, protectSocket)
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
    val bypassCause = mitmBypassCause(effectiveHost)
    val bypassed = bypassCause != null
    val clientHelloExpected = prefix.isNotEmpty() || headerSni != null
    val alpnOk = MitmAlpn.allowsHttp11Mitm(tlsMeta?.alpnProtocols)
    val canMitm = decryptEnabled &&
      caReady &&
      !TlsSni.isIpLiteral(effectiveHost) &&
      !bypassed &&
      clientHelloExpected &&
      alpnOk

    val reasonCode = when {
      !decryptEnabled -> "decrypt_disabled"
      !caReady -> "ca_missing"
      bypassed -> "mitm_bypassed"
      TlsSni.isIpLiteral(effectiveHost) -> "ip_no_sni"
      !clientHelloExpected -> "no_client_hello"
      !alpnOk -> "alpn_no_http11"
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
        bypassCause = if (bypassed) bypassCause else null,
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
        addMitmBypass(effectiveHost, "mitm_handshake_failed")
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
          bypassCause = "mitm_handshake_failed",
        )
        runCatching { client.close() }
      }
      is MitmOutcome.HardFailure -> {
        // Do not passthrough this socket: TLS already started; ClientHello replay would desync.
        // Unsupported protocol / post-handshake silence → bypass host so retries go tunnel-only.
        // Keep reasonCode as-is (do not remap bypassHost=false to mitm_error).
        val failReason = mitmResult.reasonCode
        if (mitmResult.bypassHost) {
          addMitmBypass(effectiveHost, failReason)
        }
        appendTunnelCapture(
          id = id,
          startedAt = startedAt,
          host = effectiveHost,
          connectHost = connectHost,
          connectPort = port,
          status = 502,
          reasonCode = failReason,
          clientAttribution = clientAttribution,
          hostnameSource = hostnameSource,
          hostnameConfidence = hostnameConfidence,
          sniHostname = sniHostname,
          tlsMeta = tlsMeta,
          clientHelloBytes = prefix.size,
          note = mitmResult.detail,
          peekBytes = mitmResult.peekBytes,
          bypassCause = if (mitmResult.bypassHost) failReason else null,
        )
        runCatching { client.close() }
      }
    }
  }

  private sealed class MitmOutcome {
    data object Success : MitmOutcome()
    data class FailOpenPassthrough(val detail: String? = null) : MitmOutcome()
    data class HandshakeRejected(val detail: String? = null) : MitmOutcome()
    class HardFailure(
      val detail: String? = null,
      val peekBytes: ByteArray? = null,
      /** True for sniff/unsupported-method/post-handshake timeout; host joins session bypass list.
       * Empty EOF after handshake does not bypass (CDN speculative connects). */
      val bypassHost: Boolean = false,
      val reasonCode: String = "mitm_unsupported",
    ) : MitmOutcome()
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
    var capturedPeek: ByteArray? = null
    var sawHttpRequest = false
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
      val negotiatedAlpn = tlsSocket.applicationProtocol
        ?.takeIf { it.isNotBlank() }
        ?: "http/1.1"

      // Early sniff: abort only on clear non-HTTP/1.1 (h2, binary, unsupported method).
      // Empty peek continues into readHttpMessage (wait for late GET). Ambiguous printable
      // fragments (e.g. partial "GET") also continue with the peek as prefix.
      val peekBytes = HttpIo.readFirstChunk(tlsSocket.inputStream)
      capturedPeek = peekBytes
      val sniff = MitmPayloadSniff.analyze(peekBytes)
      if (MitmPayloadSniff.shouldAbortMitm(sniff, peekBytes)) {
        runCatching { tlsSocket.close() }
        return MitmOutcome.HardFailure(
          detail = MitmPayloadSniff.formatDetail(sniff, peekBytes),
          peekBytes = peekBytes,
          bypassHost = true,
          reasonCode = "mitm_unsupported",
        )
      }

      var readPrefix = peekBytes
      var handledAny = false
      for (reqIndex in 0 until MITM_MAX_KEEPALIVE_REQUESTS) {
        val requestStartedAt = if (reqIndex == 0) startedAt else System.currentTimeMillis()
        val requestId = if (reqIndex == 0) id else UUID.randomUUID().toString()
        val requestData = HttpIo.readHttpMessage(tlsSocket.inputStream, readPrefix)
        readPrefix = ByteArray(0)
        if (requestData.isEmpty() || requestData.all { it == ' '.code.toByte() || it == '\t'.code.toByte() ||
            it == '\r'.code.toByte() || it == '\n'.code.toByte() }
        ) {
          if (!handledAny) {
            runCatching { tlsSocket.close() }
            return MitmOutcome.HardFailure(
              detail = "guess=empty; bytes=0; cause=eof",
              peekBytes = peekBytes,
              bypassHost = false,
              reasonCode = "mitm_no_request",
            )
          }
          break
        }

        var parsed = parseHttpRequest(requestData)
        sawHttpRequest = true
        handledAny = true
        val stripped = ClientAttributionHeaders.stripAndExtract(parsed.headers)
        parsed = parsed.copy(headers = stripped.first)
        val effectiveClientAttribution = stripped.second ?: clientAttribution
        if (!MitmPayloadSniff.isSupportedMethod(parsed.method)) {
          runCatching { tlsSocket.close() }
          return MitmOutcome.HardFailure(
            detail = MitmPayloadSniff.formatDetail(
              MitmPayloadSniff.Result(
                guess = MitmPayloadSniff.Guess.HTTP11,
                method = parsed.method,
                firstLine = sniff.firstLine,
              ),
              peekBytes,
            ),
            peekBytes = peekBytes,
            bypassHost = true,
            reasonCode = "mitm_unsupported",
          )
        }
        if (HttpUpgrade.isWebSocketUpgrade(parsed.headers)) {
          val upstreamHost = hostFromHeaders(parsed.headers) ?: mitmHost
          return relayWebSocketUpgrade(
            clientTls = tlsSocket,
            requestBytes = buildHttpRequestBytes(parsed),
            parsed = parsed,
            upstreamHost = upstreamHost,
            port = port,
            useTls = true,
            id = requestId,
            startedAt = requestStartedAt,
            connectHost = connectHost,
            clientAttribution = effectiveClientAttribution,
            hostnameSource = if (hostFromHeaders(parsed.headers) != null) "host_header" else hostnameSource,
            hostnameConfidence = if (hostFromHeaders(parsed.headers) != null) "high" else hostnameConfidence,
            sniHostname = sniHostname,
            tlsMeta = tlsMeta,
            clientHelloBytes = clientHelloBytes,
            handshakeStartMs = handshakeStartMs,
            handshakeDoneMs = handshakeDoneMs,
            mitmStartMs = mitmStartMs,
            scheme = "https",
            captureMode = "mitm",
            tlsNegotiatedAlpn = negotiatedAlpn,
          )
        }

        val keepAlive = HttpIo.clientWantsKeepAlive(parsed.headers) &&
          reqIndex < MITM_MAX_KEEPALIVE_REQUESTS - 1
        val upstreamHost = hostFromHeaders(parsed.headers) ?: mitmHost
        var overrideApplied: String? = null
        val hostHdr = hostFromHeaders(parsed.headers) != null
        val hs = if (hostHdr) "host_header" else hostnameSource
        val hc = if (hostHdr) "high" else hostnameConfidence
        val alpnList =
          if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null
        val sniPresent = tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()

        val responseRule = OverrideRules.find(
          context,
          kind = "response",
          method = parsed.method,
          scheme = "https",
          host = upstreamHost,
          path = parsed.path,
          query = parsed.query,
          requestHeaders = parsed.headers,
        )
        if (responseRule != null) {
          responseRule.applyDelay()
          val mockBody = responseRule.bodyBytes()
          val mockHeaders = responseRule.responseHeaders()
          HttpIo.writeHttpResponse(
            tlsSocket.outputStream,
            responseRule.status,
            mockHeaders,
            mockBody,
            connectionClose = !keepAlive,
          )
          val doneMs = System.currentTimeMillis()
          CaptureStore.append(
            context,
            mapOf(
              "id" to requestId,
              "startedAt" to requestStartedAt,
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
                totalMs = maxOf(1L, doneMs - requestStartedAt),
              ),
              "overrideApplied" to "response",
              "reasonCode" to "decrypted",
              "hostnameSource" to hs,
              "hostnameConfidence" to hc,
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
              "tlsAlpnProtocols" to alpnList,
              "tlsSniPresent" to sniPresent,
              "tlsNegotiatedAlpn" to negotiatedAlpn,
              "upstreamHttpVersion" to null,
            ) + ClientAttributionHeaders.asCaptureFields(effectiveClientAttribution),
          )
          if (!keepAlive) {
            runCatching { tlsSocket.close() }
            return MitmOutcome.Success
          }
          tlsSocket.soTimeout = MITM_KEEPALIVE_IDLE_MS
          continue
        }

        val requestRule = OverrideRules.find(
          context,
          kind = "request",
          method = parsed.method,
          scheme = "https",
          host = upstreamHost,
          path = parsed.path,
          query = parsed.query,
          requestHeaders = parsed.headers,
        )
        if (requestRule != null) {
          requestRule.applyDelay()
          val rewritten = OverrideRules.rewriteRequest(parsed.headers, requestRule)
          parsed = parsed.copy(headers = rewritten.first, body = rewritten.second)
          overrideApplied = "request"
        }

        val upstream = fetchHttps(upstreamHost, port, parsed)
        HttpIo.writeHttpResponse(
          tlsSocket.outputStream,
          upstream.status,
          upstream.headers,
          upstream.body,
          connectionClose = !keepAlive,
        )
        val doneMs = System.currentTimeMillis()

        CaptureStore.append(
          context,
          mapOf(
            "id" to requestId,
            "startedAt" to requestStartedAt,
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
              totalMs = maxOf(1L, doneMs - requestStartedAt),
            ),
            "overrideApplied" to overrideApplied,
            "reasonCode" to "decrypted",
            "hostnameSource" to hs,
            "hostnameConfidence" to hc,
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
            "tlsAlpnProtocols" to alpnList,
            "tlsSniPresent" to sniPresent,
            "tlsNegotiatedAlpn" to negotiatedAlpn,
            "upstreamHttpVersion" to "HTTP/1.1",
          ) + ClientAttributionHeaders.asCaptureFields(effectiveClientAttribution),
        )
        if (!keepAlive) {
          runCatching { tlsSocket.close() }
          return MitmOutcome.Success
        }
        tlsSocket.soTimeout = MITM_KEEPALIVE_IDLE_MS
      }
      runCatching { tlsSocket.close() }
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
      } else if (e is SocketTimeoutException && !sawHttpRequest) {
        // Client silent after MITM handshake — cannot fail-open this socket; bypass for retries.
        MitmOutcome.HardFailure(
          detail = "guess=empty; bytes=0; cause=timeout",
          peekBytes = capturedPeek,
          bypassHost = true,
          reasonCode = "mitm_no_request",
        )
      } else if (e is SocketTimeoutException && sawHttpRequest) {
        // Keep-alive idle timeout after at least one request — success, not an error capture.
        MitmOutcome.Success
      } else {
        MitmOutcome.HardFailure(
          detail = detail,
          peekBytes = capturedPeek,
          bypassHost = false,
          reasonCode = "mitm_error",
        )
      }
    }
  }

  companion object {
    private const val MITM_MAX_KEEPALIVE_REQUESTS = 64
    private const val MITM_KEEPALIVE_IDLE_MS = 15_000
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
    bypassCause: String? = null,
  ) {
    try {
      val upstream = connectUpstreamSocket(connectHost, port, 20_000)
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
        bypassCause = bypassCause,
      )
      relayBidirectional(client, upstream)
    } catch (e: Exception) {
      val failure = upstreamFailureDetail("tcp", connectHost, port, e)
      android.util.Log.w(
        "LenswireUpstream",
        "passthrough failed host=$displayHost connect=$connectHost:$port reason=${failure.reasonCode} ${failure.detail}",
        e,
      )
      appendTunnelCapture(
        id = id,
        startedAt = startedAt,
        host = displayHost,
        connectHost = connectHost,
        connectPort = port,
        status = 502,
        reasonCode = failure.reasonCode,
        clientAttribution = clientAttribution,
        hostnameSource = hostnameSource,
        hostnameConfidence = hostnameConfidence,
        sniHostname = sniHostname,
        tlsMeta = tlsMeta,
        clientHelloBytes = clientHelloBytes,
        note = failure.detail,
        bypassCause = bypassCause,
      )
      runCatching { client.close() }
    }
  }

  /**
   * Open upstream URL via [Proxy.NO_PROXY].
   * Plain HTTP rewrites the host to an underlying-network-resolved IP (no SocketFactory API).
   * HTTPS keeps the hostname for SNI; [ProtectedSslSocketFactory] dials via [UnderlyingNetwork].
   */
  private fun openUpstreamConnection(url: URL): java.net.URLConnection {
    if (url.protocol.equals("https", ignoreCase = true)) {
      return url.openConnection(Proxy.NO_PROXY)
    }
    val host = url.host
    val resolved = runCatching { UnderlyingNetwork.resolve(host) }.getOrNull()
      ?: return url.openConnection(Proxy.NO_PROXY)
    val ip = resolved.hostAddress ?: return url.openConnection(Proxy.NO_PROXY)
    if (host.equals(ip, ignoreCase = true)) {
      return url.openConnection(Proxy.NO_PROXY)
    }
    val port = url.port
    val path = url.file ?: "/"
    val connectUrl = if (port > 0) URL(url.protocol, ip, port, path) else URL(url.protocol, ip, path)
    android.util.Log.d("LenswireUpstream", "http open host=$host -> $ip")
    val conn = connectUrl.openConnection(Proxy.NO_PROXY)
    if (conn is HttpURLConnection) {
      val hostHeader = when {
        port > 0 && !(url.protocol == "http" && port == 80) -> "$host:$port"
        else -> host
      }
      conn.setRequestProperty("Host", hostHeader)
    }
    return conn
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
    peekBytes: ByteArray? = null,
    bypassCause: String? = null,
  ) {
    val bodyText = buildString {
      append(reasonCode)
      if (!note.isNullOrBlank()) append(": ").append(note)
    }
    val peek = peekBytes?.takeIf { it.isNotEmpty() }
    val requestBody = if (peek != null) {
      val contentType =
        if (MitmPayloadSniff.isMostlyPrintable(peek)) "text/plain" else "application/octet-stream"
      classifyBody(peek, contentType)
    } else {
      mapOf("kind" to "empty", "size" to 0)
    }
    val fields = mutableMapOf<String, Any?>(
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
      "requestBody" to requestBody,
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
      "captureSummary" to summaryForReason(reasonCode, note, bypassCause),
      "tlsClientHelloBytes" to clientHelloBytes,
      "tlsRecordVersion" to tlsMeta?.recordVersion,
      "tlsClientVersion" to tlsMeta?.clientVersion,
      "tlsAlpnProtocols" to if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null,
      "tlsSniPresent" to (tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()),
    )
    if (!bypassCause.isNullOrBlank()) {
      fields["bypassCause"] = bypassCause
    }
    CaptureStore.append(
      context,
      fields + ClientAttributionHeaders.asCaptureFields(clientAttribution),
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

    if (HttpUpgrade.isWebSocketUpgrade(headers)) {
      val parsed = ParsedRequest(
        method = method,
        path = capturePath,
        query = query,
        pathWithQuery = capturePath + if (query.isNotEmpty()) "?$query" else "",
        headers = headers,
        body = requestBody,
      )
      val upstreamPort = when {
        url.port > 0 -> url.port
        captureScheme == "https" -> 443
        else -> 80
      }
      val outcome = relayWebSocketUpgrade(
        clientTls = client,
        requestBytes = buildHttpRequestBytes(
          parsed,
          requestTarget = if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
            rawTarget
          } else {
            null
          },
        ),
        parsed = parsed,
        upstreamHost = captureHost,
        port = upstreamPort,
        useTls = captureScheme == "https",
        id = UUID.randomUUID().toString(),
        startedAt = startMs,
        connectHost = captureHost,
        clientAttribution = clientAttribution,
        hostnameSource = "host_header",
        hostnameConfidence = "high",
        sniHostname = null,
        tlsMeta = null,
        clientHelloBytes = 0,
        handshakeStartMs = startMs,
        handshakeDoneMs = startMs,
        mitmStartMs = startMs,
        scheme = captureScheme,
        captureMode = "http",
      )
      return when (outcome) {
        is MitmOutcome.Success -> 101
        else -> 502
      }
    }

    val responseRule = OverrideRules.find(
      context,
      kind = "response",
      method = method,
      scheme = captureScheme,
      host = captureHost,
      path = capturePath,
      query = query,
      requestHeaders = headers,
    )
    if (responseRule != null) {
      responseRule.applyDelay()
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
      requestHeaders = headers,
    )
    if (requestRule != null) {
      requestRule.applyDelay()
      val rewritten = OverrideRules.rewriteRequest(headers, requestRule)
      effectiveHeaders = rewritten.first
      effectiveBody = rewritten.second
      overrideApplied = "request"
    }

    return try {
      val conn = (openUpstreamConnection(url) as HttpURLConnection).apply {
        requestMethod = method
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 20_000
        doInput = true
        applyUpstreamSocketFactory(this)
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
    } catch (e: Exception) {
      val failure = upstreamFailureDetail(captureScheme, captureHost, if (url.port > 0) url.port else if (captureScheme == "https") 443 else 80, e)
      val body = "Lenswire upstream error\r\n".toByteArray()
      try {
        HttpIo.writeHttpResponse(client.getOutputStream(), 502, emptyMap(), body, statusMessage = "Bad Gateway")
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
          "status" to 502,
          "requestHeaders" to effectiveHeaders,
          "responseHeaders" to emptyMap<String, String>(),
          "requestBody" to classifyBodyWithHeaders(effectiveBody, effectiveHeaders),
          "responseBody" to classifyBody(body, "text/plain"),
          "timing" to timing(totalMs = maxOf(1L, System.currentTimeMillis() - startMs)),
          "overrideApplied" to overrideApplied,
          "reasonCode" to failure.reasonCode,
          "hostnameSource" to "host_header",
          "hostnameConfidence" to "high",
          "sniHostname" to null,
          "rawTarget" to rawTarget,
          "connectTarget" to null,
          "connectHost" to null,
          "connectPort" to null,
          "effectiveHost" to captureHost,
          "captureMode" to "http",
          "httpPayloadAvailable" to false,
          "captureSummary" to summaryForReason(failure.reasonCode, failure.detail),
        ) + ClientAttributionHeaders.asCaptureFields(clientAttribution),
      )
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

  private data class UpstreamFailureDetail(
    val reasonCode: String,
    val detail: String,
  )

private fun upstreamFailureDetail(
  scheme: String,
  host: String,
  port: Int,
  error: Exception,
): UpstreamFailureDetail {
  val className = error.javaClass.simpleName.ifBlank { error.javaClass.name }
  val message = error.message?.takeIf { it.isNotBlank() } ?: "no message"
  val lower = "$className: $message".lowercase()
  val reasonCode = when {
    lower.contains("cleartext") && lower.contains("not permitted") -> "http_cleartext_blocked"
    lower.contains("unknownhost") || lower.contains("unable to resolve host") || lower.contains("no address associated") -> "http_dns_failed"
    lower.contains("timedout") || lower.contains("timeout") -> "http_upstream_timeout"
    lower.contains("connectexception") ||
      lower.contains("econnrefused") ||
      lower.contains("network is unreachable") ||
      lower.contains("enetunreach") ||
      lower.contains("noroutetohost") -> "upstream_connect_failed"
    else -> "http_upstream_failed"
  }
  return UpstreamFailureDetail(
    reasonCode = reasonCode,
    detail = "upstream=$scheme://$host:$port; $className: $message",
  )
}

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
    val conn = (openUpstreamConnection(url) as HttpsURLConnection).apply {
      requestMethod = req.method
      instanceFollowRedirects = false
      connectTimeout = 20_000
      readTimeout = 25_000
      doInput = true
      applyUpstreamSocketFactory(this)
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

  private fun bypassCauseLabel(cause: String?): String? = when (cause) {
    "mitm_handshake_failed" -> "trust fail"
    "mitm_unsupported" -> "unsupported protocol"
    "mitm_no_request" -> "no request"
    "mitm_websocket" -> "websocket"
    null, "" -> null
    else -> cause.replace('_', ' ')
  }

  private fun summaryForReason(
    reasonCode: String,
    detail: String? = null,
    bypassCause: String? = null,
  ): String {
    val d = detail.orEmpty()
    val base = when (reasonCode) {
      "decrypted" -> "TLS decrypted via MITM; full HTTP payload available."
      "http_plain" -> "Plain HTTP capture; full request/response payload available."
      "decrypt_disabled" -> "HTTPS decrypt is disabled; connection is captured as a tunnel only."
      "ca_missing" -> "CA certificate is missing; connection is captured as a tunnel only."
      "ip_no_sni" -> "Target is an IP without SNI; connection is captured as a tunnel only."
      "no_client_hello" -> "No TLS ClientHello observed; connection is captured as a tunnel only."
      "mitm_bypassed" -> {
        val causeLabel = bypassCauseLabel(bypassCause)
        if (causeLabel != null) {
          "Session bypass ($causeLabel); connection is captured as a tunnel only. Stop VPN to clear."
        } else {
          "Host is in MITM bypass list; connection is captured as a tunnel only. Stop VPN to clear."
        }
      }
      "mitm_fail_open" -> "MITM failed; proxy switched to fail-open tunnel mode."
      "mitm_handshake_failed" -> "TLS handshake rejected (client did not trust Lenswire CA, or TLS mismatch). Host bypassed for this VPN session."
      "mitm_unsupported" -> when {
        d.contains("guess=http2", ignoreCase = true) ->
          "HTTP/2 after MITM handshake; connection closed and host bypassed for this VPN session."
        d.contains("guess=non_http", ignoreCase = true) ->
          "Non-HTTP/binary payload after MITM handshake; connection closed and host bypassed for this VPN session."
        d.contains("guess=http11", ignoreCase = true) ->
          "Unsupported HTTP method after MITM; connection closed and host bypassed for this VPN session."
        else ->
          "Unsupported protocol after MITM; connection closed and host bypassed for this VPN session."
      }
      "mitm_no_request" -> when {
        d.contains("cause=timeout", ignoreCase = true) ->
          "No HTTP request after MITM handshake (read timeout); connection closed and host bypassed for this VPN session."
        d.contains("cause=eof", ignoreCase = true) || d.contains("guess=empty", ignoreCase = true) ->
          "No HTTP request after MITM handshake (client closed); connection closed. Host was not added to session bypass."
        else ->
          "No HTTP request after MITM handshake; connection closed and host bypassed for this VPN session."
      }
      "mitm_websocket" -> "WebSocket upgrade was relayed historically; prefer websocket_relay (frames not inspected)."
      "websocket_relay" -> "WebSocket upgrade relayed to upstream; frames are not inspected."
      "mitm_error" -> "MITM proxy error after TLS handshake; connection closed (not fail-open tunnel)."
      "alpn_no_http11" -> "ClientHello ALPN has no http/1.1; connection is captured as a tunnel only."
      "upstream_connect_failed" -> "Proxy could not connect to upstream target."
      "http_upstream_failed" -> "Plain HTTP upstream request failed before any response was received."
      "http_upstream_timeout" -> "Plain HTTP upstream request timed out before any response was received."
      "http_dns_failed" -> "DNS resolution failed while connecting to upstream target."
      "http_cleartext_blocked" -> "Android cleartext policy blocked plain HTTP upstream request."
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

  /**
   * Forward a WebSocket upgrade HTTP request to upstream and bidirectional-pipe frames.
   * Does not add the host to the MITM bypass list.
   */
  private fun relayWebSocketUpgrade(
    clientTls: Socket,
    requestBytes: ByteArray,
    parsed: ParsedRequest,
    upstreamHost: String,
    port: Int,
    useTls: Boolean,
    id: String,
    startedAt: Long,
    connectHost: String,
    clientAttribution: ClientAttribution?,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    handshakeStartMs: Long,
    handshakeDoneMs: Long,
    mitmStartMs: Long,
    scheme: String,
    captureMode: String,
    tlsNegotiatedAlpn: String? = null,
  ): MitmOutcome {
    var upstream: Socket? = null
    return try {
      val tcp = connectUpstreamSocket(upstreamHost, port, 20_000)
      tcp.soTimeout = 25_000
      upstream = if (useTls) {
        val ctx = SSLContext.getDefault()
        val ssl = ctx.socketFactory.createSocket(tcp, upstreamHost, port, true) as SSLSocket
        ssl.useClientMode = true
        ssl.startHandshake()
        ssl
      } else {
        tcp
      }
      val up = upstream!!
      up.getOutputStream().write(requestBytes)
      up.getOutputStream().flush()

      val responseHeaderBytes = readHttpHeaderBlock(up.getInputStream())
      clientTls.getOutputStream().write(responseHeaderBytes)
      clientTls.getOutputStream().flush()

      val status = parseHttpStatus(responseHeaderBytes) ?: 0
      val doneMs = System.currentTimeMillis()
      CaptureStore.append(
        context,
        mapOf(
          "id" to id,
          "startedAt" to startedAt,
          "method" to parsed.method,
          "scheme" to scheme,
          "host" to upstreamHost,
          "path" to parsed.path,
          "query" to parsed.query,
          "status" to if (status > 0) status else 101,
          "requestHeaders" to parsed.headers,
          "responseHeaders" to parseResponseHeaderMap(responseHeaderBytes),
          "requestBody" to classifyBodyWithHeaders(parsed.body, parsed.headers),
          "responseBody" to classifyBody(ByteArray(0), null),
          "timing" to timing(
            tlsMs = maxOf(0L, handshakeDoneMs - handshakeStartMs).toInt(),
            totalMs = maxOf(1L, doneMs - mitmStartMs),
          ),
          "reasonCode" to "websocket_relay",
          "hostnameSource" to hostnameSource,
          "hostnameConfidence" to hostnameConfidence,
          "sniHostname" to sniHostname,
          "rawTarget" to "$connectHost:$port",
          "connectTarget" to "$connectHost:$port",
          "connectHost" to connectHost,
          "connectPort" to port,
          "effectiveHost" to upstreamHost,
          "captureMode" to captureMode,
          "httpPayloadAvailable" to false,
          "captureSummary" to summaryForReason("websocket_relay"),
          "tlsClientHelloBytes" to clientHelloBytes,
          "tlsRecordVersion" to tlsMeta?.recordVersion,
          "tlsClientVersion" to tlsMeta?.clientVersion,
          "tlsAlpnProtocols" to if (tlsMeta?.alpnProtocols?.isNotEmpty() == true) tlsMeta.alpnProtocols else null,
          "tlsSniPresent" to (tlsMeta?.sniPresent ?: !sniHostname.isNullOrBlank()),
          "tlsNegotiatedAlpn" to tlsNegotiatedAlpn,
          "upstreamHttpVersion" to "HTTP/1.1",
        ) + ClientAttributionHeaders.asCaptureFields(clientAttribution),
      )

      if (status != 0 && status != 101) {
        // Non-upgrade response: headers already forwarded; close both sides.
        runCatching { up.close() }
        runCatching { clientTls.close() }
        return MitmOutcome.Success
      }

      runCatching { clientTls.soTimeout = 0 }
      runCatching { up.soTimeout = 0 }
      relayBidirectional(clientTls, up)
      MitmOutcome.Success
    } catch (e: Exception) {
      runCatching { upstream?.close() }
      runCatching { clientTls.close() }
      android.util.Log.w("LenswireMITM", "WebSocket relay failed host=$upstreamHost: ${e.message}", e)
      MitmOutcome.HardFailure(
        detail = "${e.javaClass.simpleName}: ${e.message ?: "websocket relay failed"}",
        bypassHost = false,
        reasonCode = "mitm_error",
      )
    }
  }

  private fun buildHttpRequestBytes(parsed: ParsedRequest, requestTarget: String? = null): ByteArray {
    val target = requestTarget ?: if (parsed.pathWithQuery.startsWith("/")) {
      parsed.pathWithQuery
    } else {
      "/${parsed.pathWithQuery}"
    }
    val sb = StringBuilder()
    sb.append(parsed.method).append(' ').append(target).append(" HTTP/1.1\r\n")
    for ((key, value) in parsed.headers) {
      sb.append(key).append(": ").append(value).append("\r\n")
    }
    sb.append("\r\n")
    val headerBytes = sb.toString().toByteArray(Charsets.ISO_8859_1)
    return if (parsed.body.isEmpty()) headerBytes else headerBytes + parsed.body
  }

  private fun readHttpHeaderBlock(input: InputStream, maxBytes: Int = 65_536): ByteArray {
    val out = ByteArrayOutputStream()
    while (out.size() < maxBytes) {
      val b = input.read()
      if (b < 0) break
      out.write(b)
      val bytes = out.toByteArray()
      val n = bytes.size
      if (n >= 4 &&
        bytes[n - 4] == '\r'.code.toByte() &&
        bytes[n - 3] == '\n'.code.toByte() &&
        bytes[n - 2] == '\r'.code.toByte() &&
        bytes[n - 1] == '\n'.code.toByte()
      ) {
        break
      }
    }
    return out.toByteArray()
  }

  private fun parseHttpStatus(headerBlock: ByteArray): Int? {
    val text = String(headerBlock, Charsets.ISO_8859_1)
    val firstLine = text.substringBefore("\r\n")
    val parts = firstLine.split(' ')
    return parts.getOrNull(1)?.toIntOrNull()
  }

  private fun parseResponseHeaderMap(headerBlock: ByteArray): Map<String, String> {
    val text = String(headerBlock, Charsets.ISO_8859_1)
    val headerEnd = text.indexOf("\r\n\r\n")
    val headerText = if (headerEnd >= 0) text.substring(0, headerEnd) else text
    val out = LinkedHashMap<String, String>()
    headerText.split("\r\n").drop(1).forEach { line ->
      val idx = line.indexOf(':')
      if (idx > 0) {
        out[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
      }
    }
    return out
  }
}
