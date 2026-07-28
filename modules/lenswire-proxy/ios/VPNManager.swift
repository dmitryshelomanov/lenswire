import Foundation
import CFNetwork
import NetworkExtension

final class VPNManager {
  static let shared = VPNManager()
  private let probeQueue = DispatchQueue(label: "lenswire.probe.queue", qos: .utility)

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

  func getStatus() -> String {
    return UserDefaults.standard.string(forKey: "lenswire.vpn.status") ?? "stopped"
  }

  func start(completion: @escaping (Error?) -> Void) {
    NETunnelProviderManager.loadAllFromPreferences { managers, error in
      if let error {
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
          completion(saveError)
          return
        }
        manager.loadFromPreferences { loadError in
          if let loadError {
            completion(loadError)
            return
          }
          do {
            try manager.connection.startVPNTunnel()
            UserDefaults.standard.set("listening", forKey: "lenswire.vpn.status")
            completion(nil)
          } catch {
            completion(error)
          }
        }
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
        UserDefaults.standard.set("stopped", forKey: "lenswire.vpn.status")
        completion(nil)
        return
      }
      manager.connection.stopVPNTunnel()
      manager.isEnabled = false
      manager.saveToPreferences { saveError in
        UserDefaults.standard.set("stopped", forKey: "lenswire.vpn.status")
        completion(saveError)
      }
    }
  }

  func getCaptures() -> [[String: Any]] {
    LenswireShared.readCaptures()
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
      config.connectionProxyDictionary = [
        kCFNetworkProxiesHTTPEnable as String: 1,
        kCFNetworkProxiesHTTPProxy as String: "127.0.0.1",
        kCFNetworkProxiesHTTPPort as String: Int(LenswireShared.proxyPort),
        kCFNetworkProxiesHTTPSEnable as String: 1,
        kCFNetworkProxiesHTTPSProxy as String: "127.0.0.1",
        kCFNetworkProxiesHTTPSPort as String: Int(LenswireShared.proxyPort),
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

      session.invalidateAndCancel()
      completion(taskError)
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
