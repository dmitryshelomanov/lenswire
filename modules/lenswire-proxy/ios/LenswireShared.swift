// Keep in sync with targets/network-packet-tunnel/LenswireShared.swift
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
  static let mitmBypassKey = "lenswire.runtime.mitmBypass"
  /// Hosts that completed successful websocket_frames MITM (cleared with session bypass).
  static let mitmWsHostsKey = "lenswire.runtime.mitmWsHosts"
  /// Pending leaf-identity clears for the packet-tunnel process (app writes, extension drains).
  static let mitmLeafClearKey = "lenswire.runtime.mitmLeafClear"
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
  private static let capturesSummariesName = "summaries.json"
  private static let capturesRevisionName = "revision"
  private static let capturesLockName = ".captures.lock"
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
    let pathMatch: String
    let matchHeaders: [String: String]
    let delayMs: Int
    let bodyMode: String
    let status: Int
    let contentType: String
    let headers: [String: String]
    let bodyText: String
    let createdAt: Int

    var isStatusOnly: Bool {
      bodyMode.lowercased() == "statusonly"
    }

    var bodyData: Data {
      isStatusOnly ? Data() : Data(bodyText.utf8)
    }

    var responseHeaders: [String: String] {
      var headers: [String: String] = [:]
      if !isStatusOnly && !contentType.isEmpty {
        headers["Content-Type"] = contentType
      }
      mergeHeaders(&headers, overrides: self.headers)
      // Writers always set Content-Length / Connection; drop hop-by-hop from the rule.
      removeHeaderIgnoreCase(&headers, name: "content-length")
      removeHeaderIgnoreCase(&headers, name: "transfer-encoding")
      return headers
    }

    func applyDelay() {
      let ms = min(max(delayMs, 0), 30_000)
      if ms > 0 {
        Thread.sleep(forTimeInterval: Double(ms) / 1000.0)
      }
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
        pathMatch: {
          let raw = String(describing: obj["pathMatch"] ?? "exact")
          return raw.isEmpty ? "exact" : raw
        }(),
        matchHeaders: parseOverrideHeaders(obj["matchHeaders"]),
        delayMs: min(max((obj["delayMs"] as? Int) ?? Int("\(obj["delayMs"] ?? 0)") ?? 0, 0), 30_000),
        bodyMode: {
          let raw = String(describing: obj["bodyMode"] ?? "body")
          return raw.isEmpty ? "body" : raw
        }(),
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
    query: String,
    requestHeaders: [String: String] = [:]
  ) -> OverrideRule? {
    let normalizedPath = path.isEmpty ? "/" : path
    return loadOverrideRules().first { rule in
      rule.enabled
        && rule.kind == kind
        && rule.method.caseInsensitiveCompare(method) == .orderedSame
        && rule.scheme.caseInsensitiveCompare(scheme) == .orderedSame
        && rule.host.caseInsensitiveCompare(host) == .orderedSame
        && pathMatches(rule: rule, path: normalizedPath)
        && queryMatches(rule: rule, query: query)
        && headersMatch(required: rule.matchHeaders, actual: requestHeaders)
    }
  }

  private static func pathMatches(rule: OverrideRule, path: String) -> Bool {
    if rule.pathMatch.lowercased() == "regex" {
      guard let regex = try? NSRegularExpression(pattern: rule.path) else { return false }
      let range = NSRange(path.startIndex..<path.endIndex, in: path)
      return regex.firstMatch(in: path, options: [], range: range) != nil
    }
    return rule.path == path
  }

  private static func queryMatches(rule: OverrideRule, query: String) -> Bool {
    if rule.query.isEmpty { return true }
    return rule.query == query
  }

  private static func headersMatch(required: [String: String], actual: [String: String]) -> Bool {
    if required.isEmpty { return true }
    for (name, expected) in required {
      let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty { continue }
      guard let value = actual.first(where: { $0.key.caseInsensitiveCompare(trimmed) == .orderedSame })?.value
      else { return false }
      if !expected.isEmpty && value.range(of: expected, options: .caseInsensitive) == nil {
        return false
      }
    }
    return true
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
    if !rule.isStatusOnly && !rule.contentType.isEmpty {
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
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      let dir = capturesDirectory()
      var payload = entry
      let id = (entry["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      var captureId = (id?.isEmpty == false) ? id! : UUID().uuidString
      // Never replace an existing WebSocket capture with a non-WS row (match Android).
      let existingURL = dir.appendingPathComponent("\(captureId).json")
      if let existingData = try? Data(contentsOf: existingURL),
         let existing = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any],
         shouldReassignIdToProtectWs(existing: existing, incoming: payload) {
        captureId = UUID().uuidString
      }
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
      prependCaptureSummary(dir: dir, summary: toCaptureSummary(payload), indexCount: index.count)
      bumpCapturesRevision(dir: dir)
    }
  }

  static func shouldReassignIdToProtectWs(existing: [String: Any], incoming: [String: Any]) -> Bool {
    isWsCaptureMap(existing) && !isWsCaptureMap(incoming)
  }

  static func isWsCaptureMap(_ entry: [String: Any]) -> Bool {
    let reason = entry["reasonCode"] as? String
    if reason == "websocket_frames" || reason == "websocket_relay" || reason == "mitm_websocket" {
      return true
    }
    if let count = entry["wsFrameCount"] as? Int, count > 0 { return true }
    if let count = entry["wsFrameCount"] as? NSNumber, count.intValue > 0 { return true }
    if let frames = entry["wsFrames"] as? [Any], !frames.isEmpty { return true }
    return false
  }

  static func capturesRevision() -> Int64 {
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      return readCapturesRevision(dir: capturesDirectory())
    }
  }

  static func readCaptures(summaries: Bool = false) -> [[String: Any]] {
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      let dir = capturesDirectory()
      let index = readCaptureIndex(dir: dir)
      if summaries {
        let cached = readCaptureSummaries(dir: dir)
        if summariesAlignWithIndex(summaries: cached, index: index) {
          return cached
        }
      }
      var items: [[String: Any]] = []
      var valid: [String] = []
      var rebuilt: [[String: Any]] = []
      for name in index {
        let url = dir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          continue
        }
        let summary = toCaptureSummary(obj)
        items.append(summaries ? summary : obj)
        valid.append(name)
        rebuilt.append(summary)
      }
      if valid.count != index.count {
        writeCaptureIndex(dir: dir, index: valid)
      }
      writeCaptureSummaries(dir: dir, summaries: rebuilt)
      return items
    }
  }

  static func readCapture(id: String) -> [String: Any]? {
    withCapturesAccess {
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
  }

  static func clearCaptures() {
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      let dir = capturesDirectory()
      if let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
        for file in files {
          try? FileManager.default.removeItem(at: file)
        }
      }
      writeCaptureIndex(dir: dir, index: [])
      writeCaptureSummaries(dir: dir, summaries: [])
      bumpCapturesRevision(dir: dir)
    }
  }

  /// Append inspected WebSocket frames onto an existing capture and bump revision.
  static func appendWsFrames(
    id: String,
    frames: [[String: Any]],
    omitted: Bool = false,
    compressed: Bool = false,
    wsClosed: Bool = false,
    endedAt: Int64? = nil,
    wsEndReason: String? = nil,
    wsCloseCode: Int? = nil
  ) {
    if recordingPaused { return }
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { return }
      let dir = capturesDirectory()
      let url = dir.appendingPathComponent("\(trimmed).json")
      guard let data = try? Data(contentsOf: url),
            var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      else {
        return
      }

      var existing = obj["wsFrames"] as? [[String: Any]] ?? []
      for frame in frames {
        let isClose = (frame["opcode"] as? String) == "close"
        if existing.count >= WebSocketFrames.maxFrames && !isClose {
          break
        }
        if existing.count >= WebSocketFrames.maxFrames && isClose {
          if existing.count > WebSocketFrames.maxFrames {
            existing[existing.count - 1] = frame
          } else {
            existing.append(frame)
          }
          continue
        }
        existing.append(frame)
      }
      obj["wsFrames"] = existing
      obj["wsFrameCount"] = existing.count
      if omitted || existing.count >= WebSocketFrames.maxFrames {
        obj["wsFramesOmitted"] = true
      }
      if compressed || (obj["wsCompressed"] as? Bool == true) {
        obj["wsCompressed"] = true
      }
      applyWsClosedFields(
        &obj,
        wsClosed: wsClosed,
        endedAt: endedAt,
        wsEndReason: wsEndReason,
        wsCloseCode: wsCloseCode
      )
      obj["reasonCode"] = "websocket_frames"
      obj["captureSummary"] = "WebSocket frames inspected (read-only); no inject or rewrite."
      obj["httpPayloadAvailable"] = true
      guard let out = try? JSONSerialization.data(withJSONObject: obj, options: []) else { return }
      try? out.write(to: url, options: .atomic)
      updateCaptureSummary(dir: dir, id: trimmed, entry: obj)
      bumpCapturesRevision(dir: dir)
    }
  }

  /// Mark a WebSocket capture as closed (idempotent; prefers close_frame).
  static func markWsClosed(
    id: String,
    reason: String,
    closeCode: Int? = nil,
    endedAt: Int64 = Int64(Date().timeIntervalSince1970 * 1000)
  ) {
    if recordingPaused { return }
    withCapturesAccess {
      migrateCapturesAwayFromDefaults()
      let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { return }
      let dir = capturesDirectory()
      let url = dir.appendingPathComponent("\(trimmed).json")
      guard let data = try? Data(contentsOf: url),
            var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      else {
        return
      }
      if obj["wsClosed"] as? Bool == true {
        let existingReason = obj["wsEndReason"] as? String ?? ""
        if existingReason == "close_frame" || reason != "close_frame" {
          return
        }
      }
      applyWsClosedFields(
        &obj,
        wsClosed: true,
        endedAt: endedAt,
        wsEndReason: reason,
        wsCloseCode: closeCode
      )
      guard let out = try? JSONSerialization.data(withJSONObject: obj, options: []) else { return }
      try? out.write(to: url, options: .atomic)
      updateCaptureSummary(dir: dir, id: trimmed, entry: obj)
      bumpCapturesRevision(dir: dir)
    }
  }

  private static func applyWsClosedFields(
    _ obj: inout [String: Any],
    wsClosed: Bool,
    endedAt: Int64?,
    wsEndReason: String?,
    wsCloseCode: Int?
  ) {
    guard wsClosed else { return }
    obj["wsClosed"] = true
    if let endedAt { obj["endedAt"] = endedAt }
    if let wsEndReason, !wsEndReason.isEmpty { obj["wsEndReason"] = wsEndReason }
    if let wsCloseCode { obj["wsCloseCode"] = wsCloseCode }
  }

  static func toCaptureSummary(_ entry: [String: Any]) -> [String: Any] {
    var out = entry
    out["requestBody"] = bodyStub(entry["requestBody"])
    out["responseBody"] = bodyStub(entry["responseBody"])
    let frameCount: Int
    if let number = entry["wsFrameCount"] as? NSNumber {
      frameCount = number.intValue
    } else if let intValue = entry["wsFrameCount"] as? Int {
      frameCount = intValue
    } else if let frames = entry["wsFrames"] as? [Any] {
      frameCount = frames.count
    } else {
      frameCount = 0
    }
    if frameCount > 0 {
      out["wsFrameCount"] = frameCount
    }
    out.removeValue(forKey: "wsFrames")
    if entry["wsClosed"] as? Bool == true { out["wsClosed"] = true }
    if let endedAt = entry["endedAt"] { out["endedAt"] = endedAt }
    if let reason = entry["wsEndReason"] { out["wsEndReason"] = reason }
    if let code = entry["wsCloseCode"] { out["wsCloseCode"] = code }
    if entry["wsCompressed"] as? Bool == true { out["wsCompressed"] = true }
    if entry["wsFramesOmitted"] as? Bool == true { out["wsFramesOmitted"] = true }
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

  /// Cross-process serialization for App Group capture I/O (tunnel ↔ app).
  private static func withCapturesAccess<T>(_ body: () -> T) -> T {
    let dir = capturesDirectory()
    let lockURL = dir.appendingPathComponent(capturesLockName)
    if !FileManager.default.fileExists(atPath: lockURL.path) {
      FileManager.default.createFile(atPath: lockURL.path, contents: Data(), attributes: nil)
    }
    var result: T?
    var didRun = false
    var coordError: NSError?
    let coordinator = NSFileCoordinator()
    coordinator.coordinate(writingItemAt: lockURL, options: [], error: &coordError) { _ in
      capturesLock.lock()
      defer { capturesLock.unlock() }
      result = body()
      didRun = true
    }
    if didRun {
      return result!
    }
    // Fallback if coordination fails (still serialize in-process).
    capturesLock.lock()
    defer { capturesLock.unlock() }
    return body()
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

  private static func readCaptureSummaries(dir: URL) -> [[String: Any]] {
    let url = dir.appendingPathComponent(capturesSummariesName)
    guard let data = try? Data(contentsOf: url),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return arr
  }

  /// True when each summary id matches the corresponding index entry (`{id}.json`).
  static func summariesAlignWithIndex(summaries: [[String: Any]], index: [String]) -> Bool {
    guard summaries.count == index.count else { return false }
    for (i, name) in index.enumerated() {
      let id = name.hasSuffix(".json") ? String(name.dropLast(5)) : name
      guard let summaryId = summaries[i]["id"] as? String, summaryId == id else {
        return false
      }
    }
    return true
  }

  private static func writeCaptureSummaries(dir: URL, summaries: [[String: Any]]) {
    let url = dir.appendingPathComponent(capturesSummariesName)
    guard let data = try? JSONSerialization.data(withJSONObject: summaries, options: []) else { return }
    try? data.write(to: url, options: .atomic)
  }

  private static func prependCaptureSummary(dir: URL, summary: [String: Any], indexCount: Int) {
    var next = [summary]
    let previous = readCaptureSummaries(dir: dir)
    var seen = Set<String>()
    if let id = summary["id"] as? String { seen.insert(id) }
    for item in previous {
      if next.count >= indexCount { break }
      if let id = item["id"] as? String {
        if seen.contains(id) { continue }
        seen.insert(id)
      }
      next.append(item)
    }
    if next.count > indexCount {
      next = Array(next.prefix(indexCount))
    }
    writeCaptureSummaries(dir: dir, summaries: next)
  }

  private static func updateCaptureSummary(dir: URL, id: String, entry: [String: Any]) {
    var summaries = readCaptureSummaries(dir: dir)
    guard !summaries.isEmpty else { return }
    let summary = toCaptureSummary(entry)
    for i in 0..<summaries.count {
      if (summaries[i]["id"] as? String) == id {
        summaries[i] = summary
        writeCaptureSummaries(dir: dir, summaries: summaries)
        return
      }
    }
  }

  private static func migrateCapturesAwayFromDefaults() {
    guard sharedDefaults.object(forKey: capturesKey) != nil else { return }
    sharedDefaults.removeObject(forKey: capturesKey)
  }

  static func classifyBody(
    _ data: Data,
    contentType: String?,
    contentEncoding: String? = nil,
    forceTruncated: Bool = false,
    wireSize: Int? = nil
  ) -> [String: Any] {
    let reportedSize = wireSize ?? data.count
    if data.isEmpty && !forceTruncated {
      return ["kind": "empty", "size": 0]
    }
    if data.isEmpty && forceTruncated {
      return ["kind": "binary", "size": reportedSize, "truncated": true]
    }

    let decoded = maybeDecodeEncoding(data, contentEncoding: contentEncoding)
    let payload = decoded.data
    let encodingDecoded = decoded.decoded
    let size = forceTruncated ? reportedSize : payload.count
    let type = (contentType ?? "").lowercased()

    if type.contains("multipart/form-data"), let text = String(data: payload, encoding: .utf8) {
      let boundary = type
        .components(separatedBy: "boundary=")
        .dropFirst()
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      let summary = summarizeMultipart(text: text, boundary: boundary)
      return textBodyResult(
        kind: "text",
        text: summary,
        size: size,
        encodingDecoded: encodingDecoded,
        forceTruncated: forceTruncated
      )
    }

    if type.hasPrefix("image/") {
      return binaryBodyResult(
        kind: "image",
        payload: payload,
        size: size,
        encodingDecoded: encodingDecoded,
        maxPreview: maxImagePreviewBytes,
        forceTruncated: forceTruncated
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
        maxPreview: maxBinaryPreviewBytes,
        forceTruncated: forceTruncated
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
    return textBodyResult(
      kind: kind,
      text: display,
      size: size,
      encodingDecoded: encodingDecoded,
      forceTruncated: forceTruncated
    )
  }

  private static func textBodyResult(
    kind: String,
    text: String,
    size: Int,
    encodingDecoded: Bool,
    forceTruncated: Bool = false
  ) -> [String: Any] {
    let clippedNeeded = text.count > maxBodyBytes
    let truncated = forceTruncated || clippedNeeded
    let clipped: String
    if clippedNeeded {
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
    maxPreview: Int,
    forceTruncated: Bool = false
  ) -> [String: Any] {
    let previewNeeded = payload.count > maxPreview
    let truncated = forceTruncated || previewNeeded
    let preview = previewNeeded ? payload.prefix(maxPreview) : payload
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

/// UDP/443 (QUIC) drop counter + once-per-host capture signal.
enum QuicUdpBlock {
  private static let lock = NSLock()
  private static var drops: Int64 = 0
  private static var loggedHosts = Set<String>()
  private static let dropsKey = "lenswire.runtime.quicDrops"

  static func reset() {
    lock.lock()
    defer { lock.unlock() }
    drops = 0
    loggedHosts.removeAll()
    LenswireShared.sharedDefaults.set(0, forKey: dropsKey)
  }

  static func dropCount() -> Int64 {
    lock.lock()
    defer { lock.unlock() }
    let stored = Int64(LenswireShared.sharedDefaults.integer(forKey: dropsKey))
    return max(drops, stored)
  }

  static func recordDrop(host: String) {
    lock.lock()
    drops += 1
    let count = drops
    let key = host.lowercased().isEmpty ? "unknown" : host.lowercased()
    let shouldLog = loggedHosts.insert(key).inserted
    lock.unlock()
    LenswireShared.sharedDefaults.set(count, forKey: dropsKey)
    guard shouldLog else { return }
    LenswireShared.appendCapture([
      "id": UUID().uuidString,
      "startedAt": Int(Date().timeIntervalSince1970 * 1000),
      "method": "CONNECT",
      "scheme": "https",
      "host": key,
      "path": "/",
      "query": "",
      "status": 0,
      "requestHeaders": [String: String](),
      "responseHeaders": [String: String](),
      "requestBody": ["kind": "empty", "size": 0],
      "responseBody": ["kind": "empty", "size": 0],
      "timing": [
        "dnsMs": 0, "connectMs": 0, "tlsMs": 0, "ttfbMs": 0, "downloadMs": 0, "totalMs": 1,
      ],
      "reasonCode": "quic_udp_blocked",
      "hostnameSource": "udp",
      "hostnameConfidence": "medium",
      "rawTarget": "\(key):443/udp",
      "connectTarget": "\(key):443",
      "connectHost": key,
      "connectPort": 443,
      "effectiveHost": key,
      "captureMode": "tunnel",
      "httpPayloadAvailable": false,
      "captureSummary":
        "UDP/443 (QUIC) blocked — browser should fall back to TCP. QUIC payload is not captured.",
    ])
  }
}

/// Session MITM bypass policy for HardFailure paths that historically poisoned
/// a whole host (killing later WSS reconnects until VPN stop).
enum MitmSessionBypassPolicy {
  /// Idle timeout with no HTTP after MITM handshake must not session-bypass the host.
  static func shouldSessionBypassNoRequestTimeout() -> Bool { false }

  /// Unsupported protocol after MITM (e.g. HTTP/2). Skip session bypass when this host
  /// already completed a successful WebSocket MITM in the current session.
  static func shouldSessionBypassUnsupported(hostHadSuccessfulWsMitm: Bool) -> Bool {
    !hostHadSuccessfulWsMitm
  }
}

/// Session MITM bypass map shared via App Group (host lowercase → cause).
enum MitmBypassStore {
  private static let lock = NSLock()

  private static var map: [String: String] {
    get {
      (LenswireShared.sharedDefaults.dictionary(forKey: LenswireShared.mitmBypassKey) as? [String: String]) ?? [:]
    }
    set {
      LenswireShared.sharedDefaults.set(newValue, forKey: LenswireShared.mitmBypassKey)
    }
  }

  static func list() -> [[String: String]] {
    lock.lock()
    defer { lock.unlock() }
    return map.keys.sorted().map { host in
      ["host": host, "cause": map[host] ?? ""]
    }
  }

  static func cause(for host: String) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return map[host.lowercased()]
  }

  static func contains(_ host: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return map[host.lowercased()] != nil
  }

  static func add(_ host: String, cause: String) {
    lock.lock()
    defer { lock.unlock() }
    let key = host.lowercased()
    var next = map
    if next[key] == nil {
      next[key] = cause
      map = next
    }
  }

  static func remove(_ host: String) {
    lock.lock()
    defer { lock.unlock() }
    let key = host.lowercased()
    var next = map
    next.removeValue(forKey: key)
    map = next
    enqueueLeafClearLocked(hosts: [key], clearAll: false)
  }

  static func clear() {
    lock.lock()
    map = [:]
    enqueueLeafClearLocked(hosts: [], clearAll: true)
    lock.unlock()
    // Same VPN-session lifetime as bypass (App Group).
    WsMitmHostStore.clear()
  }

  /// Extension drains pending leaf-identity clears written by the app process.
  static func consumeLeafClearCommands() -> (clearAll: Bool, hosts: [String]) {
    lock.lock()
    defer { lock.unlock() }
    let raw = LenswireShared.sharedDefaults.dictionary(forKey: LenswireShared.mitmLeafClearKey) ?? [:]
    LenswireShared.sharedDefaults.removeObject(forKey: LenswireShared.mitmLeafClearKey)
    let clearAll = (raw["clearAll"] as? Bool) ?? false
    let hosts = (raw["hosts"] as? [String]) ?? []
    return (clearAll, hosts)
  }

  private static func enqueueLeafClearLocked(hosts: [String], clearAll: Bool) {
    var raw = LenswireShared.sharedDefaults.dictionary(forKey: LenswireShared.mitmLeafClearKey) ?? [:]
    let alreadyClearAll = (raw["clearAll"] as? Bool) ?? false
    if clearAll || alreadyClearAll {
      raw["clearAll"] = true
      raw["hosts"] = [String]()
    } else {
      var pending = Set((raw["hosts"] as? [String]) ?? [])
      pending.formUnion(hosts)
      raw["clearAll"] = false
      raw["hosts"] = Array(pending)
    }
    LenswireShared.sharedDefaults.set(raw, forKey: LenswireShared.mitmLeafClearKey)
  }
}

/// Hosts that completed a successful websocket_frames MITM (App Group; cleared with session bypass).
enum WsMitmHostStore {
  private static let lock = NSLock()

  private static var hosts: Set<String> {
    get {
      Set(LenswireShared.sharedDefaults.stringArray(forKey: LenswireShared.mitmWsHostsKey) ?? [])
    }
    set {
      LenswireShared.sharedDefaults.set(Array(newValue).sorted(), forKey: LenswireShared.mitmWsHostsKey)
    }
  }

  static func add(_ host: String) {
    let key = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !key.isEmpty else { return }
    lock.lock()
    defer { lock.unlock() }
    var next = hosts
    next.insert(key)
    hosts = next
  }

  static func contains(_ host: String) -> Bool {
    let key = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    lock.lock()
    defer { lock.unlock() }
    return hosts.contains(key)
  }

  static func clear() {
    lock.lock()
    defer { lock.unlock() }
    hosts = []
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
