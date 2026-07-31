// Keep in sync with modules/lenswire-proxy/ios/LenswireShared.swift
import Foundation
import zlib

enum LenswireShared {
  static let appGroupId = "group.com.lenswire.app"
  static let capturesKey = "lenswire.captures"
  static let proxyPort: UInt16 = 9090
  static let socksPort: UInt16 = 1080
  static let ipv6RouteEnabledKey = "lenswire.settings.vpnIpv6RouteEnabled"
  static let providerBundleSuffix = "network-packet-tunnel"
  static let caGeneratedAtKey = "lenswire.ca.generatedAt"
  static let caFingerprintKey = "lenswire.ca.fingerprint"
  static let httpsDecryptKey = "lenswire.settings.httpsDecrypt"
  static let overridesKey = "lenswire.settings.overrides"
  static let recordingPausedKey = "lenswire.settings.recordingPaused"
  static let caPemFileName = "lenswire-ca.pem"
  static let caCertFileName = "lenswire-ca.cer"
  static let caKeyFileName = "lenswire-ca.key"
  static let maxBodyBytes = 256 * 1024
  static let maxImagePreviewBytes = 512 * 1024
  static let maxBinaryPreviewBytes = 16 * 1024
  static let maxDecodedBodyBytes = 2 * 1024 * 1024
  static let maxCaptures = 200
  private static let capturesDirName = "captures"
  private static let capturesIndexName = "index.json"
  private static let capturesRevisionName = "revision"
  private static let capturesLock = NSLock()

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

  static var ipv6RouteEnabled: Bool {
    get { sharedDefaults.bool(forKey: ipv6RouteEnabledKey) }
    set { sharedDefaults.set(newValue, forKey: ipv6RouteEnabledKey) }
  }

  static var recordingPaused: Bool {
    get { sharedDefaults.bool(forKey: recordingPausedKey) }
    set { sharedDefaults.set(newValue, forKey: recordingPausedKey) }
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
    if recordingPaused { return }
    capturesLock.lock()
    defer { capturesLock.unlock() }
    migrateCapturesAwayFromDefaults()
    let dir = capturesDirectory()
    var payload = entry
    let id = (entry["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let captureId = (id?.isEmpty == false) ? id! : UUID().uuidString
    payload["id"] = captureId
    let fileName = "\(captureId).json"
    guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else { return }
    try? data.write(to: dir.appendingPathComponent(fileName), options: .atomic)

    var index = readCaptureIndex(dir: dir)
    index.removeAll { $0 == fileName }
    index.insert(fileName, at: 0)
    if index.count > maxCaptures {
      for drop in index.suffix(from: maxCaptures) {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(drop))
      }
      index = Array(index.prefix(maxCaptures))
    }
    writeCaptureIndex(dir: dir, index: index)
    bumpCapturesRevision(dir: dir)
  }

  static func capturesRevision() -> Int64 {
    capturesLock.lock()
    defer { capturesLock.unlock() }
    migrateCapturesAwayFromDefaults()
    return readCapturesRevision(dir: capturesDirectory())
  }

  static func readCaptures(summaries: Bool = false) -> [[String: Any]] {
    capturesLock.lock()
    defer { capturesLock.unlock() }
    migrateCapturesAwayFromDefaults()
    let dir = capturesDirectory()
    let index = readCaptureIndex(dir: dir)
    var items: [[String: Any]] = []
    var valid: [String] = []
    for name in index {
      let url = dir.appendingPathComponent(name)
      guard let data = try? Data(contentsOf: url),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        continue
      }
      items.append(summaries ? toCaptureSummary(obj) : obj)
      valid.append(name)
    }
    if valid.count != index.count {
      writeCaptureIndex(dir: dir, index: valid)
    }
    return items
  }

  static func readCapture(id: String) -> [String: Any]? {
    capturesLock.lock()
    defer { capturesLock.unlock() }
    migrateCapturesAwayFromDefaults()
    let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let url = capturesDirectory().appendingPathComponent("\(trimmed).json")
    guard let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    return obj
  }

