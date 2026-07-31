import Foundation
import Network

// Keep in sync with targets/network-packet-tunnel/LocalProxyServer.swift
final class LocalProxyServer {
  private static let maxHttpMessageBytes = 2 * 1024 * 1024
  private static let mitmMaxKeepAliveRequests = 64

  private var listener: NWListener?
  private let queue = DispatchQueue(label: "com.lenswire.localproxy", qos: .userInitiated)
  /// Separate from `queue` so Secure Transport waits do not deadlock NW receive callbacks.
  private let mitmQueue = DispatchQueue(label: "com.lenswire.mitm", qos: .userInitiated, attributes: .concurrent)
  private let bypassLock = NSLock()
  /// Session MITM bypass: host lowercase → cause reasonCode that first triggered bypass.
  private var mitmBypassHosts = [String: String]()

  func start() throws {
    guard listener == nil else { return }
    let port = NWEndpoint.Port(rawValue: LenswireShared.proxyPort)!
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: port)
    listener = try NWListener(using: parameters)
    listener?.newConnectionHandler = { [weak self] connection in
      self?.handle(connection: connection)
    }
    listener?.start(queue: queue)
  }

  func stop() {
    listener?.cancel()
    listener = nil
  }

  private func isBypassed(_ host: String) -> Bool {
    bypassLock.lock()
    defer { bypassLock.unlock() }
    return mitmBypassHosts[host.lowercased()] != nil
  }

  private func bypassCause(for host: String) -> String? {
    bypassLock.lock()
    defer { bypassLock.unlock() }
    return mitmBypassHosts[host.lowercased()]
  }

  private func addBypass(_ host: String, cause: String) {
    bypassLock.lock()
    defer { bypassLock.unlock() }
    let key = host.lowercased()
    if mitmBypassHosts[key] == nil {
      mitmBypassHosts[key] = cause
    }
  }

  private func handle(connection: NWConnection) {
    connection.start(queue: queue)
    accumulateHTTPRequest(connection: connection, buffer: Data())
  }

  private func accumulateHTTPRequest(connection: NWConnection, buffer: Data) {
    let remaining = Self.maxHttpMessageBytes - buffer.count
    guard remaining > 0 else {
      Self.sendPlain(client: connection, status: 502, body: "Lenswire proxy request too large\r\n")
      return
    }
    connection.receive(minimumIncompleteLength: 1, maximumLength: min(65536, remaining)) { [weak self] data, _, isComplete, _ in
      guard let self else { return }
      var next = buffer
      if let data, !data.isEmpty {
        next.append(data)
      }
      if next.isEmpty {
        connection.cancel()
        return
      }

      guard let headerRange = next.range(of: Data("\r\n\r\n".utf8)) else {
        if isComplete || next.count >= Self.maxHttpMessageBytes {
          connection.cancel()
          return
        }
        self.accumulateHTTPRequest(connection: connection, buffer: next)
        return
      }

      let headerText = String(data: next.subdata(in: next.startIndex..<headerRange.lowerBound), encoding: .utf8) ?? ""
      let firstLine = headerText.components(separatedBy: "\r\n").first ?? ""
      let method = firstLine.split(separator: " ").first.map(String.init)?.uppercased() ?? ""

      if method == "CONNECT" {
        self.processRequest(
          data: Data(next[..<headerRange.upperBound]),
          client: connection
        )
        return
      }

      let headerLower = headerText.lowercased()
      if headerLower.contains("transfer-encoding:") && headerLower.contains("chunked") {
        Self.sendPlain(client: connection, status: 502, body: "Lenswire proxy chunked requests not supported\r\n")
        return
      }

      var contentLength = 0
      for line in headerText.components(separatedBy: "\r\n").dropFirst() {
        let lower = line.lowercased()
        if lower.hasPrefix("content-length:") {
          let value = line.split(separator: ":", maxSplits: 1).last?
            .trimmingCharacters(in: .whitespaces) ?? "0"
          contentLength = Int(value) ?? 0
        }
      }

      let bodyStart = headerRange.upperBound
      let headerBytes = bodyStart - next.startIndex
      if contentLength < 0 || headerBytes + contentLength > Self.maxHttpMessageBytes {
        Self.sendPlain(client: connection, status: 502, body: "Lenswire proxy request too large\r\n")
        return
      }

      let have = next.count - bodyStart
      if have >= contentLength {
        let total = bodyStart + contentLength
        self.processRequest(data: Data(next[..<total]), client: connection)
        return
      }

      if isComplete {
        connection.cancel()
        return
      }
      self.accumulateHTTPRequest(connection: connection, buffer: next)
    }
  }

  private func processRequest(data: Data, client: NWConnection) {
    guard let requestText = String(data: data, encoding: .utf8),
          let requestLine = requestText.components(separatedBy: "\r\n").first else {
      client.cancel()
      return
    }

    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count >= 2 else {
      client.cancel()
      return
    }

    let method = String(parts[0])
    let target = String(parts[1])

    if method == "CONNECT" {
      let hostPort = target.split(separator: ":")
      let host = String(hostPort.first ?? "unknown")
      let port = hostPort.count > 1 ? (UInt16(hostPort[1]) ?? 443) : 443
      handleCONNECT(host: host, port: port, target: target, client: client)
      return
    }

    var host = "unknown"
    var path = "/"
    var scheme = "http"
    var query = ""
    var upstreamURL: URL?

    if let url = URL(string: target), let urlHost = url.host {
      host = urlHost
      path = url.path.isEmpty ? "/" : url.path
      scheme = url.scheme ?? "http"
      query = url.query ?? ""
      upstreamURL = url
    } else if target.hasPrefix("/") {
      path = target.split(separator: "?").first.map(String.init) ?? target
      if let qIndex = target.firstIndex(of: "?") {
        query = String(target[target.index(after: qIndex)...])
      }
      if let hostHeader = Self.headerValue(named: "Host", in: requestText) {
        host = hostHeader.split(separator: ":").first.map(String.init) ?? hostHeader
        var components = URLComponents()
        components.scheme = "http"
        components.host = host
        components.path = path
        if !query.isEmpty { components.query = query }
        upstreamURL = components.url
      }
    }

    guard let upstreamURL else {
      Self.sendPlain(client: client, status: 502, body: "Lenswire proxy bad request\r\n")
      return
    }

    Self.forwardHTTP(
      requestData: data,
      rawTarget: target,
      scheme: scheme,
      host: host,
      upstreamURL: upstreamURL,
      client: client,
      onBypassHost: { [weak self] bypassHost, cause in
        self?.addBypass(bypassHost, cause: cause)
      }
    ) { capture in
      var entry = capture
      entry["scheme"] = scheme
      entry["host"] = host
      if entry["path"] == nil { entry["path"] = path }
      if entry["query"] == nil { entry["query"] = query }
      LenswireShared.appendCapture(entry)
    }
  }

  private func handleCONNECT(host: String, port: UInt16, target: String, client: NWConnection) {
    let established = "HTTP/1.1 200 Connection Established\r\n\r\n"
    client.send(content: established.data(using: .utf8), completion: .contentProcessed { [weak self] error in
      guard let self, error == nil else {
        client.cancel()
        return
      }

      self.mitmQueue.async {
        let peek = self.readClientHello(client: client)
        let sniHostname = peek.sniHostname
        let tlsMeta = peek.meta
        let clientHelloSize = peek.bytes.count
        let connectIsIp = TlsSni.isIpLiteral(host)

        let effectiveHost: String
        let hostnameSource: String
        let hostnameConfidence: String
        if let sniHostname, !sniHostname.isEmpty {
          effectiveHost = sniHostname
          hostnameSource = "sni"
          hostnameConfidence = "high"
        } else if !connectIsIp {
          effectiveHost = host
          hostnameSource = "connect"
          hostnameConfidence = "medium"
        } else {
          effectiveHost = host
          hostnameSource = "ip"
          hostnameConfidence = "low"
        }

        let decryptEnabled = LenswireShared.httpsDecryptEnabled
        let caReady = CertificateAuthority.shared.isReady()
        let bypassed = self.isBypassed(effectiveHost)
        let sessionBypassCause = bypassed ? self.bypassCause(for: effectiveHost) : nil
        let clientHelloExpected = !peek.bytes.isEmpty
        let alpnOk = Self.alpnAllowsHttp11Mitm(tlsMeta?.alpnProtocols)
        let canMitm = decryptEnabled &&
          caReady &&
          !TlsSni.isIpLiteral(effectiveHost) &&
          !bypassed &&
          clientHelloExpected &&
          alpnOk

        let reasonCode: String?
        if !decryptEnabled {
          reasonCode = "decrypt_disabled"
        } else if !caReady {
          reasonCode = "ca_missing"
        } else if bypassed {
          reasonCode = "mitm_bypassed"
        } else if TlsSni.isIpLiteral(effectiveHost) {
          reasonCode = "ip_no_sni"
        } else if !clientHelloExpected {
          reasonCode = "no_client_hello"
        } else if !alpnOk {
          reasonCode = "alpn_no_http11"
        } else {
          reasonCode = nil
        }

        if !canMitm {
          self.runPassthrough(
            connectHost: host,
            displayHost: effectiveHost,
            port: port,
            client: client,
            prefix: peek.bytes,
            target: target,
            reasonCode: reasonCode ?? "passthrough",
            hostnameSource: hostnameSource,
            hostnameConfidence: hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloSize,
            bypassCause: bypassed ? sessionBypassCause : nil
          )
          return
        }

        let outcome = self.runMITM(
          connectHost: host,
          mitmHost: effectiveHost,
          port: port,
          target: target,
          client: client,
          prefix: peek.bytes,
          hostnameSource: hostnameSource,
          hostnameConfidence: hostnameConfidence,
          sniHostname: sniHostname,
          tlsMeta: tlsMeta,
          clientHelloBytes: clientHelloSize
        )

        switch outcome {
        case .success:
          break
        case .failOpenPassthrough:
          self.runPassthrough(
            connectHost: host,
            displayHost: effectiveHost,
            port: port,
            client: client,
            prefix: peek.bytes,
            target: target,
            reasonCode: "mitm_fail_open",
            hostnameSource: hostnameSource,
            hostnameConfidence: hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloSize
          )
        case .handshakeRejected(let detail):
          // Client already saw (or rejected) our MITM cert — ClientHello replay is impossible.
          self.addBypass(effectiveHost, cause: "mitm_handshake_failed")
          self.appendTunnelCapture(
            id: UUID().uuidString,
            startedAt: Int(Date().timeIntervalSince1970 * 1000),
            host: effectiveHost,
            connectHost: host,
            connectPort: port,
            target: target,
            status: 502,
            reasonCode: "mitm_handshake_failed",
            hostnameSource: hostnameSource,
            hostnameConfidence: hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloSize,
            note: detail,
            peekBytes: nil,
            bypassCause: "mitm_handshake_failed"
          )
          client.cancel()
        case .hardFailure(let detail, let peekBytes, let bypassHost, let reasonCode):
          // Do not passthrough this socket: TLS already started; ClientHello replay would desync.
          // Unsupported protocol / post-handshake silence → bypass host so retries go tunnel-only.
          // Keep reasonCode as-is (do not remap bypassHost=false to mitm_error).
          let failReason = reasonCode
          if bypassHost {
            self.addBypass(effectiveHost, cause: failReason)
          }
          self.appendTunnelCapture(
            id: UUID().uuidString,
            startedAt: Int(Date().timeIntervalSince1970 * 1000),
            host: effectiveHost,
            connectHost: host,
            connectPort: port,
            target: target,
            status: 502,
            reasonCode: failReason,
            hostnameSource: hostnameSource,
            hostnameConfidence: hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloSize,
            note: detail,
            peekBytes: peekBytes,
            bypassCause: bypassHost ? failReason : nil
          )
          client.cancel()
        }
      }
    })
  }

  private enum MitmOutcome {
    case success
    case failOpenPassthrough
    case handshakeRejected(detail: String?)
    case hardFailure(detail: String?, peek: Data?, bypassHost: Bool, reasonCode: String)
  }

  private func runPassthrough(
    connectHost: String,
    displayHost: String,
    port: UInt16,
    client: NWConnection,
    prefix: Data,
    target: String,
    reasonCode: String,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    bypassCause: String? = nil
  ) {
    let id = UUID().uuidString
    let startedAt = Int(Date().timeIntervalSince1970 * 1000)

    let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(connectHost), port: NWEndpoint.Port(rawValue: port)!)
    let upstream = NWConnection(to: endpoint, using: .tcp)
    upstream.start(queue: queue)

    if prefix.isEmpty {
      appendTunnelCapture(
        id: id,
        startedAt: startedAt,
        host: displayHost,
        connectHost: connectHost,
        connectPort: port,
        target: target,
        status: 200,
        reasonCode: reasonCode,
        hostnameSource: hostnameSource,
        hostnameConfidence: hostnameConfidence,
        sniHostname: sniHostname,
        tlsMeta: tlsMeta,
        clientHelloBytes: clientHelloBytes,
        note: nil,
        bypassCause: bypassCause
      )
      Self.relay(from: client, to: upstream, queue: queue)
      Self.relay(from: upstream, to: client, queue: queue)
      return
    }

    upstream.send(content: prefix, completion: .contentProcessed { [weak self] sendError in
      guard let self else { return }
      if let sendError {
        self.appendTunnelCapture(
          id: id,
          startedAt: startedAt,
          host: displayHost,
          connectHost: connectHost,
          connectPort: port,
          target: target,
          status: 502,
          reasonCode: "upstream_connect_failed",
          hostnameSource: hostnameSource,
          hostnameConfidence: hostnameConfidence,
          sniHostname: sniHostname,
          tlsMeta: tlsMeta,
          clientHelloBytes: clientHelloBytes,
          note: sendError.localizedDescription,
          bypassCause: bypassCause
        )
        client.cancel()
        upstream.cancel()
        return
      }

      self.appendTunnelCapture(
        id: id,
        startedAt: startedAt,
        host: displayHost,
        connectHost: connectHost,
        connectPort: port,
        target: target,
        status: 200,
        reasonCode: reasonCode,
        hostnameSource: hostnameSource,
        hostnameConfidence: hostnameConfidence,
        sniHostname: sniHostname,
        tlsMeta: tlsMeta,
        clientHelloBytes: clientHelloBytes,
        note: nil,
        bypassCause: bypassCause
      )
      Self.relay(from: client, to: upstream, queue: self.queue)
      Self.relay(from: upstream, to: client, queue: self.queue)
    })
  }

  private func runMITM(
    connectHost: String,
    mitmHost: String,
    port: UInt16,
    target: String,
    client: NWConnection,
    prefix: Data,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int
  ) -> MitmOutcome {
    var handshakeStarted = false
    var capturedPeek: Data?
    var handledAny = false
    do {
      let identity = try CertificateAuthority.shared.leafIdentity(for: mitmHost)
      let serverTLS = try TLSBridge(
        connection: client,
        queue: queue,
        role: .server,
        identity: identity,
        preloadedData: prefix
      )
      handshakeStarted = true
      try serverTLS.handshake()
      let negotiatedAlpn = serverTLS.negotiatedAlpn()
      // Idle timeout after handshake → mitm_no_request + bypass (not during WS relay).
      serverTLS.throwOnIdleTimeout = true

      // Early sniff: abort only on clear non-HTTP/1.1 (h2, binary, unsupported method).
      // Empty peek continues into completeHTTPMessage (wait for late GET). Ambiguous printable
      // fragments (e.g. partial "GET") also continue with the peek as prefix.
      let peek = try serverTLS.read()
      capturedPeek = peek
      let sniff = Self.sniffPayload(peek)
      if Self.shouldAbortMitm(sniff, bytes: peek) {
        serverTLS.close()
        return .hardFailure(
          detail: Self.formatSniffDetail(sniff, bytes: peek),
          peek: peek,
          bypassHost: true,
          reasonCode: "mitm_unsupported"
        )
      }

      var readPrefix = peek
      for reqIndex in 0..<Self.mitmMaxKeepAliveRequests {
        let requestData: Data
        do {
          requestData = try Self.readOneHTTPRequest(from: serverTLS, prefix: readPrefix)
        } catch {
          if case TLSBridge.TLSError.closed = error, !handledAny {
            serverTLS.close()
            return .hardFailure(
              detail: "guess=empty; bytes=0; cause=eof",
              peek: peek,
              bypassHost: false,
              reasonCode: "mitm_no_request"
            )
          }
          if case TLSBridge.TLSError.closed = error, handledAny {
            serverTLS.close()
            return .success
          }
          if Self.isPostHandshakeReadTimeout(error), handledAny {
            serverTLS.close()
            return .success
          }
          throw error
        }
        readPrefix = Data()

        if requestData.isEmpty || requestData.allSatisfy({
          $0 == UInt8(ascii: " ") || $0 == UInt8(ascii: "\t") || $0 == UInt8(ascii: "\r") || $0 == UInt8(ascii: "\n")
        }) {
          if !handledAny {
            serverTLS.close()
            return .hardFailure(
              detail: "guess=empty; bytes=0; cause=eof",
              peek: peek,
              bypassHost: false,
              reasonCode: "mitm_no_request"
            )
          }
          break
        }

        var parsed = Self.parseHTTPRequest(requestData)
        handledAny = true
        if !Self.isSupportedHTTPMethod(parsed.method) {
          let bad = PayloadSniff(
            guess: .http11,
            method: parsed.method.uppercased(),
            firstLine: sniff.firstLine,
            looksLikeHttp11: true
          )
          serverTLS.close()
          return .hardFailure(
            detail: Self.formatSniffDetail(bad, bytes: peek),
            peek: peek,
            bypassHost: true,
            reasonCode: "mitm_unsupported"
          )
        }

        // Request headers received — disable idle timeout during upstream / WS.
        serverTLS.throwOnIdleTimeout = false
        if Self.isWebSocketUpgrade(parsed.headers) {
          let upstreamHost = Self.hostFromHeaders(parsed.headers) ?? mitmHost
          let startedAt = Int(Date().timeIntervalSince1970 * 1000)
          let id = UUID().uuidString
          let requestBytes = Self.buildHTTPRequestData(parsed)
          return self.relayWebSocketUpgrade(
            serverTLS: serverTLS,
            requestBytes: requestBytes,
            parsed: parsed,
            upstreamHost: upstreamHost,
            port: port,
            useTLS: true,
            id: id,
            startedAt: startedAt,
            connectHost: connectHost,
            target: target,
            hostnameSource: Self.hostFromHeaders(parsed.headers) != nil ? "host_header" : hostnameSource,
            hostnameConfidence: Self.hostFromHeaders(parsed.headers) != nil ? "high" : hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloBytes,
            scheme: "https",
            captureMode: "mitm",
            tlsNegotiatedAlpn: negotiatedAlpn
          )
        }

        let keepAlive = Self.clientWantsKeepAlive(parsed.headers) &&
          reqIndex < Self.mitmMaxKeepAliveRequests - 1
        let startedAt = Int(Date().timeIntervalSince1970 * 1000)
        let id = UUID().uuidString
        let t0 = Date()
        let upstreamHost = Self.hostFromHeaders(parsed.headers) ?? mitmHost
        var overrideApplied: String? = nil
        let hostHdr = Self.hostFromHeaders(parsed.headers) != nil
        let hs = hostHdr ? "host_header" : hostnameSource
        let hc = hostHdr ? "high" : hostnameConfidence

        if let responseRule = LenswireShared.findOverride(
          kind: "response",
          method: parsed.method,
          scheme: "https",
          host: upstreamHost,
          path: parsed.path,
          query: parsed.query
        ) {
          let mockBody = responseRule.bodyData
          let mockHeaders = responseRule.responseHeaders
          let responseBytes = Self.encodeHTTP11Response(
            status: responseRule.status,
            headers: mockHeaders,
            body: mockBody,
            connectionClose: !keepAlive
          )
          try serverTLS.write(responseBytes)

          let totalMs = max(1, Int(Date().timeIntervalSince(t0) * 1000))
          let reqContentType = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
          let reqContentEncoding = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
          LenswireShared.appendCapture([
            "id": id,
            "startedAt": startedAt,
            "method": parsed.method,
            "scheme": "https",
            "host": upstreamHost,
            "path": parsed.path,
            "query": parsed.query,
            "status": responseRule.status,
            "requestHeaders": parsed.headers,
            "responseHeaders": mockHeaders,
            "requestBody": LenswireShared.classifyBody(
              parsed.body,
              contentType: reqContentType,
              contentEncoding: reqContentEncoding
            ),
            "responseBody": LenswireShared.classifyBody(
              mockBody,
              contentType: responseRule.contentType.isEmpty ? nil : responseRule.contentType
            ),
            "timing": Self.timingSample(
              connectMs: totalMs,
              tlsMs: totalMs,
              ttfbMs: totalMs,
              downloadMs: totalMs,
              totalMs: totalMs
            ),
            "overrideApplied": "response",
            "reasonCode": "decrypted",
            "hostnameSource": hs,
            "hostnameConfidence": hc,
            "sniHostname": sniHostname ?? NSNull(),
            "rawTarget": target,
            "connectTarget": target,
            "connectHost": connectHost,
            "connectPort": Int(port),
            "effectiveHost": upstreamHost,
            "captureMode": "mitm",
            "httpPayloadAvailable": true,
            "captureSummary": "Response overridden (full mock); upstream not contacted.",
            "tlsClientHelloBytes": clientHelloBytes,
            "tlsRecordVersion": tlsMeta?.recordVersion ?? NSNull(),
            "tlsClientVersion": tlsMeta?.clientVersion ?? NSNull(),
            "tlsAlpnProtocols": tlsMeta?.alpnProtocols ?? [],
            "tlsSniPresent": tlsMeta?.sniPresent ?? (!(sniHostname ?? "").isEmpty),
            "tlsNegotiatedAlpn": negotiatedAlpn,
            "upstreamHttpVersion": NSNull(),
          ])
          if !keepAlive {
            serverTLS.close()
            return .success
          }
          serverTLS.throwOnIdleTimeout = true
          continue
        }

        if let requestRule = LenswireShared.findOverride(
          kind: "request",
          method: parsed.method,
          scheme: "https",
          host: upstreamHost,
          path: parsed.path,
          query: parsed.query
        ) {
          let rewritten = LenswireShared.rewriteRequest(headers: parsed.headers, rule: requestRule)
          parsed.headers = rewritten.headers
          parsed.body = rewritten.body
          overrideApplied = "request"
        }

        let upstreamResponse = try Self.fetchUpstreamHTTPS(
          host: upstreamHost,
          port: port,
          method: parsed.method,
          pathWithQuery: parsed.pathWithQuery,
          headers: parsed.headers,
          body: parsed.body
        )

        let totalMs = max(1, Int(Date().timeIntervalSince(t0) * 1000))
        let responseBytes = Self.encodeHTTP11Response(
          status: upstreamResponse.status,
          headers: upstreamResponse.headers,
          body: upstreamResponse.body,
          connectionClose: !keepAlive
        )
        try serverTLS.write(responseBytes)

        let reqContentType = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
        let reqContentEncoding = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
        let resContentType = upstreamResponse.headers.first { $0.key.lowercased() == "content-type" }?.value
        let resContentEncoding = upstreamResponse.headers.first { $0.key.lowercased() == "content-encoding" }?.value

        LenswireShared.appendCapture([
          "id": id,
          "startedAt": startedAt,
          "method": parsed.method,
          "scheme": "https",
          "host": upstreamHost,
          "path": parsed.path,
          "query": parsed.query,
          "status": upstreamResponse.status,
          "requestHeaders": parsed.headers,
          "responseHeaders": upstreamResponse.headers,
          "requestBody": LenswireShared.classifyBody(
            parsed.body,
            contentType: reqContentType,
            contentEncoding: reqContentEncoding
          ),
          "responseBody": LenswireShared.classifyBody(
            upstreamResponse.body,
            contentType: resContentType,
            contentEncoding: resContentEncoding
          ),
          "timing": Self.timingSample(
            connectMs: totalMs,
            tlsMs: totalMs,
            ttfbMs: totalMs,
            downloadMs: totalMs,
            totalMs: totalMs
          ),
          "overrideApplied": overrideApplied ?? NSNull(),
          "reasonCode": "decrypted",
          "hostnameSource": hs,
          "hostnameConfidence": hc,
          "sniHostname": sniHostname ?? NSNull(),
          "rawTarget": target,
          "connectTarget": target,
          "connectHost": connectHost,
          "connectPort": Int(port),
          "effectiveHost": upstreamHost,
          "captureMode": "mitm",
          "httpPayloadAvailable": true,
          "captureSummary": overrideApplied == "request"
            ? "Request body overridden before upstream; TLS decrypted via MITM."
            : "TLS decrypted via MITM; full HTTP payload available.",
          "tlsClientHelloBytes": clientHelloBytes,
          "tlsRecordVersion": tlsMeta?.recordVersion ?? NSNull(),
          "tlsClientVersion": tlsMeta?.clientVersion ?? NSNull(),
          "tlsAlpnProtocols": tlsMeta?.alpnProtocols ?? [],
          "tlsSniPresent": tlsMeta?.sniPresent ?? (!(sniHostname ?? "").isEmpty),
          "tlsNegotiatedAlpn": negotiatedAlpn,
          "upstreamHttpVersion": "HTTP/1.1",
        ])

        if !keepAlive {
          serverTLS.close()
          return .success
        }
        serverTLS.throwOnIdleTimeout = true
      }
      serverTLS.close()
      return .success
    } catch {
      let detail = String(describing: error)
      if !handshakeStarted {
        return .failOpenPassthrough
      }
      if case TLSBridge.TLSError.closed = error, !handledAny {
        return .hardFailure(
          detail: "guess=empty; bytes=0; cause=eof",
          peek: capturedPeek,
          bypassHost: false,
          reasonCode: "mitm_no_request"
        )
      }
      if Self.isPostHandshakeReadTimeout(error) {
        if handledAny {
          return .success
        }
        return .hardFailure(
          detail: "guess=empty; bytes=0; cause=timeout",
          peek: capturedPeek,
          bypassHost: true,
          reasonCode: "mitm_no_request"
        )
      }
      if Self.isTlsHandshakeFailure(error) {
        return .handshakeRejected(detail: detail)
      }
      return .hardFailure(detail: detail, peek: capturedPeek, bypassHost: false, reasonCode: "mitm_error")
    }
  }

  // MARK: - HTTP helpers

  private struct ParsedRequest {
    var method: String
    var path: String
    var query: String
    var pathWithQuery: String
    var headers: [String: String]
    var body: Data
  }

  private struct UpstreamResult {
    var status: Int
    var headers: [String: String]
    var body: Data
  }

  private static func parseHTTPRequest(_ data: Data) -> ParsedRequest {
    guard let headerRange = data.range(of: Data("\r\n\r\n".utf8)) else {
      return ParsedRequest(method: "GET", path: "/", query: "", pathWithQuery: "/", headers: [:], body: Data())
    }
    let headerData = data.subdata(in: data.startIndex..<headerRange.lowerBound)
    let body = data.subdata(in: headerRange.upperBound..<data.endIndex)
    let text = String(data: headerData, encoding: .utf8) ?? ""
    let lines = text.components(separatedBy: "\r\n")
    let requestLine = lines.first ?? "GET / HTTP/1.1"
    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
    let method = parts.count > 0 ? String(parts[0]) : "GET"
    let target = parts.count > 1 ? String(parts[1]) : "/"
    var path = target
    var query = ""
    if let q = target.firstIndex(of: "?") {
      path = String(target[..<q])
      query = String(target[target.index(after: q)...])
    }
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
      let hp = line.split(separator: ":", maxSplits: 1)
      guard hp.count == 2 else { continue }
      headers[String(hp[0])] = hp[1].trimmingCharacters(in: .whitespaces)
    }
    return ParsedRequest(
      method: method,
      path: path.isEmpty ? "/" : path,
      query: query,
      pathWithQuery: target,
      headers: headers,
      body: body
    )
  }

  private static func containsHeaderEnd(_ data: Data) -> Bool {
    data.range(of: Data("\r\n\r\n".utf8)) != nil
  }

  private static func completeHTTPMessage(initial: Data, reader: TLSBridge) throws -> Data {
    var data = initial
    guard let headerRange = data.range(of: Data("\r\n\r\n".utf8)) else { return data }
    let headerText = String(data: data.subdata(in: data.startIndex..<headerRange.lowerBound), encoding: .utf8) ?? ""
    var contentLength = 0
    for line in headerText.components(separatedBy: "\r\n").dropFirst() {
      let lower = line.lowercased()
      if lower.hasPrefix("content-length:") {
        let value = line.split(separator: ":", maxSplits: 1).last?
          .trimmingCharacters(in: .whitespaces) ?? "0"
        contentLength = Int(value) ?? 0
      }
    }
    let bodyStart = headerRange.upperBound
    var have = data.count - bodyStart
    while have < contentLength, data.count < maxHttpMessageBytes {
      let chunk = try reader.read(maxLength: min(65536, contentLength - have))
      if chunk.isEmpty { break }
      data.append(chunk)
      have = data.count - bodyStart
    }
    return data
  }

  private static func fetchUpstreamHTTPS(
    host: String,
    port: UInt16,
    method: String,
    pathWithQuery: String,
    headers: [String: String],
    body: Data
  ) throws -> UpstreamResult {
    var components = URLComponents()
    components.scheme = "https"
    components.host = host
    components.port = port == 443 ? nil : Int(port)
    let pq = pathWithQuery.hasPrefix("/") ? pathWithQuery : "/" + pathWithQuery
    if let qIndex = pq.firstIndex(of: "?") {
      components.path = String(pq[..<qIndex])
      components.query = String(pq[pq.index(after: qIndex)...])
    } else {
      components.path = pq
    }
    guard let url = components.url else {
      throw NSError(domain: "LenswireProxy", code: 10, userInfo: [NSLocalizedDescriptionKey: "Bad upstream URL"])
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body.isEmpty ? nil : body
    for (key, value) in headers {
      let lower = key.lowercased()
      if lower == "proxy-connection" || lower == "connection" || lower == "content-length" || lower == "host" {
        continue
      }
      request.setValue(value, forHTTPHeaderField: key)
    }

    let config = URLSessionConfiguration.ephemeral
    config.connectionProxyDictionary = [:]
    config.timeoutIntervalForRequest = 30
    let session = URLSession(configuration: config)

    let semaphore = DispatchSemaphore(value: 0)
    var result: UpstreamResult?
    var taskError: Error?

    session.dataTask(with: request) { data, response, error in
      defer { semaphore.signal() }
      if let error {
        taskError = error
        return
      }
      let http = response as? HTTPURLResponse
      var responseHeaders: [String: String] = [:]
      if let http {
        for (key, value) in http.allHeaderFields {
          if let key = key as? String {
            responseHeaders[key] = String(describing: value)
          }
        }
      }
      result = UpstreamResult(
        status: http?.statusCode ?? 502,
        headers: responseHeaders,
        body: data ?? Data()
      )
    }.resume()

    _ = semaphore.wait(timeout: .now() + 35)
    if let taskError { throw taskError }
    guard let result else {
      throw NSError(domain: "LenswireProxy", code: 11, userInfo: [NSLocalizedDescriptionKey: "Upstream timeout"])
    }
    return result
  }

  private static func forwardHTTP(
    requestData: Data,
    rawTarget: String,
    scheme: String,
    host: String,
    upstreamURL: URL,
    client: NWConnection,
    onBypassHost: ((String, String) -> Void)? = nil,
    onCapture: @escaping ([String: Any]) -> Void
  ) {
    let startedAt = Int(Date().timeIntervalSince1970 * 1000)
    let id = UUID().uuidString
    let t0 = Date()
    var parsed = parseHTTPRequest(requestData)
    let captureScheme = scheme == "https" ? "https" : "http"
    let captureHost = host.isEmpty ? (upstreamURL.host ?? "unknown") : host

    if isWebSocketUpgrade(parsed.headers) {
      let requestBytes: Data
      if rawTarget.hasPrefix("http://") || rawTarget.hasPrefix("https://") {
        requestBytes = Self.buildHTTPRequestData(parsed, requestTarget: rawTarget)
      } else {
        requestBytes = Self.buildHTTPRequestData(parsed)
      }
      let upstreamPort = UInt16(upstreamURL.port ?? (captureScheme == "https" ? 443 : 80))
      // Relayed on a background queue so we don't block the accept loop forever.
      // Capture is emitted inside relay once headers arrive.
      let relayQueue = DispatchQueue(label: "lenswire.ws.http.\(id)")
      relayQueue.async {
        _ = Self.relayPlainWebSocketUpgrade(
          client: client,
          requestBytes: requestBytes,
          parsed: parsed,
          upstreamHost: captureHost,
          port: upstreamPort,
          useTLS: captureScheme == "https",
          id: id,
          startedAt: startedAt,
          rawTarget: rawTarget,
          scheme: captureScheme,
          onCapture: onCapture
        )
      }
      return
    }

    if let responseRule = LenswireShared.findOverride(
      kind: "response",
      method: parsed.method,
      scheme: captureScheme,
      host: captureHost,
      path: parsed.path,
      query: parsed.query
    ) {
      let mockBody = responseRule.bodyData
      let mockHeaders = responseRule.responseHeaders
      let totalMs = max(1, Int(Date().timeIntervalSince(t0) * 1000))
      let reqCT = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
      let reqCE = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
      onCapture([
        "id": id,
        "startedAt": startedAt,
        "method": parsed.method,
        "path": parsed.path,
        "query": parsed.query,
        "status": responseRule.status,
        "requestHeaders": parsed.headers,
        "responseHeaders": mockHeaders,
        "requestBody": LenswireShared.classifyBody(parsed.body, contentType: reqCT, contentEncoding: reqCE),
        "responseBody": LenswireShared.classifyBody(mockBody, contentType: responseRule.contentType.isEmpty ? nil : responseRule.contentType),
        "timing": emptyTiming(totalMs: totalMs),
        "overrideApplied": "response",
        "reasonCode": "http_plain",
        "hostnameSource": "host_header",
        "hostnameConfidence": "high",
        "sniHostname": NSNull(),
        "rawTarget": rawTarget,
        "connectTarget": NSNull(),
        "connectHost": NSNull(),
        "connectPort": NSNull(),
        "effectiveHost": captureHost,
        "captureMode": "http",
        "httpPayloadAvailable": true,
        "captureSummary": "Response overridden (full mock); upstream not contacted.",
        "tlsClientHelloBytes": NSNull(),
        "tlsRecordVersion": NSNull(),
        "tlsClientVersion": NSNull(),
        "tlsAlpnProtocols": [],
        "tlsSniPresent": NSNull(),
      ])
      sendHTTPResponse(client: client, status: responseRule.status, headers: mockHeaders, body: mockBody)
      return
    }

    var overrideApplied: String? = nil
    if let requestRule = LenswireShared.findOverride(
      kind: "request",
      method: parsed.method,
      scheme: captureScheme,
      host: captureHost,
      path: parsed.path,
      query: parsed.query
    ) {
      let rewritten = LenswireShared.rewriteRequest(headers: parsed.headers, rule: requestRule)
      parsed.headers = rewritten.headers
      parsed.body = rewritten.body
      overrideApplied = "request"
    }

    var request = URLRequest(url: upstreamURL)
    request.httpMethod = parsed.method
    request.httpBody = parsed.body.isEmpty ? nil : parsed.body
    for (key, value) in parsed.headers {
      let lower = key.lowercased()
      if lower == "proxy-connection" || lower == "content-length" { continue }
      request.setValue(value, forHTTPHeaderField: key)
    }

    let config = URLSessionConfiguration.ephemeral
    config.connectionProxyDictionary = [:]
    let session = URLSession(configuration: config)

    session.dataTask(with: request) { data, response, error in
      let totalMs = max(1, Int(Date().timeIntervalSince(t0) * 1000))
      let status = (response as? HTTPURLResponse)?.statusCode ?? (error == nil ? 200 : 502)
      var responseHeaders: [String: String] = [:]
      if let http = response as? HTTPURLResponse {
        for (key, value) in http.allHeaderFields {
          if let key = key as? String {
            responseHeaders[key] = String(describing: value)
          }
        }
      }
      let bodyData = data ?? Data()
      let reqCT = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
      let reqCE = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
      let resCT = responseHeaders.first { $0.key.lowercased() == "content-type" }?.value
      let resCE = responseHeaders.first { $0.key.lowercased() == "content-encoding" }?.value

      onCapture([
        "id": id,
        "startedAt": startedAt,
        "method": parsed.method,
        "path": parsed.path,
        "query": parsed.query,
        "status": status,
        "requestHeaders": parsed.headers,
        "responseHeaders": responseHeaders,
        "requestBody": LenswireShared.classifyBody(parsed.body, contentType: reqCT, contentEncoding: reqCE),
        "responseBody": LenswireShared.classifyBody(bodyData, contentType: resCT, contentEncoding: resCE),
        "timing": emptyTiming(totalMs: totalMs),
        "overrideApplied": overrideApplied ?? NSNull(),
        "reasonCode": "http_plain",
        "hostnameSource": "host_header",
        "hostnameConfidence": "high",
        "sniHostname": NSNull(),
        "rawTarget": rawTarget,
        "connectTarget": NSNull(),
        "connectHost": NSNull(),
        "connectPort": NSNull(),
        "effectiveHost": captureHost,
        "captureMode": "http",
        "httpPayloadAvailable": true,
        "captureSummary": overrideApplied == "request"
          ? "Request body overridden before upstream; plain HTTP capture."
          : "Plain HTTP capture; full request/response payload available.",
        "tlsClientHelloBytes": NSNull(),
        "tlsRecordVersion": NSNull(),
        "tlsClientVersion": NSNull(),
        "tlsAlpnProtocols": [],
        "tlsSniPresent": NSNull(),
      ])

      guard error == nil, let http = response as? HTTPURLResponse else {
        sendPlain(client: client, status: 502, body: "Lenswire upstream error\r\n")
        return
      }

      sendHTTPResponse(client: client, status: http.statusCode, headers: responseHeaders, body: bodyData)
    }.resume()
  }

  private static func sendHTTPResponse(
    client: NWConnection,
    status: Int,
    headers: [String: String],
    body: Data
  ) {
    var headerLines = ["HTTP/1.1 \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))"]
    for (key, value) in headers {
      if key.lowercased() == "transfer-encoding" { continue }
      if key.lowercased() == "content-length" { continue }
      headerLines.append("\(key): \(value)")
    }
    headerLines.append("Content-Length: \(body.count)")
    headerLines.append("Connection: close")
    headerLines.append("")
    headerLines.append("")
    var payload = headerLines.joined(separator: "\r\n").data(using: .utf8) ?? Data()
    payload.append(body)
    client.send(content: payload, completion: .contentProcessed { _ in
      client.cancel()
    })
  }

  private static func sendPlain(client: NWConnection, status: Int, body: String) {
    let payload =
      "HTTP/1.1 \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
    client.send(content: payload.data(using: .utf8), completion: .contentProcessed { _ in
      client.cancel()
    })
  }

  private static func headerValue(named name: String, in request: String) -> String? {
    let lines = request.components(separatedBy: "\r\n")
    let prefix = name.lowercased() + ":"
    for line in lines.dropFirst() {
      if line.lowercased().hasPrefix(prefix) {
        return line.split(separator: ":", maxSplits: 1).last.map { $0.trimmingCharacters(in: .whitespaces) }
      }
    }
    return nil
  }

  private static func hostFromHeaders(_ headers: [String: String]) -> String? {
    guard let hostHeader = headers.first(where: { $0.key.lowercased() == "host" })?.value else {
      return nil
    }
    let trimmed = hostHeader.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }
    if trimmed.hasPrefix("[") {
      if let end = trimmed.firstIndex(of: "]") {
        return String(trimmed[trimmed.index(after: trimmed.startIndex)..<end])
      }
    }
    return trimmed.split(separator: ":").first.map(String.init)
  }

  private static func isTlsHandshakeFailure(_ error: Error) -> Bool {
    // Do NOT match generic "protocol" — that false-positives HTTP/2 unsupported-protocol paths.
    let message = error.localizedDescription.lowercased()
    let name = String(describing: type(of: error)).lowercased()
    if message.contains("unsupported https request method") { return false }
    return name.contains("ssl")
      || message.contains("handshake")
      || message.contains("certificate")
      || message.contains("trust anchor")
      || message.contains("trustmanager")
      || message.contains("tls")
  }

  private static func clientWantsKeepAlive(_ headers: [String: String]) -> Bool {
    if let connection = headers.first(where: { $0.key.lowercased() == "connection" })?.value
      .lowercased(),
      connection.contains("close") {
      return false
    }
    return true
  }

  private static func encodeHTTP11Response(
    status: Int,
    headers: [String: String],
    body: Data,
    connectionClose: Bool
  ) -> Data {
    var responseBytes = Data()
    responseBytes.append(
      contentsOf: "HTTP/1.1 \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))\r\n".utf8
    )
    for (key, value) in headers {
      let lower = key.lowercased()
      if lower == "transfer-encoding" || lower == "content-length" || lower == "connection" {
        continue
      }
      responseBytes.append(contentsOf: "\(key): \(value)\r\n".utf8)
    }
    responseBytes.append(contentsOf: "Content-Length: \(body.count)\r\n".utf8)
    responseBytes.append(
      contentsOf: "Connection: \(connectionClose ? "close" : "keep-alive")\r\n\r\n".utf8
    )
    responseBytes.append(body)
    return responseBytes
  }

  private static func readOneHTTPRequest(from serverTLS: TLSBridge, prefix: Data) throws -> Data {
    var requestData = prefix
    if requestData.isEmpty {
      requestData = try serverTLS.read()
    }
    while true {
      if containsHeaderEnd(requestData) { break }
      if requestData.count > 1024 * 1024 { break }
      let chunk = try serverTLS.read()
      requestData.append(chunk)
    }
    return try completeHTTPMessage(initial: requestData, reader: serverTLS)
  }

  private static func isPostHandshakeReadTimeout(_ error: Error) -> Bool {
    // Only client idle after MITM handshake — not upstream URLSession timeouts.
    if case TLSBridge.TLSError.timedOut = error {
      return true
    }
    return false
  }

  private func readClientHello(client: NWConnection, timeoutMs: Int = 12_000) -> TlsSni.PeekResult {
    let semaphore = DispatchSemaphore(value: 0)
    var result = TlsSni.PeekResult(bytes: Data(), sniHostname: nil, meta: nil)
    client.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { data, _, _, _ in
      if let data, !data.isEmpty {
        result = TlsSni.peekClientHello(from: data)
      }
      semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + .milliseconds(timeoutMs))
    return result
  }

  private func appendTunnelCapture(
    id: String,
    startedAt: Int,
    host: String,
    connectHost: String,
    connectPort: UInt16,
    target: String,
    status: Int,
    reasonCode: String,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    note: String?,
    peekBytes: Data? = nil,
    bypassCause: String? = nil
  ) {
    let bodyText: String
    if let note, !note.isEmpty {
      bodyText = "\(reasonCode): \(note)"
    } else {
      bodyText = reasonCode
    }
    let requestBody: [String: Any]
    if let peek = peekBytes, !peek.isEmpty {
      requestBody = LenswireShared.classifyBody(
        peek,
        contentType: Self.isMostlyPrintable(peek) ? "text/plain" : "application/octet-stream"
      )
    } else {
      requestBody = ["kind": "empty", "size": 0]
    }
    var fields: [String: Any] = [
      "id": id,
      "startedAt": startedAt,
      "method": "CONNECT",
      "scheme": "https",
      "host": host,
      "path": "/",
      "query": "",
      "status": status,
      "requestHeaders": [String: String](),
      "responseHeaders": [String: String](),
      "requestBody": requestBody,
      "responseBody": LenswireShared.classifyBody(Data(bodyText.utf8), contentType: "text/plain"),
      "timing": Self.emptyTiming(totalMs: max(1, Int(Date().timeIntervalSince1970 * 1000) - startedAt)),
      "reasonCode": reasonCode,
      "hostnameSource": hostnameSource,
      "hostnameConfidence": hostnameConfidence,
      "sniHostname": sniHostname ?? NSNull(),
      "rawTarget": target,
      "connectTarget": target,
      "connectHost": connectHost,
      "connectPort": Int(connectPort),
      "effectiveHost": host,
      "captureMode": "tunnel",
      "httpPayloadAvailable": false,
      "captureSummary": Self.summaryForReason(reasonCode, detail: note, bypassCause: bypassCause),
      "tlsClientHelloBytes": clientHelloBytes,
      "tlsRecordVersion": tlsMeta?.recordVersion ?? NSNull(),
      "tlsClientVersion": tlsMeta?.clientVersion ?? NSNull(),
      "tlsAlpnProtocols": tlsMeta?.alpnProtocols ?? [],
      "tlsSniPresent": tlsMeta?.sniPresent ?? (!(sniHostname ?? "").isEmpty),
    ]
    if let bypassCause, !bypassCause.isEmpty {
      fields["bypassCause"] = bypassCause
    }
    LenswireShared.appendCapture(fields)
  }

  private static func bypassCauseLabel(_ cause: String?) -> String? {
    guard let cause, !cause.isEmpty else { return nil }
    switch cause {
    case "mitm_handshake_failed":
      return "trust fail"
    case "mitm_unsupported":
      return "unsupported protocol"
    case "mitm_no_request":
      return "no request"
    case "mitm_websocket":
      return "websocket"
    default:
      return cause.replacingOccurrences(of: "_", with: " ")
    }
  }

  private static func summaryForReason(
    _ reasonCode: String,
    detail: String? = nil,
    bypassCause: String? = nil
  ) -> String {
    let d = detail ?? ""
    let base: String
    switch reasonCode {
    case "decrypted":
      base = "TLS decrypted via MITM; full HTTP payload available."
    case "http_plain":
      base = "Plain HTTP capture; full request/response payload available."
    case "decrypt_disabled":
      base = "HTTPS decrypt is disabled; connection is captured as a tunnel only."
    case "ca_missing":
      base = "CA certificate is missing; connection is captured as a tunnel only."
    case "ip_no_sni":
      base = "Target is an IP without SNI; connection is captured as a tunnel only."
    case "no_client_hello":
      base = "No TLS ClientHello observed; connection is captured as a tunnel only."
    case "mitm_bypassed":
      if let causeLabel = Self.bypassCauseLabel(bypassCause) {
        base = "Session bypass (\(causeLabel)); connection is captured as a tunnel only."
      } else {
        base = "Host is in MITM bypass list; connection is captured as a tunnel only."
      }
    case "mitm_fail_open":
      base = "MITM failed; proxy switched to fail-open tunnel mode."
    case "mitm_handshake_failed":
      base = "TLS handshake rejected (client did not trust Lenswire CA, or TLS mismatch). Host bypassed for this VPN session."
    case "mitm_unsupported":
      if d.range(of: "guess=http2", options: .caseInsensitive) != nil {
        base = "HTTP/2 after MITM handshake; connection closed and host bypassed for this VPN session."
      } else if d.range(of: "guess=non_http", options: .caseInsensitive) != nil {
        base = "Non-HTTP/binary payload after MITM handshake; connection closed and host bypassed for this VPN session."
      } else if d.range(of: "guess=http11", options: .caseInsensitive) != nil {
        base = "Unsupported HTTP method after MITM; connection closed and host bypassed for this VPN session."
      } else {
        base = "Unsupported protocol after MITM; connection closed and host bypassed for this VPN session."
      }
    case "mitm_no_request":
      if d.range(of: "cause=timeout", options: .caseInsensitive) != nil {
        base = "No HTTP request after MITM handshake (read timeout); connection closed and host bypassed for this VPN session."
      } else if d.range(of: "cause=eof", options: .caseInsensitive) != nil
        || d.range(of: "guess=empty", options: .caseInsensitive) != nil {
        base = "No HTTP request after MITM handshake (client closed); connection closed. Host was not added to session bypass."
      } else {
        base = "No HTTP request after MITM handshake; connection closed and host bypassed for this VPN session."
      }
    case "mitm_websocket":
      base = "WebSocket upgrade was relayed historically; prefer websocket_relay (frames not inspected)."
    case "websocket_relay":
      base = "WebSocket upgrade relayed to upstream; frames are not inspected."
    case "mitm_error":
      base = "MITM proxy error after TLS handshake; connection closed (not fail-open tunnel)."
    case "alpn_no_http11":
      base = "ClientHello ALPN has no http/1.1; connection is captured as a tunnel only."
    case "upstream_connect_failed":
      base = "Proxy could not connect to upstream target."
    case "passthrough":
      base = "HTTPS passthrough tunnel; HTTP payload is unavailable."
    default:
      base = reasonCode.replacingOccurrences(of: "_", with: " ")
    }
    guard let detail, !detail.isEmpty else { return base }
    return "\(base)\n\(detail)"
  }

  private struct PayloadSniff {
    enum Guess: String {
      case empty
      case http2
      case http11
      case nonHttp = "non_http"
    }

    var guess: Guess
    var method: String?
    var firstLine: String?
    var looksLikeHttp11: Bool
  }

  private static let supportedHTTPMethods: Set<String> = [
    "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  ]

  private static func isSupportedHTTPMethod(_ method: String) -> Bool {
    supportedHTTPMethods.contains(method.uppercased())
  }

  private static func isWebSocketUpgrade(_ headers: [String: String]) -> Bool {
    guard let upgrade = headers.first(where: { $0.key.lowercased() == "upgrade" })?.value else {
      return false
    }
    return upgrade.range(of: "websocket", options: .caseInsensitive) != nil
  }

  private static func buildHTTPRequestData(_ parsed: ParsedRequest, requestTarget: String? = nil) -> Data {
    let target = requestTarget ?? (parsed.pathWithQuery.hasPrefix("/") ? parsed.pathWithQuery : "/\(parsed.pathWithQuery)")
    var out = Data()
    out.append(contentsOf: "\(parsed.method) \(target) HTTP/1.1\r\n".utf8)
    for (key, value) in parsed.headers {
      out.append(contentsOf: "\(key): \(value)\r\n".utf8)
    }
    out.append(contentsOf: "\r\n".utf8)
    out.append(parsed.body)
    return out
  }

  private static func readHTTPHeaderBlock(from bridge: TLSBridge, maxBytes: Int = 65_536) throws -> Data {
    var out = Data()
    while out.count < maxBytes {
      let chunk = try bridge.read(maxLength: 1)
      if chunk.isEmpty { break }
      out.append(chunk)
      if out.count >= 4 {
        let n = out.count
        if out[n - 4] == 0x0d && out[n - 3] == 0x0a && out[n - 2] == 0x0d && out[n - 1] == 0x0a {
          break
        }
      }
    }
    return out
  }

  private static func parseHTTPStatus(from headerBlock: Data) -> Int? {
    guard let text = String(data: headerBlock, encoding: .isoLatin1) else { return nil }
    let first = text.components(separatedBy: "\r\n").first ?? ""
    let parts = first.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count >= 2 else { return nil }
    return Int(parts[1])
  }

  private static func parseResponseHeaders(from headerBlock: Data) -> [String: String] {
    guard let text = String(data: headerBlock, encoding: .isoLatin1) else { return [:] }
    let headerText = text.components(separatedBy: "\r\n\r\n").first ?? text
    var out: [String: String] = [:]
    for line in headerText.components(separatedBy: "\r\n").dropFirst() {
      let parts = line.split(separator: ":", maxSplits: 1)
      guard parts.count == 2 else { continue }
      out[String(parts[0])] = parts[1].trimmingCharacters(in: .whitespaces)
    }
    return out
  }

  private static func waitReady(_ connection: NWConnection, queue: DispatchQueue, timeoutSeconds: Double = 20) throws {
    let sem = DispatchSemaphore(value: 0)
    var failed: Error?
    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        sem.signal()
      case .failed(let error):
        failed = error
        sem.signal()
      case .cancelled:
        failed = NSError(domain: "LenswireProxy", code: 12, userInfo: [NSLocalizedDescriptionKey: "Connection cancelled"])
        sem.signal()
      default:
        break
      }
    }
    connection.start(queue: queue)
    if sem.wait(timeout: .now() + timeoutSeconds) == .timedOut {
      connection.cancel()
      throw NSError(domain: "LenswireProxy", code: 13, userInfo: [NSLocalizedDescriptionKey: "Upstream connect timeout"])
    }
    if let failed { throw failed }
  }

  private func relayWebSocketUpgrade(
    serverTLS: TLSBridge,
    requestBytes: Data,
    parsed: ParsedRequest,
    upstreamHost: String,
    port: UInt16,
    useTLS: Bool,
    id: String,
    startedAt: Int,
    connectHost: String,
    target: String,
    hostnameSource: String,
    hostnameConfidence: String,
    sniHostname: String?,
    tlsMeta: TlsSni.ClientHelloMeta?,
    clientHelloBytes: Int,
    scheme: String,
    captureMode: String,
    tlsNegotiatedAlpn: String? = nil
  ) -> MitmOutcome {
    do {
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(upstreamHost), port: NWEndpoint.Port(rawValue: port)!)
      let upstreamConn = NWConnection(to: endpoint, using: .tcp)
      try Self.waitReady(upstreamConn, queue: queue)

      let upstreamTLS: TLSBridge?
      if useTLS {
        let bridge = try TLSBridge(
          connection: upstreamConn,
          queue: queue,
          role: .client,
          identity: nil,
          peerHostname: upstreamHost
        )
        try bridge.handshake()
        upstreamTLS = bridge
      } else {
        upstreamTLS = nil
      }

      if let upstreamTLS {
        try upstreamTLS.write(requestBytes)
      } else {
        let sem = DispatchSemaphore(value: 0)
        var sendErr: Error?
        upstreamConn.send(content: requestBytes, completion: .contentProcessed { error in
          sendErr = error
          sem.signal()
        })
        _ = sem.wait(timeout: .now() + 20)
        if let sendErr { throw sendErr }
      }

      let responseHeaders: Data
      let responseLeftover: Data
      if let upstreamTLS {
        responseHeaders = try Self.readHTTPHeaderBlock(from: upstreamTLS)
        responseLeftover = Data()
      } else {
        let headerRead = try Self.readHTTPHeaderBlockNW(from: upstreamConn, queue: queue)
        responseHeaders = headerRead.headerBlock
        responseLeftover = headerRead.leftover
      }

      var payloadToClient = responseHeaders
      if !responseLeftover.isEmpty {
        payloadToClient.append(responseLeftover)
      }
      try serverTLS.write(payloadToClient)
      let status = Self.parseHTTPStatus(from: responseHeaders) ?? 101
      let resHeaders = Self.parseResponseHeaders(from: responseHeaders)
      let totalMs = max(1, Int(Date().timeIntervalSince1970 * 1000) - startedAt)
      let reqCT = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
      let reqCE = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
      LenswireShared.appendCapture([
        "id": id,
        "startedAt": startedAt,
        "method": parsed.method,
        "scheme": scheme,
        "host": upstreamHost,
        "path": parsed.path,
        "query": parsed.query,
        "status": status,
        "requestHeaders": parsed.headers,
        "responseHeaders": resHeaders,
        "requestBody": LenswireShared.classifyBody(parsed.body, contentType: reqCT, contentEncoding: reqCE),
        "responseBody": LenswireShared.classifyBody(Data(), contentType: nil),
        "timing": Self.timingSample(totalMs: totalMs),
        "reasonCode": "websocket_relay",
        "hostnameSource": hostnameSource,
        "hostnameConfidence": hostnameConfidence,
        "sniHostname": sniHostname ?? NSNull(),
        "rawTarget": target,
        "connectTarget": target,
        "connectHost": connectHost,
        "connectPort": Int(port),
        "effectiveHost": upstreamHost,
        "captureMode": captureMode,
        "httpPayloadAvailable": false,
        "captureSummary": Self.summaryForReason("websocket_relay"),
        "tlsClientHelloBytes": clientHelloBytes,
        "tlsRecordVersion": tlsMeta?.recordVersion ?? NSNull(),
        "tlsClientVersion": tlsMeta?.clientVersion ?? NSNull(),
        "tlsAlpnProtocols": tlsMeta?.alpnProtocols ?? [],
        "tlsSniPresent": tlsMeta?.sniPresent ?? (!(sniHostname ?? "").isEmpty),
        "tlsNegotiatedAlpn": tlsNegotiatedAlpn ?? NSNull(),
        "upstreamHttpVersion": "HTTP/1.1",
      ])

      if status != 101 {
        serverTLS.close()
        if let upstreamTLS {
          upstreamTLS.close()
        } else {
          upstreamConn.cancel()
        }
        return .success
      }

      let pipeQueue = DispatchQueue(label: "lenswire.ws.pipe.\(id)", attributes: .concurrent)
      if let upstreamTLS {
        pipeQueue.async {
          while true {
            do {
              let chunk = try serverTLS.read()
              try upstreamTLS.write(chunk)
            } catch {
              serverTLS.close()
              upstreamTLS.close()
              break
            }
          }
        }
        pipeQueue.async {
          while true {
            do {
              let chunk = try upstreamTLS.read()
              try serverTLS.write(chunk)
            } catch {
              serverTLS.close()
              upstreamTLS.close()
              break
            }
          }
        }
      } else {
        Self.relayTLSBridge(serverTLS, to: upstreamConn, queue: pipeQueue)
        Self.relayNW(upstreamConn, to: serverTLS, queue: pipeQueue)
      }
      return .success
    } catch {
      serverTLS.close()
      return .hardFailure(
        detail: String(describing: error),
        peek: nil,
        bypassHost: false,
        reasonCode: "mitm_error"
      )
    }
  }

  private static func relayPlainWebSocketUpgrade(
    client: NWConnection,
    requestBytes: Data,
    parsed: ParsedRequest,
    upstreamHost: String,
    port: UInt16,
    useTLS: Bool,
    id: String,
    startedAt: Int,
    rawTarget: String,
    scheme: String,
    onCapture: @escaping ([String: Any]) -> Void
  ) -> Bool {
    do {
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(upstreamHost), port: NWEndpoint.Port(rawValue: port)!)
      let queue = DispatchQueue(label: "lenswire.ws.plain.\(id)")
      let upstreamConn = NWConnection(to: endpoint, using: .tcp)
      try waitReady(upstreamConn, queue: queue)

      let upstreamTLS: TLSBridge?
      if useTLS {
        let bridge = try TLSBridge(
          connection: upstreamConn,
          queue: queue,
          role: .client,
          identity: nil,
          peerHostname: upstreamHost
        )
        try bridge.handshake()
        upstreamTLS = bridge
      } else {
        upstreamTLS = nil
      }

      if let upstreamTLS {
        try upstreamTLS.write(requestBytes)
      } else {
        let sem = DispatchSemaphore(value: 0)
        var sendErr: Error?
        upstreamConn.send(content: requestBytes, completion: .contentProcessed { error in
          sendErr = error
          sem.signal()
        })
        _ = sem.wait(timeout: .now() + 20)
        if let sendErr { throw sendErr }
      }

      let headerRead: (headerBlock: Data, leftover: Data)
      if let upstreamTLS {
        headerRead = (try readHTTPHeaderBlock(from: upstreamTLS), Data())
      } else {
        headerRead = try readHTTPHeaderBlockNW(from: upstreamConn, queue: queue)
      }

      let responseHeaders = headerRead.headerBlock
      var payloadToClient = responseHeaders
      if !headerRead.leftover.isEmpty {
        // Preserve bytes that arrived with upgrade headers (often first WS frame).
        payloadToClient.append(headerRead.leftover)
      }
      let sem = DispatchSemaphore(value: 0)
      client.send(content: payloadToClient, completion: .contentProcessed { _ in sem.signal() })
      _ = sem.wait(timeout: .now() + 20)

      let status = parseHTTPStatus(from: responseHeaders) ?? 101
      let resHeaders = parseResponseHeaders(from: responseHeaders)
      let totalMs = max(1, Int(Date().timeIntervalSince1970 * 1000) - startedAt)
      let reqCT = parsed.headers.first { $0.key.lowercased() == "content-type" }?.value
      let reqCE = parsed.headers.first { $0.key.lowercased() == "content-encoding" }?.value
      onCapture([
        "id": id,
        "startedAt": startedAt,
        "method": parsed.method,
        "path": parsed.path,
        "query": parsed.query,
        "status": status,
        "requestHeaders": parsed.headers,
        "responseHeaders": resHeaders,
        "requestBody": LenswireShared.classifyBody(parsed.body, contentType: reqCT, contentEncoding: reqCE),
        "responseBody": LenswireShared.classifyBody(Data(), contentType: nil),
        "timing": emptyTiming(totalMs: totalMs),
        "reasonCode": "websocket_relay",
        "hostnameSource": "host_header",
        "hostnameConfidence": "high",
        "sniHostname": NSNull(),
        "rawTarget": rawTarget,
        "connectTarget": NSNull(),
        "connectHost": NSNull(),
        "connectPort": NSNull(),
        "effectiveHost": upstreamHost,
        "captureMode": "http",
        "httpPayloadAvailable": false,
        "captureSummary": summaryForReason("websocket_relay"),
        "tlsClientHelloBytes": NSNull(),
        "tlsRecordVersion": NSNull(),
        "tlsClientVersion": NSNull(),
        "tlsAlpnProtocols": [],
        "tlsSniPresent": NSNull(),
      ])

      if status != 101 {
        client.cancel()
        if let upstreamTLS {
          upstreamTLS.close()
        } else {
          upstreamConn.cancel()
        }
        return false
      }

      if let upstreamTLS {
        // Bridge client NW <-> upstream TLSBridge via temp relays is complex; use cancel for rare https-in-plain-proxy.
        // Plain HTTP WS is typically non-TLS.
        relayNW(client, to: upstreamTLS, queue: queue)
        relayTLSBridge(upstreamTLS, to: client, queue: queue)
      } else {
        relay(from: client, to: upstreamConn, queue: queue)
        relay(from: upstreamConn, to: client, queue: queue)
      }
      return true
    } catch {
      client.cancel()
      return false
    }
  }

  private static func readHTTPHeaderBlockNW(
    from connection: NWConnection,
    queue: DispatchQueue,
    maxBytes: Int = 65_536
  ) throws -> (headerBlock: Data, leftover: Data) {
    var out = Data()
    while out.count < maxBytes {
      let sem = DispatchSemaphore(value: 0)
      var chunk: Data?
      var failed: Error?
      connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, error in
        chunk = data
        failed = error
        sem.signal()
      }
      _ = sem.wait(timeout: .now() + 25)
      if let failed { throw failed }
      guard let data = chunk, !data.isEmpty else { break }
      out.append(data)
      if let range = out.range(of: Data("\r\n\r\n".utf8)) {
        let headerEnd = range.upperBound
        let headerBlock = Data(out[..<headerEnd])
        let leftover = headerEnd < out.count ? Data(out[headerEnd...]) : Data()
        return (headerBlock: headerBlock, leftover: leftover)
      }
    }
    return (headerBlock: out, leftover: Data())
  }

  private static func relayTLSBridge(_ source: TLSBridge, to dest: NWConnection, queue: DispatchQueue) {
    queue.async {
      while true {
        do {
          let chunk = try source.read()
          let sem = DispatchSemaphore(value: 0)
          var failed = false
          dest.send(content: chunk, completion: .contentProcessed { error in
            failed = error != nil
            sem.signal()
          })
          _ = sem.wait(timeout: .now() + 30)
          if failed { break }
        } catch {
          break
        }
      }
      source.close()
      dest.cancel()
    }
  }

  private static func relayNW(_ source: NWConnection, to dest: TLSBridge, queue: DispatchQueue) {
    func loop() {
      source.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
        if let data, !data.isEmpty {
          do {
            try dest.write(data)
            if isComplete || error != nil {
              source.cancel()
              dest.close()
            } else {
              loop()
            }
          } catch {
            source.cancel()
            dest.close()
          }
        } else {
          source.cancel()
          dest.close()
        }
      }
    }
    queue.async { loop() }
  }

  private static let http2Preface = Data("PRI * HTTP/2.0".utf8)
  private static let printableRatioThreshold = 0.85

  private static func sniffPayload(_ bytes: Data) -> PayloadSniff {
    if bytes.isEmpty {
      return PayloadSniff(guess: .empty, method: nil, firstLine: nil, looksLikeHttp11: false)
    }
    // Full or partial HTTP/2 connection preface (before OPTIONS * matching).
    if bytes.starts(with: http2Preface) || looksLikeHttp2Preface(bytes) {
      return PayloadSniff(
        guess: .http2,
        method: "PRI",
        firstLine: firstLine(of: bytes),
        looksLikeHttp11: false
      )
    }
    let line = firstLine(of: bytes)
    let method = methodFromRequestLine(line)
    if let method, looksLikeHTTPRequestLine(line) {
      return PayloadSniff(guess: .http11, method: method, firstLine: line, looksLikeHttp11: true)
    }
    return PayloadSniff(guess: .nonHttp, method: method, firstLine: line, looksLikeHttp11: false)
  }

  /// Empty / missing ALPN → allow MITM. Non-empty without http/1.0|1.1 → skip MITM.
  private static func alpnAllowsHttp11Mitm(_ protocols: [String]?) -> Bool {
    guard let protocols, !protocols.isEmpty else { return true }
    return protocols.contains { name in
      name.compare("http/1.1", options: .caseInsensitive) == .orderedSame ||
        name.compare("http/1.0", options: .caseInsensitive) == .orderedSame
    }
  }

  /// Abort on HTTP/2, clear binary, or unsupported HTTP/1.1 method.
  /// Do not abort on empty peek — continue into completeHTTPMessage so a late GET can arrive.
  /// Do not abort on ambiguous printable fragments (e.g. `"GET"` without a path).
  private static func shouldAbortMitm(_ sniff: PayloadSniff, bytes: Data) -> Bool {
    switch sniff.guess {
    case .empty:
      return false
    case .http2:
      return true
    case .http11:
      if let method = sniff.method { return !isSupportedHTTPMethod(method) }
      return false
    case .nonHttp:
      return isClearlyNonHttp(bytes)
    }
  }

  private static func isMostlyPrintable(_ bytes: Data, threshold: Double = printableRatioThreshold) -> Bool {
    guard !bytes.isEmpty else { return false }
    let printable = bytes.reduce(0) { count, byte in
      let c = Int(byte)
      let ok = c == 9 || c == 10 || c == 13 || (c >= 0x20 && c <= 0x7e)
      return count + (ok ? 1 : 0)
    }
    return Double(printable) / Double(bytes.count) >= threshold
  }

  private static func isClearlyNonHttp(_ bytes: Data) -> Bool {
    if bytes.isEmpty { return true }
    if !isMostlyPrintable(bytes) { return true }
    let first = Int(bytes[bytes.startIndex])
    let isLetter = (first >= 0x41 && first <= 0x5a) || (first >= 0x61 && first <= 0x7a)
    return !isLetter
  }

  private static func looksLikeHttp2Preface(_ bytes: Data) -> Bool {
    if !bytes.isEmpty && bytes.count < http2Preface.count && http2Preface.starts(with: bytes) {
      return true
    }
    guard let line = firstLine(of: bytes),
          let method = methodFromRequestLine(line),
          method == "PRI"
    else { return false }
    let parts = line.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
    return parts.count >= 2 && parts[1] == "*"
  }

  private static func formatSniffDetail(_ sniff: PayloadSniff, bytes: Data, maxHexBytes: Int = 64) -> String {
    var parts: [String] = ["guess=\(sniff.guess.rawValue)"]
    if let method = sniff.method, !method.isEmpty {
      parts.append("method=\(method)")
    }
    if let firstLine = sniff.firstLine, !firstLine.isEmpty {
      let clipped = firstLine.count > 120 ? String(firstLine.prefix(120)) : firstLine
      parts.append("firstLine=\(clipped)")
    }
    if bytes.isEmpty {
      parts.append("bytes=0")
    } else {
      parts.append("hex=\(hexPreview(bytes, maxBytes: maxHexBytes))")
      parts.append("ascii=\(asciiPreview(bytes, maxBytes: maxHexBytes))")
    }
    return parts.joined(separator: "; ")
  }

  private static func firstLine(of bytes: Data) -> String? {
    guard !bytes.isEmpty else { return nil }
    var end = bytes.count
    if let idx = bytes.firstIndex(of: 0x0a) {
      end = idx
    }
    var sliceEnd = end
    if sliceEnd > 0 && bytes[sliceEnd - 1] == 0x0d {
      sliceEnd -= 1
    }
    let slice = bytes.subdata(in: 0..<sliceEnd)
    let cleaned = String(slice.map { byte -> Character in
      let c = Int(byte)
      return (c >= 0x20 && c <= 0x7e) ? Character(UnicodeScalar(c)!) : "."
    })
    return cleaned.isEmpty ? nil : cleaned
  }

  private static func methodFromRequestLine(_ line: String?) -> String? {
    guard let line, !line.isEmpty else { return nil }
    let method = String(line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true).first ?? "")
    guard !method.isEmpty, method.unicodeScalars.allSatisfy({ CharacterSet.letters.contains($0) }) else {
      return nil
    }
    return method.uppercased()
  }

  private static func looksLikeHTTPRequestLine(_ line: String?) -> Bool {
    guard let line, !line.isEmpty else { return false }
    let parts = line.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
    guard parts.count >= 2 else { return false }
    let method = String(parts[0])
    guard !method.isEmpty, method.unicodeScalars.allSatisfy({ CharacterSet.letters.contains($0) }) else {
      return false
    }
    if method.uppercased() == "PRI" { return false }
    let target = String(parts[1])
    return target.hasPrefix("/") || target == "*" || target.contains("://")
  }

  private static func hexPreview(_ bytes: Data, maxBytes: Int) -> String {
    let n = min(bytes.count, maxBytes)
    var parts: [String] = []
    parts.reserveCapacity(n)
    for i in 0..<n {
      parts.append(String(format: "%02x", bytes[i]))
    }
    var out = parts.joined(separator: " ")
    if bytes.count > maxBytes { out += " …" }
    return out
  }

  private static func asciiPreview(_ bytes: Data, maxBytes: Int) -> String {
    let n = min(bytes.count, maxBytes)
    var out = ""
    out.reserveCapacity(n)
    for i in 0..<n {
      let c = Int(bytes[i])
      out.append((c >= 0x20 && c <= 0x7e) ? Character(UnicodeScalar(c)!) : ".")
    }
    if bytes.count > maxBytes { out.append("…") }
    return out
  }

  private static func emptyTiming(totalMs: Int) -> [String: Int] {
    timingSample(totalMs: max(1, totalMs))
  }

  private static func timingSample(
    dnsMs: Int = 0,
    connectMs: Int = 0,
    tlsMs: Int = 0,
    ttfbMs: Int = 0,
    downloadMs: Int = 0,
    totalMs: Int
  ) -> [String: Int] {
    [
      "dnsMs": max(0, dnsMs),
      "connectMs": max(0, connectMs),
      "tlsMs": max(0, tlsMs),
      "ttfbMs": max(0, ttfbMs),
      "downloadMs": max(0, downloadMs),
      "totalMs": max(1, totalMs),
    ]
  }

  private static func relay(from source: NWConnection, to dest: NWConnection, queue: DispatchQueue) {
    source.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
      if let data, !data.isEmpty {
        dest.send(content: data, completion: .contentProcessed { sendError in
          if sendError != nil || isComplete || error != nil {
            source.cancel()
            dest.cancel()
          } else {
            relay(from: source, to: dest, queue: queue)
          }
        })
      } else {
        source.cancel()
        dest.cancel()
      }
    }
  }
}
