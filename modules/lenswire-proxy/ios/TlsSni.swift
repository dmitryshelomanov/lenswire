import Foundation

enum TlsSni {
  struct ClientHelloMeta {
    let recordVersion: String?
    let clientVersion: String?
    let alpnProtocols: [String]
    let sniPresent: Bool
  }

  struct PeekResult {
    let bytes: Data
    let sniHostname: String?
    let meta: ClientHelloMeta?
  }

  static func peekClientHello(from data: Data) -> PeekResult {
    let sni = extractSniHostname(from: data)
    let meta = extractClientHelloMeta(from: data)
    return PeekResult(bytes: data, sniHostname: sni, meta: meta)
  }

  static func extractClientHelloMeta(from data: Data) -> ClientHelloMeta? {
    guard let parsed = parseClientHello(data) else { return nil }
    return ClientHelloMeta(
      recordVersion: parsed.recordVersion,
      clientVersion: parsed.clientVersion,
      alpnProtocols: parsed.alpnProtocols,
      sniPresent: parsed.sniHostname != nil
    )
  }

  static func extractSniHostname(from data: Data) -> String? {
    parseClientHello(data)?.sniHostname
  }

  static func isIpLiteral(_ host: String) -> Bool {
    let value = host.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "[", with: "")
      .replacingOccurrences(of: "]", with: "")
    if value.isEmpty { return false }
    if value.contains(":") {
      return value.allSatisfy { ch in
        ch == ":" || ("0"..."9").contains(String(ch)) || ("a"..."f").contains(String(ch).lowercased())
      }
    }
    let parts = value.split(separator: ".")
    if parts.count != 4 { return false }
    return parts.allSatisfy { part in
      guard let n = Int(part), (0...255).contains(n) else { return false }
      return String(n) == String(part)
    }
  }

  private struct ParsedClientHello {
    let sniHostname: String?
    let clientVersion: String?
    let alpnProtocols: [String]
    let recordVersion: String?
  }

  private static func parseClientHello(_ data: Data) -> ParsedClientHello? {
    guard data.count >= 9 else { return nil }
    let bytes = [UInt8](data)
    let recordVersion = tlsVersionName(major: Int(bytes[1]), minor: Int(bytes[2]))

    var offset = 0
    var handshake = Data()
    while offset + 5 <= bytes.count {
      let contentType = Int(bytes[offset])
      let length = (Int(bytes[offset + 3]) << 8) | Int(bytes[offset + 4])
      offset += 5
      guard contentType == 0x16 else { return nil }
      let available = min(length, bytes.count - offset)
      guard available > 0 else { break }
      handshake.append(contentsOf: bytes[offset..<(offset + available)])
      offset += available
      if available < length { break }
      if hasCompleteHandshakeMessage(handshake) { break }
    }

    let hs = [UInt8](handshake)
    guard hs.count >= 4 else { return nil }
    guard hs[0] == 0x01 else { return nil } // ClientHello
    let msgLen = (Int(hs[1]) << 16) | (Int(hs[2]) << 8) | Int(hs[3])
    guard hs.count >= 4 + msgLen else { return nil }

    var idx = 4
    guard idx + 34 <= hs.count else { return nil }
    let clientVersion = tlsVersionName(major: Int(hs[idx]), minor: Int(hs[idx + 1]))
    idx += 34

    guard idx + 1 <= hs.count else { return nil }
    let sessionIdLen = Int(hs[idx]); idx += 1
    guard idx + sessionIdLen <= hs.count else { return nil }
    idx += sessionIdLen

    guard idx + 2 <= hs.count else { return nil }
    let cipherLen = (Int(hs[idx]) << 8) | Int(hs[idx + 1]); idx += 2
    guard idx + cipherLen <= hs.count else { return nil }
    idx += cipherLen

    guard idx + 1 <= hs.count else { return nil }
    let compLen = Int(hs[idx]); idx += 1
    guard idx + compLen <= hs.count else { return nil }
    idx += compLen

    guard idx + 2 <= hs.count else { return nil }
    let extLen = (Int(hs[idx]) << 8) | Int(hs[idx + 1]); idx += 2
    guard idx + extLen <= hs.count else { return nil }
    let extEnd = idx + extLen

    var sniHostname: String?
    var alpnProtocols: [String] = []

    while idx + 4 <= extEnd {
      let extType = (Int(hs[idx]) << 8) | Int(hs[idx + 1]); idx += 2
      let extSize = (Int(hs[idx]) << 8) | Int(hs[idx + 1]); idx += 2
      guard idx + extSize <= extEnd else { return nil }
      if extType == 0x0000 {
        sniHostname = parseServerNameExtension(hs, start: idx, length: extSize)
      } else if extType == 0x0010 {
        alpnProtocols = parseAlpnExtension(hs, start: idx, length: extSize)
      }
      idx += extSize
    }

    return ParsedClientHello(
      sniHostname: sniHostname,
      clientVersion: clientVersion,
      alpnProtocols: alpnProtocols,
      recordVersion: recordVersion
    )
  }

  private static func parseServerNameExtension(_ bytes: [UInt8], start: Int, length: Int) -> String? {
    var idx = start
    let end = start + length
    guard idx + 2 <= end else { return nil }
    let listLen = (Int(bytes[idx]) << 8) | Int(bytes[idx + 1]); idx += 2
    let listEnd = min(end, idx + listLen)
    while idx + 3 <= listEnd {
      let nameType = Int(bytes[idx]); idx += 1
      let nameLen = (Int(bytes[idx]) << 8) | Int(bytes[idx + 1]); idx += 2
      guard idx + nameLen <= listEnd else { return nil }
      if nameType == 0x00 {
        let hostBytes = bytes[idx..<(idx + nameLen)]
        let host = String(decoding: hostBytes, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "."))
        if host.isEmpty { return nil }
        return host
      }
      idx += nameLen
    }
    return nil
  }

  private static func parseAlpnExtension(_ bytes: [UInt8], start: Int, length: Int) -> [String] {
    var idx = start
    let end = start + length
    guard idx + 2 <= end else { return [] }
    let listLen = (Int(bytes[idx]) << 8) | Int(bytes[idx + 1]); idx += 2
    let listEnd = min(end, idx + listLen)
    var protocols: [String] = []
    while idx < listEnd {
      guard idx + 1 <= listEnd else { break }
      let pLen = Int(bytes[idx]); idx += 1
      guard pLen > 0, idx + pLen <= listEnd else { break }
      let protoBytes = bytes[idx..<(idx + pLen)]
      let proto = String(decoding: protoBytes, as: UTF8.self)
      if !proto.isEmpty { protocols.append(proto) }
      idx += pLen
    }
    return protocols
  }

  private static func hasCompleteHandshakeMessage(_ data: Data) -> Bool {
    let bytes = [UInt8](data)
    guard bytes.count >= 4 else { return false }
    let msgLen = (Int(bytes[1]) << 16) | (Int(bytes[2]) << 8) | Int(bytes[3])
    return bytes.count >= 4 + msgLen
  }

  private static func tlsVersionName(major: Int, minor: Int) -> String {
    switch minor {
    case 0: return "SSL 3.0"
    case 1: return "TLS 1.0"
    case 2: return "TLS 1.1"
    case 3: return "TLS 1.2"
    case 4: return "TLS 1.3"
    default: return "TLS \(major).\(minor)"
    }
  }
}
