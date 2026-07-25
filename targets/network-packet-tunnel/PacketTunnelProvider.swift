import NetworkExtension

class PacketTunnelProvider: NEPacketTunnelProvider {
  private let proxyServer = LocalProxyServer()

  override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
    do {
      try proxyServer.start()
    } catch {
      completionHandler(error)
      return
    }

    let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
    settings.mtu = 1500

    let ipv4 = NEIPv4Settings(addresses: ["10.8.0.2"], subnetMasks: ["255.255.255.0"])
    ipv4.includedRoutes = [NEIPv4Route.default()]
    settings.ipv4Settings = ipv4

    let dns = NEDNSSettings(servers: ["1.1.1.1", "8.8.8.8"])
    settings.dnsSettings = dns

    let proxy = NEProxySettings()
    proxy.httpEnabled = true
    proxy.httpsEnabled = true
    proxy.httpServer = NEProxyServer(address: "127.0.0.1", port: Int(LenswireShared.proxyPort))
    proxy.httpsServer = NEProxyServer(address: "127.0.0.1", port: Int(LenswireShared.proxyPort))
    proxy.matchDomains = [""]
    settings.proxySettings = proxy

    setTunnelNetworkSettings(settings) { error in
      completionHandler(error)
    }
  }

  override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
    proxyServer.stop()
    completionHandler()
  }
}
