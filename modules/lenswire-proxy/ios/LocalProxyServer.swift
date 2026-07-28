import Foundation
import Network

// Keep in sync with targets/network-packet-tunnel/LocalProxyServer.swift
final class LocalProxyServer {
  private static let maxHttpMessageBytes = 2 * 1024 * 1024

  private var listener: NWListener?
  private let queue = DispatchQueue(label: "com.lenswire.localproxy", qos: .userInitiated)
  /// Separate from `queue` so Secure Transport waits do not deadlock NW receive callbacks.
  private let mitmQueue = DispatchQueue(label: "com.lenswire.mitm", qos: .userInitiated, attributes: .concurrent)
  private let bypassLock = NSLock()
  private var mitmBypassHosts = Set<String>()

  func start() throws {
    guard listener == nil else { return }
    let port = NWEndpoint.Port(rawValue: LenswireShared.proxyPort)!
    listener = try NWListener(using: .tcp, on: port)
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
    return mitmBypassHosts.contains(host.lowercased())
  }

  private func addBypass(_ host: String) {
    bypassLock.lock()
    defer { bypassLock.unlock() }
    mitmBypassHosts.insert(host.lowercased())
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
      client: client
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
        let clientHelloExpected = !peek.bytes.isEmpty
        let canMitm = decryptEnabled &&
          caReady &&
          !TlsSni.isIpLiteral(effectiveHost) &&
          !bypassed &&
          clientHelloExpected

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
            clientHelloBytes: clientHelloSize
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
        case .handshakeRejected:
          // Client already saw (or rejected) our MITM cert — ClientHello replay is impossible.
          self.addBypass(effectiveHost)
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
            note: nil
          )
          client.cancel()
        case .hardFailure:
          // Do not passthrough: TLS already started; raw ClientHello replay would desync.
          self.appendTunnelCapture(
            id: UUID().uuidString,
            startedAt: Int(Date().timeIntervalSince1970 * 1000),
            host: effectiveHost,
            connectHost: host,
            connectPort: port,
            target: target,
            status: 502,
            reasonCode: "mitm_error",
            hostnameSource: hostnameSource,
            hostnameConfidence: hostnameConfidence,
            sniHostname: sniHostname,
            tlsMeta: tlsMeta,
            clientHelloBytes: clientHelloSize,
            note: nil
          )
          client.cancel()
        }
      }
    })
  }

  private enum MitmOutcome {
    case success
    case failOpenPassthrough
    case handshakeRejected
    case hardFailure
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
    clientHelloBytes: Int
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
        note: nil
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
          note: sendError.localizedDescription
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
        note: nil
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

      // Read one HTTP/1.1 request from the client.
      var requestData = Data()
      while true {
        let chunk = try serverTLS.read()
        requestData.append(chunk)
        if Self.containsHeaderEnd(requestData) { break }
        if requestData.count > 1024 * 1024 { break }
      }
      requestData = try Self.completeHTTPMessage(initial: requestData, reader: serverTLS)

      var parsed = Self.parseHTTPRequest(requestData)
      let startedAt = Int(Date().timeIntervalSince1970 * 1000)
      let id = UUID().uuidString
      let t0 = Date()

      let upstreamHost = Self.hostFromHeaders(parsed.headers) ?? mitmHost
      var overrideApplied: String? = nil

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
        var responseBytes = Data()
        responseBytes.append(contentsOf: "HTTP/1.1 \(responseRule.status) \(HTTPURLResponse.localizedString(forStatusCode: responseRule.status))\r\n".utf8)
        for (key, value) in mockHeaders {
          responseBytes.append(contentsOf: "\(key): \(value)\r\n".utf8)
        }
        responseBytes.append(contentsOf: "Content-Length: \(mockBody.count)\r\n".utf8)
        responseBytes.append(contentsOf: "Connection: close\r\n\r\n".utf8)
        responseBytes.append(mockBody)
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
          "responseBody": LenswireShared.classifyBody(mockBody, contentType: responseRule.contentType.isEmpty ? nil : responseRule.contentType),
          "timing": Self.timingSample(
            connectMs: totalMs,
            tlsMs: totalMs,
            ttfbMs: totalMs,
            downloadMs: totalMs,
            totalMs: totalMs
          ),
          "overrideApplied": "response",
          "reasonCode": "decrypted",
          "hostnameSource": Self.hostFromHeaders(parsed.headers) != nil ? "host_header" : hostnameSource,
          "hostnameConfidence": Self.hostFromHeaders(parsed.headers) != nil ? "high" : hostnameConfidence,
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
        ])
        serverTLS.close()
        return .success
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
      var responseBytes = Data()
      responseBytes.append(contentsOf: "HTTP/1.1 \(upstreamResponse.status) \(HTTPURLResponse.localizedString(forStatusCode: upstreamResponse.status))\r\n".utf8)
      for (key, value) in upstreamResponse.headers {
        if key.lowercased() == "transfer-encoding" { continue }
        if key.lowercased() == "content-length" { continue }
        responseBytes.append(contentsOf: "\(key): \(value)\r\n".utf8)
      }
      responseBytes.append(contentsOf: "Content-Length: \(upstreamResponse.body.count)\r\n".utf8)
      responseBytes.append(contentsOf: "Connection: close\r\n\r\n".utf8)
      responseBytes.append(upstreamResponse.body)
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
        "hostnameSource": Self.hostFromHeaders(parsed.headers) != nil ? "host_header" : hostnameSource,
        "hostnameConfidence": Self.hostFromHeaders(parsed.headers) != nil ? "high" : hostnameConfidence,
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
      ])

      serverTLS.close()
      return .success
    } catch {
      if !handshakeStarted {
        return .failOpenPassthrough
      }
      if Self.isTlsHandshakeFailure(error) {
        return .handshakeRejected
      }
      return .hardFailure
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
    onCapture: @escaping ([String: Any]) -> Void
  ) {
    let startedAt = Int(Date().timeIntervalSince1970 * 1000)
    let id = UUID().uuidString
    let t0 = Date()
    var parsed = parseHTTPRequest(requestData)
    let captureScheme = scheme == "https" ? "https" : "http"
    let captureHost = host.isEmpty ? (upstreamURL.host ?? "unknown") : host

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
    let message = error.localizedDescription.lowercased()
    let name = String(describing: type(of: error)).lowercased()
    return name.contains("ssl")
      || message.contains("handshake")
      || message.contains("certificate")
      || message.contains("trust")
      || message.contains("protocol")
      || message.contains("tls")
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
    note: String?
  ) {
    let bodyText = note == nil ? reasonCode : "\(reasonCode): \(note!)"
    LenswireShared.appendCapture([
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
      "requestBody": ["kind": "empty", "size": 0],
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
      "captureSummary": Self.summaryForReason(reasonCode),
      "tlsClientHelloBytes": clientHelloBytes,
      "tlsRecordVersion": tlsMeta?.recordVersion ?? NSNull(),
      "tlsClientVersion": tlsMeta?.clientVersion ?? NSNull(),
      "tlsAlpnProtocols": tlsMeta?.alpnProtocols ?? [],
      "tlsSniPresent": tlsMeta?.sniPresent ?? (!(sniHostname ?? "").isEmpty),
    ])
  }

  private static func summaryForReason(_ reasonCode: String) -> String {
    switch reasonCode {
    case "decrypted":
      return "TLS decrypted via MITM; full HTTP payload available."
    case "http_plain":
      return "Plain HTTP capture; full request/response payload available."
    case "decrypt_disabled":
      return "HTTPS decrypt is disabled; connection is captured as a tunnel only."
    case "ca_missing":
      return "CA certificate is missing; connection is captured as a tunnel only."
    case "ip_no_sni":
      return "Target is an IP without SNI; connection is captured as a tunnel only."
    case "no_client_hello":
      return "No TLS ClientHello observed; connection is captured as a tunnel only."
    case "mitm_bypassed":
      return "Host is in MITM bypass list; connection is captured as a tunnel only."
    case "mitm_fail_open":
      return "MITM failed; proxy switched to fail-open tunnel mode."
    case "mitm_handshake_failed":
      return "TLS handshake rejected (client did not trust Lenswire CA, or TLS mismatch). Host bypassed for this VPN session."
    case "mitm_error":
      return "MITM proxy error after TLS handshake; connection closed (not fail-open tunnel)."
    case "upstream_connect_failed":
      return "Proxy could not connect to upstream target."
    case "passthrough":
      return "HTTPS passthrough tunnel; HTTP payload is unavailable."
    default:
      return reasonCode.replacingOccurrences(of: "_", with: " ")
    }
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
