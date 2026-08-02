import Foundation
import Security
import CryptoKit

enum X509 {
  enum Error: Swift.Error {
    case keyGenerationFailed
    case publicKeyExportFailed
    case privateKeyExportFailed
    case signatureFailed
    case invalidKeyData
    case certificateCreateFailed
  }

  // MARK: - DER primitives

  static func derLength(_ length: Int) -> Data {
    if length < 0x80 {
      return Data([UInt8(length)])
    }
    var value = length
    var bytes: [UInt8] = []
    while value > 0 {
      bytes.insert(UInt8(value & 0xff), at: 0)
      value >>= 8
    }
    return Data([UInt8(0x80 | bytes.count)] + bytes)
  }

  static func derTLV(_ tag: UInt8, _ content: Data) -> Data {
    var out = Data([tag])
    out.append(derLength(content.count))
    out.append(content)
    return out
  }

  static func derSequence(_ content: Data) -> Data { derTLV(0x30, content) }
  static func derSet(_ content: Data) -> Data { derTLV(0x31, content) }
  static func derInteger(_ content: Data) -> Data {
    var bytes = content
    if bytes.isEmpty { bytes = Data([0]) }
    if let first = bytes.first, first & 0x80 != 0 {
      bytes.insert(0x00, at: 0)
    }
    return derTLV(0x02, bytes)
  }

  static func derInteger(_ value: Int) -> Data {
    var v = value
    var bytes: [UInt8] = []
    repeat {
      bytes.insert(UInt8(v & 0xff), at: 0)
      v >>= 8
    } while v > 0
    return derInteger(Data(bytes))
  }

  static func derOID(_ oid: [UInt8]) -> Data { derTLV(0x06, Data(oid)) }
  static func derNull() -> Data { Data([0x05, 0x00]) }
  static func derBitString(_ content: Data, unusedBits: UInt8 = 0) -> Data {
    derTLV(0x03, Data([unusedBits]) + content)
  }

  static func derOctetString(_ content: Data) -> Data { derTLV(0x04, content) }
  static func derUTF8String(_ string: String) -> Data {
    derTLV(0x0c, Data(string.utf8))
  }

  static func derPrintableString(_ string: String) -> Data {
    derTLV(0x13, Data(string.utf8))
  }

  static func derUTCTime(_ date: Date) -> Data {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyMMddHHmmss'Z'"
    return derTLV(0x17, Data(formatter.string(from: date).utf8))
  }

  static func derBool(_ value: Bool) -> Data {
    derTLV(0x01, Data([value ? 0xff : 0x00]))
  }

  static func derContext(_ tag: UInt8, constructed: Bool, _ content: Data) -> Data {
    let t = (constructed ? 0xa0 : 0x80) | tag
    return derTLV(t, content)
  }

  // MARK: - OIDs

