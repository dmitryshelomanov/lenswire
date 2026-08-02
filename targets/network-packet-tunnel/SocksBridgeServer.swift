import Foundation
import Darwin

/// SOCKS5 front-end for hev tun2socks → LocalProxyServer (Android `SocksBridgeServer` port).
final class SocksBridgeServer {
  private let localProxyPort: UInt16
  private let listenPort: UInt16
  private let queue = DispatchQueue(label: "com.lenswire.socks", qos: .userInitiated, attributes: .concurrent)
  private let acceptQueue = DispatchQueue(label: "com.lenswire.socks.accept", qos: .userInitiated)
  private var serverFD: Int32 = -1
  private let running = LockedFlag()

  init(localProxyPort: UInt16 = LenswireShared.proxyPort, listenPort: UInt16 = LenswireShared.socksPort) {
    self.localProxyPort = localProxyPort
    self.listenPort = listenPort
  }

  func start() throws {
    guard running.setTrueIfFalse() else { return }

    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else {
      running.setFalse()
      throw posixError("socket")
    }

    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout.size(ofValue: yes)))

    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = listenPort.bigEndian
    addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

    let bindResult = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bindResult == 0 else {
      close(fd)
      running.setFalse()
      throw posixError("bind :\(listenPort)")
    }
    guard listen(fd, 50) == 0 else {
      close(fd)
      running.setFalse()
      throw posixError("listen")
    }

    serverFD = fd
    acceptQueue.async { [weak self] in
      self?.acceptLoop()
    }
  }

  func stop() {
    running.setFalse()
    if serverFD >= 0 {
      close(serverFD)
      serverFD = -1
    }
  }

  private func acceptLoop() {
    while running.value {
      var addr = sockaddr_in()
      var len = socklen_t(MemoryLayout<sockaddr_in>.size)
      let client = withUnsafeMutablePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          accept(serverFD, $0, &len)
        }
      }
      if client < 0 {
        if !running.value { break }
        continue
      }
      queue.async { [weak self] in
        self?.handleClient(client)
      }
    }
  }

  private func handleClient(_ client: Int32) {
    defer { close(client) }
    setTimeout(client, ms: 25_000)
    do {
      guard try handshake(client) else { return }
      guard let req = try readRequest(client) else { return }
      switch req {
      case .udpAssociate:
        handleUdpAssociate(client)
      case .connect(let target):
        try handleTcpConnect(client, target: target)
      }
    } catch {
      // Expected on client disconnect / teardown.
    }
  }

  private func handleTcpConnect(_ client: Int32, target: Target) throws {
    if target.port == 80 {
      let proxy = try connectLoopback(port: localProxyPort)
      defer { close(proxy) }
      try writeAll(client, Data([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      relayBidirectional(client: client, proxy: proxy)
      return
    }

    // Reply SOCKS OK first so the app sends ClientHello, then CONNECT + SNI.
    try writeAll(client, Data([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    setTimeout(client, ms: 12_000)
    let peek = TlsSni.peekClientHello(from: client)

    let proxy = try connectLoopback(port: localProxyPort)
    defer { close(proxy) }
    setTimeout(proxy, ms: 25_000)

    let sni = peek.sniHostname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let sniHeader = sni.isEmpty ? "" : "X-Lenswire-SNI: \(sni)\r\n"
    let connectReq =
      "CONNECT \(target.host):\(target.port) HTTP/1.1\r\n" +
      "Host: \(target.host):\(target.port)\r\n" +
      sniHeader +
      "Connection: keep-alive\r\n\r\n"
    try writeAll(proxy, Data(connectReq.utf8))
    let status = try readHttpStatusLine(proxy)
    guard status.contains(" 200 ") else { return }
    if !peek.bytes.isEmpty {
      try writeAll(proxy, peek.bytes)
    }
    setTimeout(client, ms: 0)
    relayBidirectional(client: client, proxy: proxy)
  }

  private func handleUdpAssociate(_ client: Int32) {
    let relay = socket(AF_INET, SOCK_DGRAM, 0)
    guard relay >= 0 else { return }
    defer { close(relay) }

    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = 0
    addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bindOk = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(relay, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bindOk == 0 else { return }

    var bound = sockaddr_in()
    var boundLen = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &bound) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        getsockname(relay, $0, &boundLen)
      }
    }
    let relayPort = UInt16(bigEndian: bound.sin_port)
    let portHi = UInt8((relayPort >> 8) & 0xff)
    let portLo = UInt8(relayPort & 0xff)
    try? writeAll(client, Data([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, portHi, portLo]))

    setTimeout(client, ms: 0)
    var tv = timeval(tv_sec: 2, tv_usec: 0)
    setsockopt(relay, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout.size(ofValue: tv)))

    let done = LockedFlag()
    queue.async { [weak self] in
      guard let self else { return }
      var buf = [UInt8](repeating: 0, count: 64 * 1024)
      while self.running.value && !done.value {
        var from = sockaddr_in()
        var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        let n = withUnsafeMutablePointer(to: &from) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            recvfrom(relay, &buf, buf.count, 0, $0, &fromLen)
          }
        }
        if n < 0 {
          if errno == EAGAIN || errno == EWOULDBLOCK { continue }
          break
        }
        self.handleSocksUdpDatagram(
          relay: relay,
          packet: Array(buf.prefix(Int(n))),
          from: from
        )
      }
      done.setTrueIfFalse()
      // Wake control connection.
      shutdown(client, SHUT_RDWR)
    }

    var sink = [UInt8](repeating: 0, count: 256)
    while running.value && !done.value {
      let n = recv(client, &sink, sink.count, 0)
      if n <= 0 { break }
    }
    done.setTrueIfFalse()
  }

  private func handleSocksUdpDatagram(relay: Int32, packet: [UInt8], from: sockaddr_in) {
    guard packet.count >= 4 else { return }
    let frag = Int(packet[2])
    guard frag == 0 else { return }
    let atyp = Int(packet[3])
    var idx = 4
    let destHost: String
    var destAddr = sockaddr_in()
    destAddr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    destAddr.sin_family = sa_family_t(AF_INET)

    switch atyp {
    case 0x01:
      guard idx + 4 <= packet.count else { return }
      var raw = (packet[idx], packet[idx + 1], packet[idx + 2], packet[idx + 3])
      memcpy(&destAddr.sin_addr, &raw, 4)
      destHost = String(cString: inet_ntoa(destAddr.sin_addr))
      idx += 4
    case 0x03:
      guard idx < packet.count else { return }
      let hostLen = Int(packet[idx]); idx += 1
      guard idx + hostLen <= packet.count else { return }
      destHost = String(bytes: packet[idx..<(idx + hostLen)], encoding: .ascii) ?? ""
      idx += hostLen
      guard let resolved = resolveIPv4(destHost) else { return }
      destAddr.sin_addr = resolved
    case 0x04:
      // IPv6 not handled in this MVP path (Android resolves; we skip).
      return
    default:
      return
    }

    guard idx + 2 <= packet.count else { return }
    let destPort = (Int(packet[idx]) << 8) | Int(packet[idx + 1])
    idx += 2
    if destPort == 443 {
      QuicUdpBlock.recordDrop(host: destHost)
      return
    }
    let payload = Array(packet[idx...])
    destAddr.sin_port = UInt16(destPort).bigEndian

    let outbound = socket(AF_INET, SOCK_DGRAM, 0)
    guard outbound >= 0 else { return }
    defer { close(outbound) }
    var tv = timeval(tv_sec: 5, tv_usec: 0)
    setsockopt(outbound, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout.size(ofValue: tv)))

    let sent = payload.withUnsafeBytes { raw in
      withUnsafePointer(to: &destAddr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          sendto(outbound, raw.baseAddress, payload.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
    guard sent >= 0 else { return }

    var respBuf = [UInt8](repeating: 0, count: 64 * 1024)
    let received = recv(outbound, &respBuf, respBuf.count, 0)
    guard received > 0 else { return }

    var header = Array(packet.prefix(idx))
    if header.count >= 3 {
      header[0] = 0
      header[1] = 0
      header[2] = 0
    }
    var response = header
    response.append(contentsOf: respBuf.prefix(Int(received)))

    var fromCopy = from
    _ = response.withUnsafeBytes { raw in
      withUnsafePointer(to: &fromCopy) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          sendto(relay, raw.baseAddress, response.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
  }

  private func handshake(_ client: Int32) throws -> Bool {
    let ver = try readByte(client)
    guard ver == 0x05 else { return false }
    let methodsCount = Int(try readByte(client))
    guard methodsCount > 0 else { return false }
    _ = try readExact(client, methodsCount)
    try writeAll(client, Data([0x05, 0x00]))
    return true
  }

  private struct Target {
    let host: String
    let port: Int
  }

  private enum SocksRequest {
    case connect(Target)
    case udpAssociate
  }

  private func readRequest(_ client: Int32) throws -> SocksRequest? {
    let ver = try readByte(client)
    let cmd = try readByte(client)
    _ = try readByte(client) // RSV
    let atyp = try readByte(client)
    guard ver == 0x05 else {
      try writeAll(client, Data([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      return nil
    }

    let host: String
    switch atyp {
    case 0x01:
      let bytes = try readExact(client, 4)
      var addr = in_addr()
      _ = bytes.withUnsafeBytes { raw in
        memcpy(&addr, raw.baseAddress, 4)
      }
      host = String(cString: inet_ntoa(addr))
    case 0x03:
      let len = Int(try readByte(client))
      guard len > 0 else { return nil }
      let bytes = try readExact(client, len)
      host = String(bytes: bytes, encoding: .utf8) ?? ""
    case 0x04:
      let bytes = try readExact(client, 16)
      var buf = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
      _ = bytes.withUnsafeBytes { raw in
        inet_ntop(AF_INET6, raw.baseAddress, &buf, socklen_t(INET6_ADDRSTRLEN))
      }
      host = String(cString: buf)
    default:
      try writeAll(client, Data([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      return nil
    }

    let portHi = Int(try readByte(client))
    let portLo = Int(try readByte(client))
    let port = (portHi << 8) | portLo

    switch cmd {
    case 0x01:
      return .connect(Target(host: host, port: port))
    case 0x03:
      return .udpAssociate
    default:
      try writeAll(client, Data([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      return nil
    }
  }

  private func connectLoopback(port: UInt16) throws -> Int32 {
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw posixError("proxy socket") }
    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = port.bigEndian
    addr.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let ok = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard ok == 0 else {
      close(fd)
      throw posixError("connect proxy :\(port)")
    }
    return fd
  }

  private func readHttpStatusLine(_ fd: Int32) throws -> String {
    var buf: [UInt8] = []
    buf.reserveCapacity(256)
    while buf.count < 16_384 {
      let b = try readByte(fd)
      buf.append(b)
      if buf.count >= 4,
         buf[buf.count - 4] == UInt8(ascii: "\r"),
         buf[buf.count - 3] == UInt8(ascii: "\n"),
         buf[buf.count - 2] == UInt8(ascii: "\r"),
         buf[buf.count - 1] == UInt8(ascii: "\n")
      {
        break
      }
    }
    let text = String(bytes: buf, encoding: .isoLatin1) ?? ""
    return text.components(separatedBy: "\r\n").first ?? text
  }

  private func relayBidirectional(client: Int32, proxy: Int32) {
    let group = DispatchGroup()
    group.enter()
    queue.async {
      Self.relay(from: client, to: proxy)
      shutdown(proxy, SHUT_WR)
      group.leave()
    }
    group.enter()
    queue.async {
      Self.relay(from: proxy, to: client)
      shutdown(client, SHUT_WR)
      group.leave()
    }
    group.wait()
  }

  private static func relay(from source: Int32, to sink: Int32) {
    var buf = [UInt8](repeating: 0, count: 32 * 1024)
    while true {
      let n = buf.withUnsafeMutableBytes { raw -> Int in
        guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return -1 }
        return recv(source, base, raw.count, 0)
      }
      if n <= 0 { break }
      var sent = 0
      while sent < n {
        let w = buf.withUnsafeMutableBytes { raw -> Int in
          guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return -1 }
          return send(sink, base + sent, n - sent, 0)
        }
        if w <= 0 { return }
        sent += w
      }
    }
  }

  private func resolveIPv4(_ host: String) -> in_addr? {
    var hints = addrinfo(
      ai_flags: AI_ADDRCONFIG,
      ai_family: AF_INET,
      ai_socktype: SOCK_DGRAM,
      ai_protocol: 0,
      ai_addrlen: 0,
      ai_canonname: nil,
      ai_addr: nil,
      ai_next: nil
    )
    var result: UnsafeMutablePointer<addrinfo>?
    let err = getaddrinfo(host, nil, &hints, &result)
    guard err == 0, let result else { return nil }
    defer { freeaddrinfo(result) }
    guard let addr = result.pointee.ai_addr else { return nil }
    return addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
  }

  private func setTimeout(_ fd: Int32, ms: Int32) {
    var tv = timeval(tv_sec: __darwin_time_t(ms / 1000), tv_usec: __darwin_suseconds_t((ms % 1000) * 1000))
    if ms == 0 {
      tv = timeval(tv_sec: 0, tv_usec: 0)
    }
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout.size(ofValue: tv)))
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout.size(ofValue: tv)))
  }

  private func readByte(_ fd: Int32) throws -> UInt8 {
    var b: UInt8 = 0
    let n = recv(fd, &b, 1, 0)
    guard n == 1 else { throw posixError("read") }
    return b
  }

  private func readExact(_ fd: Int32, _ count: Int) throws -> [UInt8] {
    var out = [UInt8](repeating: 0, count: count)
    var got = 0
    while got < count {
      let n = out.withUnsafeMutableBytes { raw -> Int in
        guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return -1 }
        return recv(fd, base + got, count - got, 0)
      }
      guard n > 0 else { throw posixError("readExact") }
      got += n
    }
    return out
  }

  private func writeAll(_ fd: Int32, _ data: Data) throws {
    try data.withUnsafeBytes { raw in
      guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return }
      var sent = 0
      while sent < data.count {
        let n = send(fd, base + sent, data.count - sent, 0)
        guard n > 0 else { throw posixError("write") }
        sent += n
      }
    }
  }

  private func posixError(_ what: String) -> NSError {
    NSError(
      domain: NSPOSIXErrorDomain,
      code: Int(errno),
      userInfo: [NSLocalizedDescriptionKey: "SOCKS \(what): \(String(cString: strerror(errno)))"]
    )
  }
}

private final class LockedFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var flag = false

  var value: Bool {
    lock.lock()
    defer { lock.unlock() }
    return flag
  }

  @discardableResult
  func setTrueIfFalse() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if flag { return false }
    flag = true
    return true
  }

  func setFalse() {
    lock.lock()
    flag = false
    lock.unlock()
  }
}
