import Foundation
import zlib

enum LenswireShared {
  static let appGroupId = "group.com.lenswire.app"
  static let capturesKey = "lenswire.captures"
  static let proxyPort: UInt16 = 9090
  static let providerBundleSuffix = "network-packet-tunnel"
  static let caGeneratedAtKey = "lenswire.ca.generatedAt"
  static let caFingerprintKey = "lenswire.ca.fingerprint"
  static let httpsDecryptKey = "lenswire.settings.httpsDecrypt"
  static let overridesKey = "lenswire.settings.overrides"
  static let caPemFileName = "lenswire-ca.pem"
  static let caCertFileName = "lenswire-ca.cer"
  static let caKeyFileName = "lenswire-ca.key"
  static let maxBodyBytes = 256 * 1024
  static let maxImagePreviewBytes = 512 * 1024
  static let maxBinaryPreviewBytes = 16 * 1024

  static var sharedDefaults: UserDefaults {
    UserDefaults(suiteName: appGroupId) ?? .standard
  }

  static var sharedContainerURL: URL {
    if let url = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupId
    ) {
      return url
    }
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }

  static var caPemURL: URL {
    sharedContainerURL.appendingPathComponent(caPemFileName)
  }

  static var caCertURL: URL {
    sharedContainerURL.appendingPathComponent(caCertFileName)
  }

  static var caKeyURL: URL {
    sharedContainerURL.appendingPathComponent(caKeyFileName)
  }

  /// Documents copy so Simulator `simctl` scripts / UI can find a PEM path.
  static var documentsCaPemURL: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(caPemFileName)
  }

  static var httpsDecryptEnabled: Bool {
    get {
      if sharedDefaults.object(forKey: httpsDecryptKey) == nil { return true }
      return sharedDefaults.bool(forKey: httpsDecryptKey)
    }
    set {
      sharedDefaults.set(newValue, forKey: httpsDecryptKey)
    }
  }

  static var overridesJson: String {
    get {
      sharedDefaults.string(forKey: overridesKey) ?? "[]"
    }
    set {
      sharedDefaults.set(newValue.isEmpty ? "[]" : newValue, forKey: overridesKey)
    }
  }

  struct OverrideRule {
    let id: String
    let enabled: Bool
    let kind: String
    let method: String
    let scheme: String
    let host: String
    let path: String
    let query: String
    let status: Int
    let contentType: String
    let headers: [String: String]
    let bodyText: String
    let createdAt: Int

    var bodyData: Data {
      Data(bodyText.utf8)
    }

    var responseHeaders: [String: String] {
      var headers: [String: String] = [:]
      if !contentType.isEmpty {
        headers["Content-Type"] = contentType
      }
      mergeHeaders(&headers, overrides: self.headers)
      // Writers always set Content-Length / Connection; drop hop-by-hop from the rule.
      removeHeaderIgnoreCase(&headers, name: "content-length")
      removeHeaderIgnoreCase(&headers, name: "transfer-encoding")
      return headers
    }
  }

  static func loadOverrideRules() -> [OverrideRule] {
    guard let data = overridesJson.data(using: .utf8),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return arr.compactMap { obj in
      OverrideRule(
        id: String(describing: obj["id"] ?? ""),
        enabled: (obj["enabled"] as? Bool) ?? true,
        kind: String(describing: obj["kind"] ?? ""),
        method: String(describing: obj["method"] ?? "GET").uppercased(),
        scheme: String(describing: obj["scheme"] ?? "https").lowercased(),
        host: String(describing: obj["host"] ?? ""),
        path: {
          let raw = String(describing: obj["path"] ?? "/")
          return raw.isEmpty ? "/" : raw
        }(),
        query: String(describing: obj["query"] ?? ""),
        status: (obj["status"] as? Int) ?? Int("\(obj["status"] ?? 200)") ?? 200,
        contentType: String(describing: obj["contentType"] ?? ""),
        headers: parseOverrideHeaders(obj["headers"]),
        bodyText: String(describing: obj["bodyText"] ?? ""),
        createdAt: (obj["createdAt"] as? Int) ?? Int("\(obj["createdAt"] ?? 0)") ?? 0
      )
    }
  }

  static func parseOverrideHeaders(_ value: Any?) -> [String: String] {
    guard let dict = value as? [String: Any] else { return [:] }
    var out: [String: String] = [:]
    for (key, raw) in dict {
      let name = key.trimmingCharacters(in: .whitespacesAndNewlines)
      if name.isEmpty { continue }
      if let string = raw as? String {
        out[name] = string
      } else {
        out[name] = String(describing: raw)
      }
    }
    return out
  }

  /// Merge/set: non-blank value replaces (case-insensitive name); blank value removes.
  static func mergeHeaders(_ target: inout [String: String], overrides: [String: String]) {
    for (name, value) in overrides {
      let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmedName.isEmpty { continue }
      removeHeaderIgnoreCase(&target, name: trimmedName)
      if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        target[trimmedName] = value
      }
    }
  }

  static func removeHeaderIgnoreCase(_ target: inout [String: String], name: String) {
    let keys = target.keys.filter { $0.caseInsensitiveCompare(name) == .orderedSame }
    for key in keys {
      target.removeValue(forKey: key)
    }
  }

  static func findOverride(
    kind: String,
    method: String,
    scheme: String,
    host: String,
    path: String,
    query: String
  ) -> OverrideRule? {
    let normalizedPath = path.isEmpty ? "/" : path
    return loadOverrideRules().first { rule in
      rule.enabled
        && rule.kind == kind
        && rule.method.caseInsensitiveCompare(method) == .orderedSame
        && rule.scheme.caseInsensitiveCompare(scheme) == .orderedSame
        && rule.host.caseInsensitiveCompare(host) == .orderedSame
        && rule.path == normalizedPath
        && rule.query == query
    }
  }

  static func rewriteRequest(
    headers: [String: String],
    rule: OverrideRule
  ) -> (headers: [String: String], body: Data) {
    var next: [String: String] = [:]
    for (key, value) in headers {
      let lower = key.lowercased()
      if lower == "content-length" || lower == "transfer-encoding" || lower == "content-type" {
        continue
      }
      next[key] = value
    }
    if !rule.contentType.isEmpty {
      next["Content-Type"] = rule.contentType
    }
    let body = rule.bodyData
    next["Content-Length"] = String(body.count)
    mergeHeaders(&next, overrides: rule.headers)
    removeHeaderIgnoreCase(&next, name: "transfer-encoding")
    removeHeaderIgnoreCase(&next, name: "content-length")
    next["Content-Length"] = String(body.count)
    return (next, body)
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

  static func classifyBody(
    _ data: Data,
    contentType: String?,
    contentEncoding: String? = nil
  ) -> [String: Any] {
    if data.isEmpty {
      return ["kind": "empty", "size": 0]
    }

    let decoded = maybeDecodeEncoding(data, contentEncoding: contentEncoding)
    let payload = decoded.data
    let encodingDecoded = decoded.decoded
    let size = payload.count
    let type = (contentType ?? "").lowercased()

    if type.hasPrefix("image/") {
      return binaryBodyResult(
        kind: "image",
        payload: payload,
        size: size,
        encodingDecoded: encodingDecoded,
        maxPreview: maxImagePreviewBytes
      )
    }

    let isTextual =
      type.contains("json")
      || type.contains("text/")
      || type.contains("xml")
      || type.contains("x-www-form-urlencoded")
      || type.contains("javascript")

    guard isTextual, let text = String(data: payload, encoding: .utf8) else {
      return binaryBodyResult(
        kind: "binary",
        payload: payload,
        size: size,
        encodingDecoded: encodingDecoded,
        maxPreview: maxBinaryPreviewBytes
      )
    }

    let kind: String
    if type.contains("json") || text.first == "{" || text.first == "[" {
      kind = "json"
    } else {
      kind = "text"
    }
    return textBodyResult(kind: kind, text: text, size: size, encodingDecoded: encodingDecoded)
  }

  private static func textBodyResult(
    kind: String,
    text: String,
    size: Int,
    encodingDecoded: Bool
  ) -> [String: Any] {
    let truncated = text.count > maxBodyBytes
    let clipped: String
    if truncated {
      let end = text.index(text.startIndex, offsetBy: maxBodyBytes, limitedBy: text.endIndex) ?? text.endIndex
      clipped = String(text[..<end]) + "\n\n...truncated..."
    } else {
      clipped = text
    }
    var out: [String: Any] = [
      "kind": kind,
      "text": clipped,
      "size": size,
      "truncated": truncated,
    ]
    if encodingDecoded { out["encodingDecoded"] = true }
    return out
  }

  private static func binaryBodyResult(
    kind: String,
    payload: Data,
    size: Int,
    encodingDecoded: Bool,
    maxPreview: Int
  ) -> [String: Any] {
    let truncated = payload.count > maxPreview
    let preview = truncated ? payload.prefix(maxPreview) : payload
    var out: [String: Any] = [
      "kind": kind,
      "size": size,
      "truncated": truncated,
      "previewBase64": preview.base64EncodedString(),
    ]
    if encodingDecoded { out["encodingDecoded"] = true }
    return out
  }

  private struct DecodedBody {
    let data: Data
    let decoded: Bool
  }

  private static func maybeDecodeEncoding(_ data: Data, contentEncoding: String?) -> DecodedBody {
    let enc = (contentEncoding ?? "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    if enc.isEmpty || enc == "identity" {
      if isGzip(data), let gunzipped = gunzip(data) {
        return DecodedBody(data: gunzipped, decoded: true)
      }
      return DecodedBody(data: data, decoded: false)
    }
    if enc.contains("gzip") || isGzip(data) {
      if let gunzipped = gunzip(data) {
        return DecodedBody(data: gunzipped, decoded: true)
      }
      return DecodedBody(data: data, decoded: false)
    }
    if enc.contains("deflate") {
      if let inflated = inflate(data) {
        return DecodedBody(data: inflated, decoded: true)
      }
      return DecodedBody(data: data, decoded: false)
    }
    return DecodedBody(data: data, decoded: false)
  }

  private static func isGzip(_ data: Data) -> Bool {
    guard data.count >= 2 else { return false }
    return data[data.startIndex] == 0x1f && data[data.index(after: data.startIndex)] == 0x8b
  }

  private static func gunzip(_ data: Data) -> Data? {
    inflateZlib(data, windowBits: 15 + 32)
  }

  private static func inflate(_ data: Data) -> Data? {
    inflateZlib(data, windowBits: 15) ?? inflateZlib(data, windowBits: -15)
  }

  private static func inflateZlib(_ data: Data, windowBits: Int32) -> Data? {
    guard !data.isEmpty else { return nil }
    return data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Data? in
      guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return nil }
      var stream = z_stream()
      stream.next_in = UnsafeMutablePointer(mutating: base)
      stream.avail_in = uInt(data.count)
      guard inflateInit2_(&stream, windowBits, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else {
        return nil
      }
      defer { inflateEnd(&stream) }
      let chunk = 64 * 1024
      var out = Data()
      var buffer = [UInt8](repeating: 0, count: chunk)
      var status: Int32 = Z_OK
      while status == Z_OK {
        let written: Int = buffer.withUnsafeMutableBufferPointer { buf in
          stream.next_out = buf.baseAddress
          stream.avail_out = uInt(chunk)
          status = inflate(&stream, Z_NO_FLUSH)
          return chunk - Int(stream.avail_out)
        }
        if written > 0 {
          out.append(buffer, count: written)
        }
        if status == Z_STREAM_END { break }
        if status != Z_OK { return nil }
      }
      return out
    }
  }
}
