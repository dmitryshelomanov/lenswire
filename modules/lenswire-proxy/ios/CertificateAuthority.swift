import Foundation
import Security

final class CertificateAuthority {
  static let shared = CertificateAuthority()

  private let lock = NSLock()
  private var leafCache: [String: (identity: SecIdentity, expires: Date)] = [:]

  struct Material {
    let certificateDER: Data
    let privateKey: SecKey
    let fingerprint: String
  }

  func isReady() -> Bool {
    FileManager.default.fileExists(atPath: LenswireShared.caCertURL.path)
      && (Self.keychainHasCaKey() || FileManager.default.fileExists(atPath: LenswireShared.caKeyURL.path))
  }

  func load() throws -> Material {
    try loadUnlocked()
  }

  @discardableResult
  func generate() throws -> Material {
    lock.lock()
    defer { lock.unlock() }

    leafCache.removeAll()

    let pair = try X509.generateRSAKeyPair()
    let certDER = try X509.createCACertificate(privateKey: pair.privateKey, publicKey: pair.publicKey)
    let keyData = try X509.exportPrivateKey(pair.privateKey)
    let fingerprint = X509.sha256Fingerprint(der: certDER)
    let pem = X509.pemCertificate(der: certDER)

    try certDER.write(to: LenswireShared.caCertURL, options: .atomic)
    do {
      try Self.storeCaKeyInKeychain(keyData)
      try? FileManager.default.removeItem(at: LenswireShared.caKeyURL)
    } catch {
      // App Group Keychain requires keychain-access-groups; keep shared-file fallback.
      try keyData.write(to: LenswireShared.caKeyURL, options: .atomic)
    }
    try pem.write(to: LenswireShared.caPemURL, atomically: true, encoding: .utf8)
    try? pem.write(to: LenswireShared.documentsCaPemURL, atomically: true, encoding: .utf8)

    let generatedAt = Date().timeIntervalSince1970 * 1000
    let defaults = LenswireShared.sharedDefaults
    defaults.set(fingerprint, forKey: LenswireShared.caFingerprintKey)
    defaults.set(generatedAt, forKey: LenswireShared.caGeneratedAtKey)

    return Material(certificateDER: certDER, privateKey: pair.privateKey, fingerprint: fingerprint)
  }

  func info() -> [String: Any] {
    let defaults = LenswireShared.sharedDefaults
    let fingerprint = defaults.string(forKey: LenswireShared.caFingerprintKey)
    let generatedAt = defaults.double(forKey: LenswireShared.caGeneratedAtKey)
    let ready = fingerprint != nil && isReady()
    return [
      "status": ready ? "ready" : "not_generated",
      "fingerprint": fingerprint as Any,
      "generatedAt": ready ? Int(generatedAt) : NSNull(),
      "pemPath": ready ? LenswireShared.caPemURL.path : NSNull(),
    ]
  }

  /// Documents PEM for share / Save to Files.
  func exportPath() -> String? {
    guard isReady() else { return nil }
    let docs = LenswireShared.documentsCaPemURL
    if !FileManager.default.fileExists(atPath: docs.path) {
      if let pem = try? String(contentsOf: LenswireShared.caPemURL, encoding: .utf8) {
        try? pem.write(to: docs, atomically: true, encoding: .utf8)
      } else if let der = try? Data(contentsOf: LenswireShared.caCertURL) {
        let pem = X509.pemCertificate(der: der)
        try? pem.write(to: LenswireShared.caPemURL, atomically: true, encoding: .utf8)
        try? pem.write(to: docs, atomically: true, encoding: .utf8)
      }
    }
    guard FileManager.default.fileExists(atPath: docs.path) else { return nil }
    return docs.path
  }

