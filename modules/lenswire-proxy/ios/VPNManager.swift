import Foundation
import CFNetwork
import NetworkExtension

final class VPNManager {
  static let shared = VPNManager()
  private let probeQueue = DispatchQueue(label: "lenswire.probe.queue", qos: .utility)
  private let statusKey = "lenswire.vpn.status"
  private var statusObserver: NSObjectProtocol?

  private struct ProbeRequest {
    let method: String
    let url: URL
    let headers: [String: String]
    let body: Data?
  }

  private var providerBundleId: String {
    guard let mainId = Bundle.main.bundleIdentifier else {
      return "com.lenswire.app.network-packet-tunnel"
    }
    return "\(mainId).\(LenswireShared.providerBundleSuffix)"
  }

  private init() {
    statusObserver = NotificationCenter.default.addObserver(
      forName: .NEVPNStatusDidChange,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let connection = notification.object as? NEVPNConnection else { return }
      self?.syncStatus(from: connection.status)
    }
  }

  func getStatus() -> String {
    return UserDefaults.standard.string(forKey: statusKey) ?? "stopped"
  }

  private func setStatus(_ status: String) {
    UserDefaults.standard.set(status, forKey: statusKey)
  }

  private func syncStatus(from vpnStatus: NEVPNStatus) {
    switch vpnStatus {
    case .connecting, .reasserting:
      setStatus("connecting")
    case .connected:
      setStatus("listening")
    case .disconnecting:
      setStatus("connecting")
    case .disconnected, .invalid:
      if getStatus() != "error" {
        setStatus("stopped")
      }
    @unknown default:
      break
    }
  }

