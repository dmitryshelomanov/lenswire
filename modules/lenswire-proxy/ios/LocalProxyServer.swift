import Foundation
import Network

final class LocalProxyServer {
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "com.lenswire.localproxy", qos: .userInitiated)

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

  private func handle(connection: NWConnection) {
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
      guard let self, let data, !data.isEmpty else {
        connection.cancel()
        return
      }
      self.processRequest(data: data, client: connection)
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
    let id = UUID().uuidString
    let startedAt = Int(Date().timeIntervalSince1970 * 1000)

    var host = "unknown"
    var path = "/"
    var scheme = "http"
    var query = ""
    var upstreamURL: URL?

    if method == "CONNECT" {
      let hostPort = target.split(separator: ":")
      host = String(hostPort.first ?? "unknown")
      scheme = "https"
      path = "/"
    } else if let url = URL(string: target), let urlHost = url.host {
      host = urlHost
      path = url.path.isEmpty ? "/" : url.path
      scheme = url.scheme ?? "http"
      query = url.query ?? ""
      upstreamURL = url
    } else if target.hasPrefix("/") {
      // Origin-form — Host header required for upstream.
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

    // Prefer forwarding plain HTTP so Simulator probe / Mac-proxy Safari can complete.
    if method != "CONNECT", let upstreamURL {
      Self.forwardHTTP(requestData: data, upstreamURL: upstreamURL, client: client) { status in
        LenswireShared.appendCapture([
          "id": id,
          "startedAt": startedAt,
          "method": method,
          "scheme": scheme,
          "host": host,
          "path": path,
          "query": query,
          "status": status,
        ])
      }
      return
    }

    LenswireShared.appendCapture([
      "id": id,
      "startedAt": startedAt,
      "method": method,
      "scheme": scheme,
      "host": host,
      "path": path,
      "query": query,
      "status": method == "CONNECT" ? 200 : 502,
    ])

    if method == "CONNECT" {
      let response = "HTTP/1.1 200 Connection Established\r\n\r\n"
      client.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
        client.cancel()
      })
      return
    }

    let body = "Lenswire proxy (capture only)\r\n"
    let response = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
    client.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
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

  private static func forwardHTTP(
    requestData: Data,
    upstreamURL: URL,
    client: NWConnection,
    onStatus: @escaping (Int) -> Void
  ) {
    var request = URLRequest(url: upstreamURL)
    if let text = String(data: requestData, encoding: .utf8) {
      let lines = text.components(separatedBy: "\r\n")
      if let first = lines.first {
        let parts = first.split(separator: " ", omittingEmptySubsequences: true)
        if let method = parts.first {
          request.httpMethod = String(method)
        }
      }
      for line in lines.dropFirst() {
        if line.isEmpty { break }
        let headerParts = line.split(separator: ":", maxSplits: 1)
        guard headerParts.count == 2 else { continue }
        let key = String(headerParts[0])
        let value = headerParts[1].trimmingCharacters(in: .whitespaces)
        if key.lowercased() == "proxy-connection" { continue }
        request.setValue(value, forHTTPHeaderField: key)
      }
    }

    URLSession.shared.dataTask(with: request) { data, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? (error == nil ? 200 : 502)
      onStatus(status)

      guard error == nil, let http = response as? HTTPURLResponse else {
        let body = "Lenswire upstream error\r\n"
        let payload = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
        client.send(content: payload.data(using: .utf8), completion: .contentProcessed { _ in
          client.cancel()
        })
        return
      }

      var headerLines = ["HTTP/1.1 \(http.statusCode) \(HTTPURLResponse.localizedString(forStatusCode: http.statusCode))"]
      for (key, value) in http.allHeaderFields {
        guard let key = key as? String, let value = value as? String else { continue }
        if key.lowercased() == "transfer-encoding" { continue }
        headerLines.append("\(key): \(value)")
      }
      let bodyData = data ?? Data()
      headerLines.append("Content-Length: \(bodyData.count)")
      headerLines.append("Connection: close")
      headerLines.append("")
      headerLines.append("")
      var payload = headerLines.joined(separator: "\r\n").data(using: .utf8) ?? Data()
      payload.append(bodyData)
      client.send(content: payload, completion: .contentProcessed { _ in
        client.cancel()
      })
    }.resume()
  }
}
