import Foundation
import Network

/// Path monitor + diagnostics for off-tunnel egress (Android `UnderlyingNetwork` analog).
/// Packet Tunnel extension sockets normally leave via the physical interface; we still
/// observe and report the preferred path for Settings diagnostics.
enum UnderlyingNetwork {
  private static let monitor = NWPathMonitor()
  private static let queue = DispatchQueue(label: "com.lenswire.underlying-network")
  private static let lock = NSLock()
  private static var latestPathDescription: String = "unknown"
  private static var latestIsExpensive = false
  private static var latestIsConstrained = false
  private static var latestUsesWifi = false
  private static var latestUsesCellular = false
  private static var latestUsesWired = false
  private static var started = false

  static func configure() {
    lock.lock()
    defer { lock.unlock() }
    guard !started else { return }
    started = true
    monitor.pathUpdateHandler = { path in
      lock.lock()
      latestPathDescription = describe(path)
      latestIsExpensive = path.isExpensive
      latestIsConstrained = path.isConstrained
      latestUsesWifi = path.usesInterfaceType(.wifi)
      latestUsesCellular = path.usesInterfaceType(.cellular)
      latestUsesWired = path.usesInterfaceType(.wiredEthernet)
      lock.unlock()
    }
    monitor.start(queue: queue)
  }

  static func clear() {
    lock.lock()
    defer { lock.unlock() }
    if started {
      monitor.cancel()
      started = false
    }
    latestPathDescription = "unknown"
    latestIsExpensive = false
    latestIsConstrained = false
    latestUsesWifi = false
    latestUsesCellular = false
    latestUsesWired = false
  }

  static func diagnostics() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return [
      "path": latestPathDescription,
      "expensive": latestIsExpensive,
      "constrained": latestIsConstrained,
      "wifi": latestUsesWifi,
      "cellular": latestUsesCellular,
      "wired": latestUsesWired,
    ]
  }

  static func pathSummary() -> String {
    lock.lock()
    defer { lock.unlock() }
    return latestPathDescription
  }

  private static func describe(_ path: NWPath) -> String {
    var parts: [String] = []
    switch path.status {
    case .satisfied: parts.append("satisfied")
    case .unsatisfied: parts.append("unsatisfied")
    case .requiresConnection: parts.append("requiresConnection")
    @unknown default: parts.append("unknown")
    }
    if path.usesInterfaceType(.wifi) { parts.append("wifi") }
    if path.usesInterfaceType(.cellular) { parts.append("cellular") }
    if path.usesInterfaceType(.wiredEthernet) { parts.append("wired") }
    if path.usesInterfaceType(.other) { parts.append("other") }
    if path.isExpensive { parts.append("expensive") }
    if path.isConstrained { parts.append("constrained") }
    return parts.joined(separator: ",")
  }
}