  func start(completion: @escaping (Error?) -> Void) {
    setStatus("connecting")
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error {
        self.setStatus("error")
        completion(error)
        return
      }

      let manager = managers?.first { $0.protocolConfiguration is NETunnelProviderProtocol } ?? NETunnelProviderManager()

      let proto = NETunnelProviderProtocol()
      proto.providerBundleIdentifier = self.providerBundleId
      proto.serverAddress = "Lenswire"
      manager.protocolConfiguration = proto
      manager.localizedDescription = "Lenswire"
      manager.isEnabled = true

      manager.saveToPreferences { saveError in
        if let saveError {
          self.setStatus("error")
          completion(saveError)
          return
        }
        manager.loadFromPreferences { loadError in
          if let loadError {
            self.setStatus("error")
            completion(loadError)
            return
          }
          do {
            try manager.connection.startVPNTunnel()
            self.syncStatus(from: manager.connection.status)
            self.awaitConnected(manager: manager, attemptsLeft: 40) { readyError in
              if let readyError {
                self.setStatus("error")
                completion(readyError)
              } else {
                self.setStatus("listening")
                completion(nil)
              }
            }
          } catch {
            self.setStatus("error")
            completion(error)
          }
        }
      }
    }
  }

  private func awaitConnected(
    manager: NETunnelProviderManager,
    attemptsLeft: Int,
    completion: @escaping (Error?) -> Void
  ) {
    let status = manager.connection.status
    if status == .connected {
      completion(nil)
      return
    }
    if status == .disconnected || status == .invalid {
      completion(NSError(
        domain: "LenswireProxy",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "VPN tunnel failed to connect."]
      ))
      return
    }
    if attemptsLeft <= 0 {
      completion(NSError(
        domain: "LenswireProxy",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "VPN tunnel connect timed out."]
      ))
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
      manager.loadFromPreferences { _ in
        self.awaitConnected(manager: manager, attemptsLeft: attemptsLeft - 1, completion: completion)
      }
    }
  }

  func stop(completion: @escaping (Error?) -> Void) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error {
        completion(error)
        return
      }
      guard let manager = managers?.first else {
        self.setStatus("stopped")
        completion(nil)
        return
      }
      manager.connection.stopVPNTunnel()
      manager.isEnabled = false
      manager.saveToPreferences { saveError in
        self.setStatus("stopped")
        completion(saveError)
      }
    }
  }

  func getCapturesRevision() -> Int64 {
    LenswireShared.capturesRevision()
  }

  func getCaptures() -> [[String: Any]] {
    LenswireShared.readCaptures(summaries: true)
  }

  func getCapture(id: String) -> [String: Any]? {
    LenswireShared.readCapture(id: id)
  }

  func clearCaptures() {
    LenswireShared.clearCaptures()
  }

  func sendProbe(probeType: String?, useHttps: Bool?, completion: @escaping (Error?) -> Void) {
    guard getStatus() == "listening" else {
      completion(NSError(
        domain: "LenswireProxy",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Start capture before sending a test request."]
      ))
      return
    }

    probeQueue.async {
      let probe = self.buildProbeRequest(probeType: probeType, useHttps: useHttps)
      var request = URLRequest(url: probe.url)
      request.httpMethod = probe.method
      request.httpBody = probe.body
      request.timeoutInterval = 20
      probe.headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }

      let config = URLSessionConfiguration.ephemeral
      // Prefer the tunnel's NEProxySettings. Also set explicit HTTP(S) proxy keys so the
      // probe still hits LocalProxyServer if system proxy is not yet applied.
      // HTTPS* CFNetwork constants are macOS-only — use string keys.
      config.connectionProxyDictionary = [
        kCFNetworkProxiesHTTPEnable as String: 1,
        kCFNetworkProxiesHTTPProxy as String: "127.0.0.1",
        kCFNetworkProxiesHTTPPort as String: Int(LenswireShared.proxyPort),
        "HTTPSEnable": 1,
        "HTTPSProxy": "127.0.0.1",
        "HTTPSPort": Int(LenswireShared.proxyPort),
      ]
      let session = URLSession(configuration: config)
      let semaphore = DispatchSemaphore(value: 0)
      var taskError: Error?

      let task = session.dataTask(with: request) { _, response, error in
        if let error {
          taskError = error
        } else if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
          taskError = NSError(
            domain: "LenswireProxy",
            code: http.statusCode,
            userInfo: [NSLocalizedDescriptionKey: "Probe upstream returned HTTP \(http.statusCode)"]
          )
        }
        semaphore.signal()
      }
      task.resume()

      if semaphore.wait(timeout: .now() + 25) == .timedOut {
        task.cancel()
        taskError = NSError(
          domain: "LenswireProxy",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Probe timed out."]
        )
      }

      session.finishTasksAndInvalidate()
      DispatchQueue.main.async {
        completion(taskError)
      }
    }
  }

  private func buildProbeRequest(probeType: String?, useHttps: Bool?) -> ProbeRequest {
    let selected = (probeType ?? "http_get").lowercased()
    let scheme: String = {
      if selected == "https_get" { return "https" }
      return useHttps == true ? "https" : "http"
    }()
    switch selected {
    case "https_get":
      return ProbeRequest(
        method: "GET",
        url: URL(string: "https://httpbin.org/get?probe=https_get")!,
        headers: [:],
        body: nil
      )
    case "post_json":
      let body = """
      {
        "probe":"post_json",
        "client":"lenswire",
        "platform":"ios",
        "features":["pretty-json","payload-render"]
      }
      """.data(using: .utf8)!
      return ProbeRequest(
        method: "POST",
        url: URL(string: "\(scheme)://httpbin.org/post")!,
        headers: ["Content-Type": "application/json; charset=utf-8"],
        body: body
      )
    case "post_form_urlencoded":
      let body = "probe=post_form_urlencoded&client=lenswire&platform=ios".data(using: .utf8)!
      return ProbeRequest(
        method: "POST",
        url: URL(string: "\(scheme)://httpbin.org/post")!,
        headers: ["Content-Type": "application/x-www-form-urlencoded; charset=utf-8"],
        body: body
      )
    case "post_multipart":
      let boundary = "----LenswireProbeBoundary\(Int(Date().timeIntervalSince1970))"
      return ProbeRequest(
        method: "POST",
        url: URL(string: "\(scheme)://httpbin.org/post")!,
        headers: ["Content-Type": "multipart/form-data; boundary=\(boundary)"],
        body: buildMultipartBody(boundary: boundary)
      )
    case "get_image":
      return ProbeRequest(
        method: "GET",
        url: URL(string: "\(scheme)://httpbin.org/image/png")!,
        headers: [:],
        body: nil
      )
    case "http_get":
      fallthrough
    default:
      return ProbeRequest(
        method: "GET",
        url: URL(string: "\(scheme)://httpbin.org/get?probe=http_get")!,
        headers: [:],
        body: nil
      )
    }
  }

  private func buildMultipartBody(boundary: String) -> Data {
    var body = Data()
    let lines = [
      "--\(boundary)\r\n",
      "Content-Disposition: form-data; name=\"probe\"\r\n\r\n",
      "post_multipart\r\n",
      "--\(boundary)\r\n",
      "Content-Disposition: form-data; name=\"platform\"\r\n\r\n",
      "ios\r\n",
      "--\(boundary)\r\n",
      "Content-Disposition: form-data; name=\"file\"; filename=\"probe.txt\"\r\n",
      "Content-Type: text/plain\r\n\r\n",
      "Lenswire multipart probe body\n",
      "--\(boundary)--\r\n",
    ]
    for line in lines {
      body.append(line.data(using: .utf8)!)
    }
    return body
  }
}
