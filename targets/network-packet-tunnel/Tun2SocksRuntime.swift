import Foundation
import Darwin

/// hev-socks5-tunnel runtime: Packet Tunnel utun fd → socks5://127.0.0.1:1080
final class Tun2SocksRuntime {
  private let mtu: Int
  private let socksPort: UInt16
  private var thread: Thread?
  private let lock = NSLock()
  private var running = false

  init(socksPort: UInt16 = LenswireShared.socksPort, mtu: Int = 1500) {
    self.socksPort = socksPort
    self.mtu = mtu
  }

  func start() throws {
    lock.lock()
    defer { lock.unlock() }
    guard !running else { return }

    let fd = lenswire_find_utun_fd()
    guard fd >= 0 else {
      throw NSError(
        domain: "Tun2SocksRuntime",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Packet Tunnel utun file descriptor not found"]
      )
    }

    let config = """
    tunnel:
      mtu: \(mtu)
    socks5:
      port: \(socksPort)
      address: 127.0.0.1
      udp: 'udp'
    misc:
      task-stack-size: 24576
      tcp-buffer-size: 4096
      max-session-count: 768
      connect-timeout: 5000
      read-write-timeout: 60000
      log-level: warn
    """

    running = true
    let thread = Thread { [weak self] in
      defer {
        self?.lock.lock()
        self?.running = false
        self?.lock.unlock()
      }
      config.withCString { ptr in
        let bytes = UnsafeRawPointer(ptr).assumingMemoryBound(to: UInt8.self)
        _ = hev_socks5_tunnel_main_from_str(bytes, UInt32(config.utf8.count), fd)
      }
    }
    thread.name = "lenswire-tun2socks"
    thread.qualityOfService = .userInitiated
    self.thread = thread
    thread.start()
  }

  func stop() {
    lock.lock()
    let wasRunning = running
    lock.unlock()
    guard wasRunning else { return }
    hev_socks5_tunnel_quit()
    thread?.cancel()
    thread = nil
    lock.lock()
    running = false
    lock.unlock()
  }
}
