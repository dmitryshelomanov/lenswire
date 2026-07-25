import Foundation

enum LenswireShared {
  static let appGroupId = "group.com.lenswire.app"
  static let capturesKey = "lenswire.captures"
  static let proxyPort: UInt16 = 9090
  static let providerBundleSuffix = "network-packet-tunnel"
  static let caGeneratedAtKey = "lenswire.ca.generatedAt"
  static let caFingerprintKey = "lenswire.ca.fingerprint"
  static let caPemFileName = "lenswire-ca.pem"

  static var sharedDefaults: UserDefaults {
    UserDefaults(suiteName: appGroupId) ?? .standard
  }

  static func appendCapture(_ entry: [String: Any]) {
    var items = sharedDefaults.array(forKey: capturesKey) as? [[String: Any]] ?? []
    items.insert(entry, at: 0)
    if items.count > 200 { items = Array(items.prefix(200)) }
    sharedDefaults.set(items, forKey: capturesKey)
  }

  static func readCaptures() -> [[String: Any]] {
    sharedDefaults.array(forKey: capturesKey) as? [[String: Any]] ?? []
  }

  static func clearCaptures() {
    sharedDefaults.removeObject(forKey: capturesKey)
  }
}
