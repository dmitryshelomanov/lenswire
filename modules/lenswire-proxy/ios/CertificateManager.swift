import Foundation
import Security

final class CertificateManager {
  static let shared = CertificateManager()

  /// Development CA embedded for Simulator trust via `simctl keychain add-root-cert`.
  /// Regenerated offline with openssl; keep in sync with `scripts/sim-trust-ca.sh` / `.lenswire/ca.pem`.
  private static let embeddedDevCaPem = """
  -----BEGIN CERTIFICATE-----
  MIIDVTCCAj2gAwIBAgIUMibGFbliLlhmTeQirY8DuakGnGIwDQYJKoZIhvcNAQEL
  BQAwOjEYMBYGA1UEAwwPTGVuc3dpcmUgRGV2IENBMREwDwYDVQQKDAhMZW5zd2ly
  ZTELMAkGA1UEBhMCVVMwHhcNMjYwNzI3MTMxODUwWhcNMzYwNzI0MTMxODUwWjA6
  MRgwFgYDVQQDDA9MZW5zd2lyZSBEZXYgQ0ExETAPBgNVBAoMCExlbnN3aXJlMQsw
  CQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMlrQjS7
  YnaYwX1Oa4VERtLRW7ZbXa9tktP4TNhMD86+PC8je9kOnIZqoOBEzU6jgQ+68hjU
  XzITRIOUmameWD+wRNS6wgkxz1f3PhcoiUmSDO6mCcKvFTIgR4yE237wdi6hjKWC
  ERzZlRdR8vdSqG/t4AHqGX985QNsEJdkxuQF4EJSkFkqg7d+xkSbXn/Vnrw3li+l
  suP8e2jetdWccORDx+RdWY7Bbx3ZBP3JC6scmFKA+L2tfH1BtBPiiwmhteciP6TV
  VZ/lTx8oQ9Bv9wCzHZ8KsSyfjSrIUo8/Kd6kpuF8f6tBPioE8DuhFpj5A5AfT9HE
  G6ByiJopqtmy/A0CAwEAAaNTMFEwHQYDVR0OBBYEFJJ85kbxzZGhunSjs6Sdx2D2
  Q6XdMB8GA1UdIwQYMBaAFJJ85kbxzZGhunSjs6Sdx2D2Q6XdMA8GA1UdEwEB/wQF
  MAMBAf8wDQYJKoZIhvcNAQELBQADggEBAIY04eokjXrBuKv2bgPpAwEj+HWr22n4
  hUpMh7bzcap00Zihj77Iu9D84OEzs0OQ0DC69nPSQmkdFZE5+ifi3d2u6nUY0mlN
  ZfglAKSG4Do880ThCPAlQyvdEML8QuuRvMWMHDBnhBe1nGgdTbn1CH1Z/7hI/zXT
  e2kn+UooexoSxeqO7SmGBH8o9uneS1PAEhObt2J9fBOJ7kElV0pTk/+YOzJS60Yc
  IPof15Vj/aY1ls52b4T06ZzJLMZav4YU35dYL9bqhZ1gGlsu+qORgPz9u0cA1Kg0
  iua+Qm3B0T9Q6FkBkmDhtdwoYWgNcj3UQZYmDnlEon1sSpOgrP2NHCw=
  -----END CERTIFICATE-----
  """

  private static let embeddedFingerprint =
    "B1:3E:75:29:97:D2:3A:8A:2E:59:49:07:CF:10:4C:F7:CC:3C:C6:C8:0E:D2:C5:29:53:FD:55:01:23:61:97:D5"

  func info() -> [String: Any] {
    let defaults = LenswireShared.sharedDefaults
    let fingerprint = defaults.string(forKey: LenswireShared.caFingerprintKey)
    let generatedAt = defaults.double(forKey: LenswireShared.caGeneratedAtKey)
    let ready = fingerprint != nil
    return [
      "status": ready ? "ready" : "not_generated",
      "fingerprint": fingerprint as Any,
      "generatedAt": ready ? Int(generatedAt) : NSNull(),
      "pemPath": ready ? LenswireShared.caPemURL.path : NSNull(),
    ]
  }

  func generate() throws -> [String: Any] {
    let tag = "com.lenswire.ca".data(using: .utf8)!
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: tag,
      ],
    ]

    var error: Unmanaged<CFError>?
    // Keep generating a device keypair for future on-device MITM; trust file is the embedded Dev CA.
    if SecKeyCreateRandomKey(attributes as CFDictionary, &error) == nil {
      // Key may already exist from a previous generate — continue with PEM export.
    }

    try Self.embeddedDevCaPem.write(to: LenswireShared.caPemURL, atomically: true, encoding: .utf8)

    let generatedAt = Date().timeIntervalSince1970 * 1000
    let defaults = LenswireShared.sharedDefaults
    defaults.set(Self.embeddedFingerprint, forKey: LenswireShared.caFingerprintKey)
    defaults.set(generatedAt, forKey: LenswireShared.caGeneratedAtKey)

    return info()
  }

  func pemPath() -> String? {
    let defaults = LenswireShared.sharedDefaults
    guard defaults.string(forKey: LenswireShared.caFingerprintKey) != nil else {
      return nil
    }
    let url = LenswireShared.caPemURL
    if !FileManager.default.fileExists(atPath: url.path) {
      try? Self.embeddedDevCaPem.write(to: url, atomically: true, encoding: .utf8)
    }
    return url.path
  }

  func mobileConfigInstallUrl() -> String? {
    guard LenswireShared.sharedDefaults.string(forKey: LenswireShared.caFingerprintKey) != nil else {
      return nil
    }

    let profile = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
    <key>PayloadContent</key><array><dict>
    <key>PayloadDisplayName</key><string>Lenswire CA</string>
    <key>PayloadIdentifier</key><string>com.lenswire.ca</string>
    <key>PayloadType</key><string>com.apple.security.root</string>
    <key>PayloadUUID</key><string>\(UUID().uuidString)</string>
    <key>PayloadVersion</key><integer>1</integer>
    </dict></array>
    <key>PayloadDisplayName</key><string>Lenswire CA</string>
    <key>PayloadIdentifier</key><string>com.lenswire.profile</string>
    <key>PayloadType</key><string>Configuration</string>
    <key>PayloadUUID</key><string>\(UUID().uuidString)</string>
    <key>PayloadVersion</key><integer>1</integer>
    </dict></plist>
    """

    let url = FileManager.default.temporaryDirectory.appendingPathComponent("lenswire-ca.mobileconfig")
    try? profile.write(to: url, atomically: true, encoding: .utf8)
    return url.absoluteString
  }
}