  static let oidRSAEncryption: [UInt8] = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]
  static let oidSha256WithRSA: [UInt8] = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]
  static let oidCommonName: [UInt8] = [0x55, 0x04, 0x03]
  static let oidOrganization: [UInt8] = [0x55, 0x04, 0x0a]
  static let oidCountry: [UInt8] = [0x55, 0x04, 0x06]
  static let oidBasicConstraints: [UInt8] = [0x55, 0x1d, 0x13]
  static let oidKeyUsage: [UInt8] = [0x55, 0x1d, 0x0f]
  static let oidExtKeyUsage: [UInt8] = [0x55, 0x1d, 0x25]
  static let oidSubjectAltName: [UInt8] = [0x55, 0x1d, 0x11]
  static let oidServerAuth: [UInt8] = [0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01]

  // MARK: - Keys

  static func generateRSAKeyPair() throws -> (privateKey: SecKey, publicKey: SecKey) {
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecAttrIsPermanent as String: false,
    ]
    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error),
          let publicKey = SecKeyCopyPublicKey(privateKey)
    else {
      throw Error.keyGenerationFailed
    }
    return (privateKey, publicKey)
  }

  static func exportPrivateKey(_ key: SecKey) throws -> Data {
    var error: Unmanaged<CFError>?
    guard let data = SecKeyCopyExternalRepresentation(key, &error) as Data? else {
      throw Error.privateKeyExportFailed
    }
    return data
  }

  static func importPrivateKey(_ data: Data) throws -> SecKey {
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
      kSecAttrKeySizeInBits as String: 2048,
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateWithData(data as CFData, attributes as CFDictionary, &error) else {
      throw Error.invalidKeyData
    }
    return key
  }

  static func subjectPublicKeyInfo(for publicKey: SecKey) throws -> Data {
    var error: Unmanaged<CFError>?
    guard let pkcs1 = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
      throw Error.publicKeyExportFailed
    }
    let algorithm = derSequence(derOID(oidRSAEncryption) + derNull())
    return derSequence(algorithm + derBitString(pkcs1))
  }

  static func nameDER(commonName: String, organization: String?, country: String?) -> Data {
    var rdns = Data()
    if let country, !country.isEmpty {
      let attr = derSequence(derOID(oidCountry) + derPrintableString(country))
      rdns.append(derSet(attr))
    }
    if let organization, !organization.isEmpty {
      let attr = derSequence(derOID(oidOrganization) + derUTF8String(organization))
      rdns.append(derSet(attr))
    }
    let cn = derSequence(derOID(oidCommonName) + derUTF8String(commonName))
    rdns.append(derSet(cn))
    return derSequence(rdns)
  }

  static func extensionDER(oid: [UInt8], critical: Bool, value: Data) -> Data {
    var content = derOID(oid)
    if critical {
      content.append(derBool(true))
    }
    content.append(derOctetString(value))
    return derSequence(content)
  }

  static func basicConstraintsExtension(isCA: Bool) -> Data {
    let inner = derSequence(derBool(isCA))
    return extensionDER(oid: oidBasicConstraints, critical: true, value: inner)
  }

  static func keyUsageExtension(isCA: Bool) -> Data {
    // KeyUsage bits are numbered from 0 as the high bit of the first content byte.
    // CA: keyCertSign(5) | cRLSign(6) => 0x06, unusedBits=1
    // Leaf: digitalSignature(0) | keyEncipherment(2) => 0xA0, unusedBits=5
    let usageBits: UInt8 = isCA ? 0x06 : 0xa0
    let unused: UInt8 = isCA ? 1 : 5
    let bitString = derBitString(Data([usageBits]), unusedBits: unused)
    return extensionDER(oid: oidKeyUsage, critical: true, value: bitString)
  }

  static func extKeyUsageServerAuth() -> Data {
    let eku = derSequence(derOID(oidServerAuth))
    return extensionDER(oid: oidExtKeyUsage, critical: false, value: eku)
  }

  static func subjectAltNameExtension(dnsNames: [String], ipAddresses: [Data] = []) -> Data {
    var generalNames = Data()
    for dns in dnsNames {
      // dNSName [2] IA5String
      generalNames.append(derTLV(0x82, Data(dns.utf8)))
    }
    for ip in ipAddresses {
      generalNames.append(derTLV(0x87, ip))
    }
    return extensionDER(oid: oidSubjectAltName, critical: false, value: derSequence(generalNames))
  }

  static func randomSerial() -> Data {
    var bytes = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    bytes[0] &= 0x7f // positive INTEGER
    if bytes[0] == 0 { bytes[0] = 1 }
    return Data(bytes)
  }

  static func signSHA256RSA(tbs: Data, privateKey: SecKey) throws -> Data {
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      privateKey,
      .rsaSignatureMessagePKCS1v15SHA256,
      tbs as CFData,
      &error
    ) as Data? else {
      throw Error.signatureFailed
    }
    return signature
  }

  static func buildCertificate(
    subject: Data,
    issuer: Data,
    publicKey: SecKey,
    signingKey: SecKey,
    notBefore: Date,
    notAfter: Date,
    extensions: Data,
    isSelfSigned: Bool
  ) throws -> Data {
    let serial = derInteger(randomSerial())
    let signatureAlgorithm = derSequence(derOID(oidSha256WithRSA) + derNull())
    let validity = derSequence(derUTCTime(notBefore) + derUTCTime(notAfter))
    let spki = try subjectPublicKeyInfo(for: publicKey)
    let extensionsTLV = derContext(3, constructed: true, derSequence(extensions))

    let version = derContext(0, constructed: true, derInteger(2)) // v3
    var tbsContent = Data()
    tbsContent.append(version)
    tbsContent.append(serial)
    tbsContent.append(signatureAlgorithm)
    tbsContent.append(issuer)
    tbsContent.append(validity)
    tbsContent.append(subject)
    tbsContent.append(spki)
    tbsContent.append(extensionsTLV)
    let tbs = derSequence(tbsContent)

    let signature = try signSHA256RSA(tbs: tbs, privateKey: signingKey)
    let cert = derSequence(tbs + signatureAlgorithm + derBitString(signature))
    _ = isSelfSigned
    return cert
  }

  static func createCACertificate(privateKey: SecKey, publicKey: SecKey) throws -> Data {
    let subject = nameDER(commonName: "Lenswire CA", organization: "Lenswire", country: "US")
    let notBefore = Date().addingTimeInterval(-60 * 60)
    let notAfter = Date().addingTimeInterval(60 * 60 * 24 * 365 * 10)
    var extensions = Data()
    extensions.append(basicConstraintsExtension(isCA: true))
    extensions.append(keyUsageExtension(isCA: true))
    return try buildCertificate(
      subject: subject,
      issuer: subject,
      publicKey: publicKey,
      signingKey: privateKey,
      notBefore: notBefore,
      notAfter: notAfter,
      extensions: extensions,
      isSelfSigned: true
    )
  }

  static func createLeafCertificate(
    host: String,
    leafPublicKey: SecKey,
    caPrivateKey: SecKey,
    caCertificateDER: Data
  ) throws -> Data {
    let subject = nameDER(commonName: host, organization: "Lenswire MITM", country: "US")
    let issuer = issuerName(fromCertificateDER: caCertificateDER) ?? subject
    let notBefore = Date().addingTimeInterval(-60 * 60)
    let notAfter = Date().addingTimeInterval(60 * 60 * 24 * 365)
    var extensions = Data()
    extensions.append(basicConstraintsExtension(isCA: false))
    extensions.append(keyUsageExtension(isCA: false))
    extensions.append(extKeyUsageServerAuth())
    extensions.append(subjectAltNameExtension(dnsNames: [host]))
    return try buildCertificate(
      subject: subject,
      issuer: issuer,
      publicKey: leafPublicKey,
      signingKey: caPrivateKey,
      notBefore: notBefore,
      notAfter: notAfter,
      extensions: extensions,
      isSelfSigned: false
    )
  }

  /// Extract Subject SEQUENCE TLV from a certificate DER (used as Issuer for leaves).
  static func issuerName(fromCertificateDER der: Data) -> Data? {
    let bytes = [UInt8](der)
    var offset = 0
    guard offset < bytes.count, bytes[offset] == 0x30 else { return nil }
    offset += 1
    guard let certContent = readLengthContent(bytes, offset: &offset) else { return nil }

    let certBytes = Array(certContent)
    var idx = 0
    guard idx < certBytes.count, certBytes[idx] == 0x30 else { return nil }
    idx += 1
    guard let tbsContent = readLengthContent(certBytes, offset: &idx) else { return nil }

    let tbs = Array(tbsContent)
    var t = 0
    if t < tbs.count, tbs[t] == 0xa0 {
      guard skipTLV(tbs, offset: &t) != nil else { return nil }
    }
    guard skipTLV(tbs, offset: &t) != nil else { return nil } // serial
    guard skipTLV(tbs, offset: &t) != nil else { return nil } // signature alg
    let issuerStart = t
    guard skipTLV(tbs, offset: &t) != nil else { return nil }
    return Data(tbs[issuerStart..<t])
  }

  private static func readLengthContent(_ bytes: [UInt8], offset: inout Int) -> ArraySlice<UInt8>? {
    guard offset < bytes.count else { return nil }
    let first = bytes[offset]
    offset += 1
    let length: Int
    if first & 0x80 == 0 {
      length = Int(first)
    } else {
      let count = Int(first & 0x7f)
      guard count > 0, offset + count <= bytes.count else { return nil }
      var value = 0
      for _ in 0..<count {
        value = (value << 8) | Int(bytes[offset])
        offset += 1
      }
      length = value
    }
    guard offset + length <= bytes.count else { return nil }
    let content = bytes[offset..<(offset + length)]
    offset += length
    return content
  }

  @discardableResult
  private static func skipTLV(_ bytes: [UInt8], offset: inout Int) -> Int? {
    guard offset < bytes.count else { return nil }
    offset += 1 // tag
    guard let content = readLengthContent(bytes, offset: &offset) else { return nil }
    return content.count
  }

  static func sha256Fingerprint(der: Data) -> String {
    let digest = SHA256.hash(data: der)
    return digest.map { String(format: "%02X", $0) }.joined(separator: ":")
  }

  static func pemCertificate(der: Data) -> String {
    let b64 = der.base64EncodedString(options: [.lineLength64Characters, .endLineWithLineFeed])
    return "-----BEGIN CERTIFICATE-----\n\(b64)\n-----END CERTIFICATE-----\n"
  }

  static func secCertificate(der: Data) throws -> SecCertificate {
    guard let cert = SecCertificateCreateWithData(nil, der as CFData) else {
      throw Error.certificateCreateFailed
    }
    return cert
  }
}