  static func clearCaptures() {
    capturesLock.lock()
    defer { capturesLock.unlock() }
    migrateCapturesAwayFromDefaults()
    let dir = capturesDirectory()
    if let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
      for file in files {
        try? FileManager.default.removeItem(at: file)
      }
    }
    writeCaptureIndex(dir: dir, index: [])
    bumpCapturesRevision(dir: dir)
  }

  static func toCaptureSummary(_ entry: [String: Any]) -> [String: Any] {
    var out = entry
    out["requestBody"] = bodyStub(entry["requestBody"])
    out["responseBody"] = bodyStub(entry["responseBody"])
    return out
  }

  private static func bodyStub(_ value: Any?) -> [String: Any] {
    guard let body = value as? [String: Any] else {
      return ["kind": "empty", "size": 0]
    }
    let size: Int
    if let number = body["size"] as? NSNumber {
      size = number.intValue
    } else if let intValue = body["size"] as? Int {
      size = intValue
    } else {
      size = 0
    }
    var stub: [String: Any] = [
      "kind": body["kind"] as? String ?? "empty",
      "size": size,
    ]
    if body["truncated"] as? Bool == true {
      stub["truncated"] = true
    }
    if body["encodingDecoded"] as? Bool == true {
      stub["encodingDecoded"] = true
    }
    return stub
  }

  private static func readCapturesRevision(dir: URL) -> Int64 {
    let url = dir.appendingPathComponent(capturesRevisionName)
    guard let data = try? Data(contentsOf: url),
          let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          let value = Int64(text) else {
      return 0
    }
    return value
  }

  private static func bumpCapturesRevision(dir: URL) {
    let next = readCapturesRevision(dir: dir) + 1
    let url = dir.appendingPathComponent(capturesRevisionName)
    try? String(next).data(using: .utf8)?.write(to: url, options: .atomic)
  }

  private static func capturesDirectory() -> URL {
    let dir = sharedContainerURL.appendingPathComponent(capturesDirName, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private static func readCaptureIndex(dir: URL) -> [String] {
    let url = dir.appendingPathComponent(capturesIndexName)
    guard let data = try? Data(contentsOf: url),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else {
      return []
    }
    return arr
  }

  private static func writeCaptureIndex(dir: URL, index: [String]) {
    let url = dir.appendingPathComponent(capturesIndexName)
    guard let data = try? JSONSerialization.data(withJSONObject: index, options: []) else { return }
    try? data.write(to: url, options: .atomic)
  }

  private static func migrateCapturesAwayFromDefaults() {
    guard sharedDefaults.object(forKey: capturesKey) != nil else { return }
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

    if type.contains("multipart/form-data"), let text = String(data: payload, encoding: .utf8) {
      let boundary = type
        .components(separatedBy: "boundary=")
        .dropFirst()
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      let summary = summarizeMultipart(text: text, boundary: boundary)
      return textBodyResult(kind: "text", text: summary, size: size, encodingDecoded: encodingDecoded)
    }

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
    let display: String
    if type.contains("json") || text.first == "{" || text.first == "[" {
      kind = "json"
      display = text
    } else {
      kind = "text"
      display = text
    }
    return textBodyResult(kind: kind, text: display, size: size, encodingDecoded: encodingDecoded)
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

  /// windowBits: 15 zlib, 15+32 gzip auto, -15 raw deflate
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
        if out.count >= maxDecodedBodyBytes { break }
        let room = min(chunk, maxDecodedBodyBytes - out.count)
        let written: Int = buffer.withUnsafeMutableBufferPointer { buf in
          stream.next_out = buf.baseAddress
          stream.avail_out = uInt(room)
          status = zlib.inflate(&stream, Z_NO_FLUSH)
          return room - Int(stream.avail_out)
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

  private static func summarizeMultipart(text: String, boundary: String?) -> String {
    guard let boundary, !boundary.isEmpty else {
      return text
    }
    let marker = "--\(boundary)"
    let parts = text.components(separatedBy: marker)
    var lines = ["multipart/form-data summary"]
    var index = 0

    for part in parts {
      let trimmed = part.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty || trimmed == "--" { continue }
      guard let headerRange = part.range(of: "\r\n\r\n") else { continue }
      let headerBlock = String(part[..<headerRange.lowerBound])
      var payload = String(part[headerRange.upperBound...])
      payload = payload.trimmingCharacters(in: CharacterSet(charactersIn: "\r\n"))
      let headers = headerBlock.components(separatedBy: "\r\n")
      let disposition = headers.first { $0.lowercased().hasPrefix("content-disposition") } ?? ""
      let contentType = headers.first { $0.lowercased().hasPrefix("content-type") } ?? "Content-Type: text/plain"
      let name = value(in: disposition, key: "name")
      let filename = value(in: disposition, key: "filename")
      let bytes = payload.lengthOfBytes(using: .utf8)

      index += 1
      var row = "\(index). name=\(name.isEmpty ? "(unnamed)" : name)"
      if !filename.isEmpty {
        row += ", file=\(filename)"
      }
      row += ", \(contentType.replacingOccurrences(of: "Content-Type:", with: "").trimmingCharacters(in: .whitespaces))"
      row += ", size=\(bytes) B"
      lines.append(row)
    }

    return lines.joined(separator: "\n")
  }

  private static func value(in header: String, key: String) -> String {
    let token = "\(key)=\""
    guard let start = header.range(of: token) else { return "" }
    let tail = header[start.upperBound...]
    return String(tail.prefix { $0 != "\"" })
  }
}

/// App Group–backed runtime diagnostics (Android `ProxyRuntime` equivalent).
enum ProxyRuntimeStore {
  private static let statusKey = "lenswire.runtime.status"
  private static let lastErrorKey = "lenswire.runtime.lastError"
  private static let diagnosticsKey = "lenswire.runtime.diagnostics"

  static var status: String {
    get { LenswireShared.sharedDefaults.string(forKey: statusKey) ?? "stopped" }
    set { LenswireShared.sharedDefaults.set(newValue, forKey: statusKey) }
  }

  static var lastError: String? {
    get { LenswireShared.sharedDefaults.string(forKey: lastErrorKey) }
    set {
      if let newValue {
        LenswireShared.sharedDefaults.set(newValue, forKey: lastErrorKey)
      } else {
        LenswireShared.sharedDefaults.removeObject(forKey: lastErrorKey)
      }
    }
  }

  static var diagnostics: [String: Any] {
    get {
      guard let data = LenswireShared.sharedDefaults.data(forKey: diagnosticsKey),
            let obj = try? JSONSerialization.jsonObject(with: data),
            let map = obj as? [String: Any]
      else {
        return [
          "mode": "stopped",
          "proxyPort": Int(LenswireShared.proxyPort),
          "socksPort": Int(LenswireShared.socksPort),
        ]
      }
      return map
    }
    set {
      if let data = try? JSONSerialization.data(withJSONObject: sanitize(newValue)) {
        LenswireShared.sharedDefaults.set(data, forKey: diagnosticsKey)
      }
    }
  }

  static func snapshot() -> [String: Any] {
    var out: [String: Any] = [
      "status": status,
      "runtime": diagnostics,
    ]
    if let lastError {
      out["lastError"] = lastError
    } else {
      out["lastError"] = NSNull()
    }
    return out
  }

  static func markStopped() {
    status = "stopped"
    lastError = nil
    diagnostics = [
      "mode": "stopped",
      "proxyPort": Int(LenswireShared.proxyPort),
      "socksPort": Int(LenswireShared.socksPort),
    ]
  }

  static func markError(_ message: String) {
    status = "error"
    lastError = message
  }

  private static func sanitize(_ value: Any) -> Any {
    switch value {
    case let dict as [String: Any]:
      var out: [String: Any] = [:]
      for (k, v) in dict {
        out[k] = sanitize(v)
      }
      return out
    case let arr as [Any]:
      return arr.map { sanitize($0) }
    case is String, is Int, is Double, is Bool, is NSNull:
      return value
    case let n as NSNumber:
      return n
    default:
      return String(describing: value)
    }
  }
}
