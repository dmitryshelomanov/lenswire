import Foundation
import NetworkExtension

final class VPNManager {
  static let shared = VPNManager()

  #if targetEnvironment(simulator)
  private let proxyServer = LocalProxyServer()
  private var simulatorListening = false
  #endif

  var isSimulator: Bool {
    #if targetEnvironment(simulator)
    true
    #else
    false
    #endif
  }

  private var providerBundleId: String {
    guard let mainId = Bundle.main.bundleIdentifier else {
      return "com.lenswire.app.network-packet-tunnel"
    }
    return "\(mainId).\(LenswireShared.providerBundleSuffix)"
  }

  func getStatus() -> String {
    #if targetEnvironment(simulator)
    return simulatorListening ? "listening" : "stopped"
    #else
    return UserDefaults.standard.string(forKey: "lenswire.vpn.status") ?? "stopped"
    #endif
  }

  func start(completion: @escaping (Error?) -> Void) {
    #if targetEnvironment(simulator)
    do {
      try proxyServer.start()
      simulatorListening = true
      UserDefaults.standard.set("listening", forKey: "lenswire.vpn.status")
      completion(nil)
    } catch {
      completion(error)
    }
    #else
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
    #endif
  }

  func stop(completion: @escaping (Error?) -> Void) {
    #if targetEnvironment(simulator)
    proxyServer.stop()
    simulatorListening = false
    UserDefaults.standard.set("stopped", forKey: "lenswire.vpn.status")
    completion(nil)
    #else
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
    #endif
  }

  func getCaptures() -> [[String: Any]] {
    LenswireShared.readCaptures()
  }

  func clearCaptures() {
    LenswireShared.clearCaptures()
  }

  /// Hits the in-process proxy with a plain HTTP request so Simulator Dev Mode records a real capture.
  func sendProbe(completion: @escaping (Error?) -> Void) {
    #if targetEnvironment(simulator)
    guard simulatorListening else {
      completion(NSError(
        domain: "LenswireProxy",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Start capture before sending a test request."]
      ))
      return
    }

    let config = URLSessionConfiguration.ephemeral
    config.connectionProxyDictionary = [
      "HTTPEnable": 1,
      "HTTPProxy": "127.0.0.1",
      "HTTPPort": Int(LenswireShared.proxyPort),
      "HTTPSEnable": 1,
      "HTTPSProxy": "127.0.0.1",
      "HTTPSPort": Int(LenswireShared.proxyPort),
    ]
    config.timeoutIntervalForRequest = 15

    let session = URLSession(configuration: config)
    guard let url = URL(string: "http://example.com/") else {
      completion(NSError(
        domain: "LenswireProxy",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Invalid probe URL"]
      ))
      return
    }

    session.dataTask(with: url) { _, _, error in
      // Capture is written by LocalProxyServer when the proxied request arrives.
      DispatchQueue.main.async {
        completion(error)
      }
    }.resume()
    #else
    completion(NSError(
      domain: "LenswireProxy",
      code: 3,
      userInfo: [NSLocalizedDescriptionKey: "Probe is only available in Simulator Dev Mode."]
    ))
    #endif
  }
}
