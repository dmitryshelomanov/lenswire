import NetworkExtension
import os.log

private let log = OSLog(subsystem: "com.lenswire.app", category: "PacketTunnel")

class PacketTunnelProvider: NEPacketTunnelProvider {
  private let proxyServer = LocalProxyServer()
  private var socksBridge: SocksBridgeServer?
  private var tun2Socks: Tun2SocksRuntime?

  override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
    ProxyRuntimeStore.status = "connecting"
    ProxyRuntimeStore.lastError = nil
    UnderlyingNetwork.configure()

    do {
      try proxyServer.start()
    } catch {
      failStart(error.localizedDescription, completionHandler: completionHandler)
      return
    }

    let socks = SocksBridgeServer(
      localProxyPort: LenswireShared.proxyPort,
      listenPort: LenswireShared.socksPort
    )
    do {
      try socks.start()
      socksBridge = socks
    } catch {
      proxyServer.stop()
      failStart(error.localizedDescription, completionHandler: completionHandler)
      return
    }

    let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    settings.mtu = 1500

    let ipv4 = NEIPv4Settings(addresses: ["10.8.0.2"], subnetMasks: ["255.255.255.0"])
    ipv4.includedRoutes = [NEIPv4Route.default()]
    settings.ipv4Settings = ipv4

    let includeIpv6 = LenswireShared.ipv6RouteEnabled
    if includeIpv6 {
      let ipv6 = NEIPv6Settings(addresses: ["fd00:8::2"], networkPrefixLengths: [64])
      ipv6.includedRoutes = [NEIPv6Route.default()]
      settings.ipv6Settings = ipv6
    }

    let dns = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
    settings.dnsSettings = dns
    // Full TUN stack — no NEProxySettings (traffic goes packetFlow → hev → SOCKS → MITM).

    setTunnelNetworkSettings(settings) { [weak self] error in
      guard let self else {
        completionHandler(error)
        return
      }
      if let error {
        self.teardownStack()
        self.failStart(error.localizedDescription, completionHandler: completionHandler)
        return
      }

      let engine = Tun2SocksRuntime(socksPort: LenswireShared.socksPort, mtu: 1500)
      do {
        try engine.start()
        self.tun2Socks = engine
      } catch {
        self.teardownStack()
        self.failStart(error.localizedDescription, completionHandler: completionHandler)
        return
      }

      let caReady = CertificateAuthority.shared.isReady()
      var routes: [String] = ["0.0.0.0/0"]
      if includeIpv6 { routes.append("::/0") }

      ProxyRuntimeStore.status = "listening"
      ProxyRuntimeStore.lastError = nil
      MitmBypassStore.clear()
      CertificateAuthority.shared.clearAllLeaves()
      QuicUdpBlock.reset()
      ProxyRuntimeStore.diagnostics = [
        "mode": "full_tun",
        "proxyPort": Int(LenswireShared.proxyPort),
        "socksPort": Int(LenswireShared.socksPort),
        "routes": routes,
        "ipv6RouteEnabled": includeIpv6,
        "dns": ["1.1.1.1", "8.8.8.8"],
        "underlyingNetwork": UnderlyingNetwork.diagnostics(),
        "path": UnderlyingNetwork.pathSummary(),
        "httpsDecrypt": LenswireShared.httpsDecryptEnabled,
        "caReady": caReady,
        "quicUdpBlocked": true,
        "quicDecrypt": false,
        "quicDrops": QuicUdpBlock.dropCount(),
        "udpAssociate": true,
        "capabilities": [
          "httpCapture": true,
          "httpsMitmNonPinned": true,
          "pinnedTrafficDecrypt": false,
          "nonHttpPortsVisible": true,
          "tcpOnlySocks": false,
          "quicDecrypt": false,
          "quicUdpBlocked": true,
        ],
      ]
      os_log("Lenswire full_tun listening proxy=%{public}d socks=%{public}d", log: log, type: .info,
             Int(LenswireShared.proxyPort), Int(LenswireShared.socksPort))
      completionHandler(nil)
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
    teardownStack()
    ProxyRuntimeStore.markStopped()
    completionHandler()
  }

  private func teardownStack() {
    tun2Socks?.stop()
    tun2Socks = nil
    socksBridge?.stop()
    socksBridge = nil
    proxyServer.stop()
    UnderlyingNetwork.clear()
  }

  private func failStart(_ message: String, completionHandler: @escaping (Error?) -> Void) {
    os_log("Lenswire tunnel start failed: %{public}@", log: log, type: .error, message)
    ProxyRuntimeStore.markError(message)
    ProxyRuntimeStore.diagnostics = [
      "mode": "error",
      "proxyPort": Int(LenswireShared.proxyPort),
      "socksPort": Int(LenswireShared.socksPort),
      "lastError": message,
    ]
    completionHandler(
      NSError(domain: "LenswireTunnel", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    )
  }
}