  func mobileConfigInstallUrl() -> String? {
    guard isReady(), let der = try? Data(contentsOf: LenswireShared.caCertURL) else {
      return nil
    }

    let b64 = der.base64EncodedString(options: [.lineLength64Characters, .endLineWithLineFeed])
    let certUUID = UUID().uuidString
    let profileUUID = UUID().uuidString

    let profile = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>PayloadContent</key>
      <array>
        <dict>
          <key>PayloadCertificateFileName</key>
          <string>lenswire-ca.cer</string>
          <key>PayloadContent</key>
          <data>
    \(b64)
          </data>
          <key>PayloadDescription</key>
          <string>Lenswire HTTPS inspection CA</string>
          <key>PayloadDisplayName</key>
          <string>Lenswire CA</string>
          <key>PayloadIdentifier</key>
          <string>com.lenswire.ca</string>
          <key>PayloadType</key>
          <string>com.apple.security.root</string>
          <key>PayloadUUID</key>
          <string>\(certUUID)</string>
          <key>PayloadVersion</key>
          <integer>1</integer>
        </dict>
      </array>
      <key>PayloadDisplayName</key>
      <string>Lenswire CA</string>
      <key>PayloadIdentifier</key>
      <string>com.lenswire.profile</string>
      <key>PayloadRemovalDisallowed</key>
      <false/>
      <key>PayloadType</key>
      <string>Configuration</string>
      <key>PayloadUUID</key>
      <string>\(profileUUID)</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
    </plist>
    """

    let url = FileManager.default.temporaryDirectory.appendingPathComponent("lenswire-ca.mobileconfig")
    do {
      try profile.write(to: url, atomically: true, encoding: String.Encoding.utf8)
      return url.absoluteString
    } catch {
      return nil
    }
  }

  /// SecIdentity for MITM leaf cert for `host` (cached).
  func leafIdentity(for host: String) throws -> SecIdentity {
    lock.lock()
    defer { lock.unlock() }

    if let cached = leafCache[host], cached.expires > Date() {
      return cached.identity
    }

    let ca = try loadUnlocked()
    let pair = try X509.generateRSAKeyPair()
    let leafDER = try X509.createLeafCertificate(
      host: host,
      leafPublicKey: pair.publicKey,
      caPrivateKey: ca.privateKey,
      caCertificateDER: ca.certificateDER
    )
    let leafCert = try X509.secCertificate(der: leafDER)
    let identity = try Self.makeIdentity(
      certificate: leafCert,
      privateKey: pair.privateKey,
      label: "lenswire.leaf.\(host)"
    )
    leafCache[host] = (identity, Date().addingTimeInterval(60 * 60 * 12))
    return identity
  }

  private func loadUnlocked() throws -> Material {
    let certDER = try Data(contentsOf: LenswireShared.caCertURL)
    let keyData = try Self.loadCaKeyData()
    let privateKey = try X509.importPrivateKey(keyData)
    let fingerprint =
      LenswireShared.sharedDefaults.string(forKey: LenswireShared.caFingerprintKey)
      ?? X509.sha256Fingerprint(der: certDER)
    return Material(certificateDER: certDER, privateKey: privateKey, fingerprint: fingerprint)
  }

  private static let caKeychainService = "com.lenswire.ca.private-key"
  private static let caKeychainAccount = "lenswire-ca"

  private static func keychainQuery() -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: caKeychainService,
      kSecAttrAccount as String: caKeychainAccount,
    ]
    query[kSecAttrAccessGroup as String] = LenswireShared.appGroupId
    return query
  }

  private static func keychainHasCaKey() -> Bool {
    var query = keychainQuery()
    query[kSecReturnData as String] = false
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
  }

  private static func storeCaKeyInKeychain(_ data: Data) throws {
    var query = keychainQuery()
    SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = data
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(
        domain: "LenswireCA",
        code: Int(status),
        userInfo: [NSLocalizedDescriptionKey: "Failed to store CA key in Keychain (\(status))"]
      )
    }
  }

  private static func loadCaKeyData() throws -> Data {
    var query = keychainQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data {
      return data
    }

    // Migrate legacy plaintext key file into Keychain.
    let legacy = try Data(contentsOf: LenswireShared.caKeyURL)
    try storeCaKeyInKeychain(legacy)
    try? FileManager.default.removeItem(at: LenswireShared.caKeyURL)
    return legacy
  }

  private static func makeIdentity(
    certificate: SecCertificate,
    privateKey: SecKey,
    label: String
  ) throws -> SecIdentity {
    let tag = Data("\(label).\(UUID().uuidString)".utf8)
    let certData = SecCertificateCopyData(certificate) as Data
    var error: Unmanaged<CFError>?
    guard let keyData = SecKeyCopyExternalRepresentation(privateKey, &error) as Data? else {
      throw CAError.identityFailed(-1)
    }

    SecItemDelete([
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: label,
    ] as CFDictionary)
    SecItemDelete([
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag,
    ] as CFDictionary)

    let addCert: [String: Any] = [
      kSecClass as String: kSecClassCertificate,
      kSecValueData as String: certData,
      kSecAttrLabel as String: label,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let certStatus = SecItemAdd(addCert as CFDictionary, nil)
    guard certStatus == errSecSuccess || certStatus == errSecDuplicateItem else {
      throw CAError.identityFailed(certStatus)
    }

    let addKey: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecValueData as String: keyData,
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
      kSecAttrKeySizeInBits as String: 2048,
      kSecAttrLabel as String: label,
      kSecAttrApplicationTag as String: tag,
      kSecAttrIsPermanent as String: true,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let keyStatus = SecItemAdd(addKey as CFDictionary, nil)
    guard keyStatus == errSecSuccess || keyStatus == errSecDuplicateItem else {
      throw CAError.identityFailed(keyStatus)
    }

    #if os(macOS)
    var macIdentity: SecIdentity?
    let macStatus = SecIdentityCreateWithCertificate(nil, certificate, &macIdentity)
    if macStatus == errSecSuccess, let macIdentity {
      return macIdentity
    }
    #endif

    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecReturnRef as String: true,
      kSecMatchLimit as String: kSecMatchLimitAll,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let item else {
      throw CAError.identityFailed(status == errSecSuccess ? -2 : status)
    }

    let identities: [SecIdentity]
    if CFGetTypeID(item) == CFArrayGetTypeID() {
      identities = item as! [SecIdentity]
    } else if CFGetTypeID(item) == SecIdentityGetTypeID() {
      identities = [item as! SecIdentity]
    } else {
      throw CAError.identityFailed(-3)
    }

    for identity in identities {
      var candidate: SecCertificate?
      guard SecIdentityCopyCertificate(identity, &candidate) == errSecSuccess,
            let candidate else { continue }
      let candidateData = SecCertificateCopyData(candidate) as Data
      if candidateData == certData {
        return identity
      }
    }
    throw CAError.identityFailed(-4)
  }

  enum CAError: Swift.Error {
    case identityFailed(OSStatus)
  }
}
