#!/usr/bin/env bash
# Compiles X509 + CertificateAuthority against a stub LenswireShared and generates a CA+leaf.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
IOS="$ROOT/modules/lenswire-proxy/ios"

cat > "$TMP/LenswireShared.swift" <<EOF
import Foundation

enum LenswireShared {
  static let appGroupId = "group.com.lenswire.app"
  static let capturesKey = "lenswire.captures"
  static let proxyPort: UInt16 = 9090
  static let providerBundleSuffix = "network-packet-tunnel"
  static let caGeneratedAtKey = "lenswire.ca.generatedAt"
  static let caFingerprintKey = "lenswire.ca.fingerprint"
  static let httpsDecryptKey = "lenswire.settings.httpsDecrypt"
  static let caPemFileName = "lenswire-ca.pem"
  static let caCertFileName = "lenswire-ca.cer"
  static let caKeyFileName = "lenswire-ca.key"
  static let maxBodyBytes = 256 * 1024

  static var sharedDefaults: UserDefaults { .standard }

  static var sharedContainerURL: URL {
    URL(fileURLWithPath: "$TMP/container")
  }

  static var caPemURL: URL { sharedContainerURL.appendingPathComponent(caPemFileName) }
  static var caCertURL: URL { sharedContainerURL.appendingPathComponent(caCertFileName) }
  static var caKeyURL: URL { sharedContainerURL.appendingPathComponent(caKeyFileName) }
  static var documentsCaPemURL: URL { sharedContainerURL.appendingPathComponent("docs-" + caPemFileName) }

  static var httpsDecryptEnabled: Bool {
    get { true }
    set { _ = newValue }
  }

  static func appendCapture(_ entry: [String: Any]) {}
  static func readCaptures() -> [[String: Any]] { [] }
  static func clearCaptures() {}
  static func classifyBody(_ data: Data, contentType: String?) -> [String: Any] {
    ["kind": "empty", "size": data.count]
  }
}
EOF

mkdir -p "$TMP/container"

cat > "$TMP/main.swift" <<'EOF'
import Foundation
import Security

do {
  let material = try CertificateAuthority.shared.generate()
  print("CA fingerprint: \(material.fingerprint)")
  print("CA der bytes: \(material.certificateDER.count)")
  guard CertificateAuthority.shared.isReady() else {
    fputs("CA not ready after generate\n", stderr)
    exit(1)
  }

  let pair = try X509.generateRSAKeyPair()
  let leafDER = try X509.createLeafCertificate(
    host: "example.com",
    leafPublicKey: pair.publicKey,
    caPrivateKey: material.privateKey,
    caCertificateDER: material.certificateDER
  )
  let leafURL = LenswireShared.sharedContainerURL.appendingPathComponent("leaf.cer")
  try leafDER.write(to: leafURL)
  print("Leaf der bytes: \(leafDER.count) path=\(leafURL.path)")

  // Identity creation needs the app keychain entitlements; soft-check on CLI.
  do {
    let identity = try CertificateAuthority.shared.leafIdentity(for: "example.com")
    var cert: SecCertificate?
    let status = SecIdentityCopyCertificate(identity, &cert)
    if status == errSecSuccess, cert != nil {
      print("Identity leaf ok")
    } else {
      print("Identity soft-fail status=\(status) (expected on unsigned macOS CLI)")
    }
  } catch {
    print("Identity soft-fail: \(error) (expected on unsigned macOS CLI; iOS app keychain is entitled)")
  }

  let pem = try String(contentsOf: LenswireShared.caPemURL, encoding: .utf8)
  guard pem.contains("BEGIN CERTIFICATE") else {
    fputs("PEM missing\n", stderr)
    exit(1)
  }

  let url = CertificateAuthority.shared.mobileConfigInstallUrl()
  guard let url, url.contains("mobileconfig") else {
    fputs("mobileconfig missing\n", stderr)
    exit(1)
  }
  let profile = try String(contentsOf: URL(string: url)!, encoding: .utf8)
  guard profile.contains("com.apple.security.root"), profile.contains("<data>") else {
    fputs("mobileconfig incomplete\n", stderr)
    exit(1)
  }
  print("mobileconfig ok")
  print("lenswire-ca-smoke: ok")
} catch {
  fputs("smoke failed: \(error)\n", stderr)
  exit(1)
}
EOF

swiftc -O \
  -framework Security \
  -framework CryptoKit \
  "$TMP/LenswireShared.swift" \
  "$IOS/X509.swift" \
  "$IOS/CertificateAuthority.swift" \
  "$TMP/main.swift" \
  -o "$TMP/ca-smoke"

"$TMP/ca-smoke"

openssl x509 -in "$TMP/container/lenswire-ca.pem" -noout -subject -issuer
openssl x509 -in "$TMP/container/lenswire-ca.pem" -noout -text | grep -E "CA:TRUE|CA:TRUE" | head -n 3
openssl x509 -inform der -in "$TMP/container/leaf.cer" -noout -subject
openssl verify -CAfile "$TMP/container/lenswire-ca.pem" -show_chain \
  <(openssl x509 -inform der -in "$TMP/container/leaf.cer") || {
  # fallback without process substitution issues
  openssl x509 -inform der -in "$TMP/container/leaf.cer" -out "$TMP/container/leaf.pem"
  openssl verify -CAfile "$TMP/container/lenswire-ca.pem" "$TMP/container/leaf.pem"
}

echo "lenswire-ca-smoke: openssl parse+verify ok"


