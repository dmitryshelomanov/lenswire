import Foundation

// Keep in sync with targets/network-packet-tunnel/WebSocketFrameParser.swift

/// RFC 6455 frame parse + display helpers for read-only WebSocket inspect.
enum WebSocketFrames {
  static let maxFrames = 500
  static let maxTextBytes = 64 * 1024
  static let maxBinaryPreview = 256
  static let flushIntervalMs: Int64 = 250
  static let maxPayloadBytes = 16 * 1024 * 1024
  static let maxAssembledBytes = 16 * 1024 * 1024

  static let opcodeContinuation = 0
  static let opcodeText = 1
  static let opcodeBinary = 2
  static let opcodeClose = 8
  static let opcodePing = 9
  static let opcodePong = 10

  static func opcodeName(_ opcode: Int) -> String {
    switch opcode {
    case opcodeContinuation: return "continuation"
    case opcodeText: return "text"
    case opcodeBinary: return "binary"
    case opcodeClose: return "close"
    case opcodePing: return "ping"
    case opcodePong: return "pong"
    default: return "opcode_\(opcode)"
    }
  }

  static func classifyPayload(opcode: Int, payload: Data, rsv: Int = 0) -> [String: Any] {
    if opcode == opcodeClose { return classifyClose(payload) }
    // RSV bits indicate extensions (commonly permessage-deflate) — do not UTF-8 decode as text.
    if rsv != 0 { return classifyBinary(payload, compressed: true) }
    switch opcode {
    case opcodeText, opcodePing, opcodePong:
      return classifyTextish(payload)
    default:
      return classifyBinary(payload)
    }
  }

  private static func classifyClose(_ payload: Data) -> [String: Any] {
    if payload.isEmpty {
      return ["kind": "empty", "size": 0]
    }
    if payload.count >= 2 {
      let code = (Int(payload[0]) << 8) | Int(payload[1])
      let reason: String
      if payload.count > 2 {
        reason = String(data: payload.subdata(in: 2..<payload.count), encoding: .utf8) ?? ""
      } else {
        reason = ""
      }
      let text = reason.isEmpty ? "code=\(code)" : "code=\(code) reason=\(reason)"
      return [
        "kind": "text",
        "text": text,
        "size": payload.count,
        "truncated": false,
        "closeCode": code,
      ]
    }
    return classifyBinary(payload)
  }

  private static func classifyTextish(_ payload: Data) -> [String: Any] {
    if payload.isEmpty {
      return ["kind": "empty", "size": 0]
    }
    var text = String(data: payload, encoding: .utf8) ?? ""
    let size = payload.count
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let kind: String
    if trimmed.first == "{" || trimmed.first == "[" {
      text = prettyJson(text)
      kind = "json"
    } else {
      kind = "text"
    }
    let truncated = payload.count > maxTextBytes || text.utf8.count > maxTextBytes
    let clipped: String
    if text.count > maxTextBytes {
      let idx = text.index(text.startIndex, offsetBy: maxTextBytes)
      clipped = String(text[..<idx]) + "\n\n...truncated..."
    } else {
      clipped = text
    }
    return [
      "kind": kind,
      "text": clipped,
      "size": size,
      "truncated": truncated,
    ]
  }

  private static func prettyJson(_ raw: String) -> String {
    guard let data = raw.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data),
          let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]),
          let text = String(data: pretty, encoding: .utf8)
    else {
      return raw
    }
    return text
  }

  private static func classifyBinary(_ payload: Data, compressed: Bool = false) -> [String: Any] {
    if payload.isEmpty {
      var empty: [String: Any] = ["kind": "empty", "size": 0]
      if compressed { empty["compressed"] = true }
      return empty
    }
    let truncated = payload.count > maxBinaryPreview
    let preview = truncated ? payload.prefix(maxBinaryPreview) : payload
    var out: [String: Any] = [
      "kind": "binary",
      "size": payload.count,
      "truncated": truncated,
      "previewBase64": preview.base64EncodedString(),
    ]
    if compressed { out["compressed"] = true }
    return out
  }

  static func closeCode(from payload: Data) -> Int? {
    guard payload.count >= 2 else { return nil }
    return (Int(payload[0]) << 8) | Int(payload[1])
  }

  static func displayFrame(dir: String, opcode: Int, payload: Data, rsv: Int = 0, atMs: Int64? = nil) -> [String: Any] {
    let at = atMs ?? Int64(Date().timeIntervalSince1970 * 1000)
    return [
      "id": UUID().uuidString,
      "at": at,
      "dir": dir,
      "opcode": opcodeName(opcode),
      "size": payload.count,
      "payload": classifyPayload(opcode: opcode, payload: payload, rsv: rsv),
    ]
  }
}

/// Incremental RFC 6455 frame parser. Forwards bytes separately; this only inspects.
final class WebSocketFrameParser {
  struct RawFrame {
    let fin: Bool
    let opcode: Int
    let payload: Data
    let rsv: Int
    let oversized: Bool

    init(fin: Bool, opcode: Int, payload: Data, rsv: Int = 0, oversized: Bool = false) {
      self.fin = fin
      self.opcode = opcode
      self.payload = payload
      self.rsv = rsv
      self.oversized = oversized
    }
  }

  private var pending = Data()

  func append(_ bytes: Data) {
    guard !bytes.isEmpty else { return }
    pending.append(bytes)
  }

  func drain() -> [RawFrame] {
    var index = 0
    var out: [RawFrame] = []
    while true {
      guard let parsed = parseOne(pending, start: index) else { break }
      out.append(parsed.frame)
      index = parsed.nextIndex
    }
    if index > 0 {
      if index < pending.count {
        pending = Data(pending[index...])
      } else {
        pending.removeAll(keepingCapacity: true)
      }
    }
    return out
  }

  private struct ParseResult {
    let frame: RawFrame
    let nextIndex: Int
  }

  private func parseOne(_ buf: Data, start: Int) -> ParseResult? {
    guard buf.count - start >= 2 else { return nil }
    let b0 = Int(buf[start])
    let b1 = Int(buf[start + 1])
    let fin = (b0 & 0x80) != 0
    let rsv = (b0 & 0x70) >> 4
    let opcode = b0 & 0x0f
    let masked = (b1 & 0x80) != 0
    var payloadLen = Int(b1 & 0x7f)
    var headerLen = 2

    if payloadLen == 126 {
      guard buf.count - start >= 4 else { return nil }
      payloadLen = (Int(buf[start + 2]) << 8) | Int(buf[start + 3])
      headerLen = 4
    } else if payloadLen == 127 {
      guard buf.count - start >= 10 else { return nil }
      var value: UInt64 = 0
      for i in 0..<8 {
        value = (value << 8) | UInt64(buf[start + 2 + i])
      }
      if value > UInt64(Int.max) { return nil }
      payloadLen = Int(value)
      headerLen = 10
    }

    if payloadLen > WebSocketFrames.maxPayloadBytes {
      let maskLen = masked ? 4 : 0
      let total = headerLen + maskLen + payloadLen
      guard buf.count - start >= total else { return nil }
      return ParseResult(
        frame: RawFrame(fin: fin, opcode: opcode, payload: Data(), rsv: rsv, oversized: true),
        nextIndex: start + total
      )
    }

    let maskLen = masked ? 4 : 0
    let total = headerLen + maskLen + payloadLen
    guard buf.count - start >= total else { return nil }

    let maskStart = start + headerLen
    let payloadStart = maskStart + maskLen
    var payload = Data(buf[payloadStart..<(payloadStart + payloadLen)])
    if masked {
      let k0 = buf[maskStart]
      let k1 = buf[maskStart + 1]
      let k2 = buf[maskStart + 2]
      let k3 = buf[maskStart + 3]
      for i in 0..<payload.count {
        let key: UInt8
        switch i % 4 {
        case 0: key = k0
        case 1: key = k1
        case 2: key = k2
        default: key = k3
        }
        payload[i] ^= key
      }
    }
    return ParseResult(
      frame: RawFrame(fin: fin, opcode: opcode, payload: payload, rsv: rsv),
      nextIndex: start + total
    )
  }
}

/// Assembles fragmented data messages into one display unit. Control frames emit immediately.
final class WebSocketMessageAssembler {
  struct Assembled {
    let opcode: Int
    let payload: Data
    let rsv: Int
    let omitted: Bool

    init(opcode: Int, payload: Data, rsv: Int = 0, omitted: Bool = false) {
      self.opcode = opcode
      self.payload = payload
      self.rsv = rsv
      self.omitted = omitted
    }
  }

  private var startedOpcode: Int?
  private var startedRsv: Int = 0
  private var chunks = Data()

  func accept(_ frame: WebSocketFrameParser.RawFrame) -> Assembled? {
    let opcode = frame.opcode

    if frame.oversized {
      reset()
      return frame.fin ? Assembled(opcode: opcode, payload: Data(), omitted: true) : nil
    }

    if opcode == WebSocketFrames.opcodeClose
      || opcode == WebSocketFrames.opcodePing
      || opcode == WebSocketFrames.opcodePong
    {
      return Assembled(opcode: opcode, payload: frame.payload, rsv: frame.rsv)
    }

    if opcode == WebSocketFrames.opcodeText || opcode == WebSocketFrames.opcodeBinary {
      startedOpcode = opcode
      startedRsv = frame.rsv
      chunks = Data()
      if !appendChunk(frame.payload) {
        reset()
        return frame.fin ? Assembled(opcode: opcode, payload: Data(), omitted: true) : nil
      }
      if frame.fin {
        let out = Assembled(opcode: startedOpcode!, payload: chunks, rsv: startedRsv)
        reset()
        return out
      }
      return nil
    }

    if opcode == WebSocketFrames.opcodeContinuation {
      guard let started = startedOpcode else {
        return frame.fin ? Assembled(opcode: WebSocketFrames.opcodeBinary, payload: frame.payload, rsv: frame.rsv) : nil
      }
      if !appendChunk(frame.payload) {
        reset()
        return frame.fin ? Assembled(opcode: started, payload: Data(), omitted: true) : nil
      }
      if frame.fin {
        let out = Assembled(opcode: started, payload: chunks, rsv: startedRsv)
        reset()
        return out
      }
      return nil
    }

    return frame.fin ? Assembled(opcode: opcode, payload: frame.payload, rsv: frame.rsv) : nil
  }

  private func appendChunk(_ payload: Data) -> Bool {
    if chunks.count + payload.count > WebSocketFrames.maxAssembledBytes {
      return false
    }
    chunks.append(payload)
    return true
  }

  private func reset() {
    startedOpcode = nil
    startedRsv = 0
    chunks = Data()
  }
}

/// Throttled writer that grows `wsFrames` on an existing capture.
final class WsFrameCaptureRecorder {
  private let captureId: String
  private let lock = NSLock()
  private var pending: [[String: Any]] = []
  private var lastFlushMs: Int64 = 0
  private var totalRecorded = 0
  private var omitted = false
  private var compressed = false
  private var idleFlushWorkItem: DispatchWorkItem?
  private var recorderDone = false
  private var sessionClosed = false
  private var endReason: String?
  private var endCloseCode: Int?
  private var endedAtMs: Int64?

  init(captureId: String) {
    self.captureId = captureId
  }

  func record(dir: String, opcode: Int, payload: Data, rsv: Int = 0) {
    lock.lock()
    defer { lock.unlock() }
    guard !recorderDone else { return }
    if rsv != 0 { compressed = true }
    let isClose = opcode == WebSocketFrames.opcodeClose
    if totalRecorded >= WebSocketFrames.maxFrames && !isClose {
      if !omitted {
        omitted = true
        flushLocked(force: true)
      }
      return
    }
    totalRecorded += 1
    pending.append(WebSocketFrames.displayFrame(dir: dir, opcode: opcode, payload: payload, rsv: rsv))
    if isClose {
      markClosedLocked(reason: "close_frame", closeCode: WebSocketFrames.closeCode(from: payload))
    }
    flushLocked(force: isClose)
    if !isClose { scheduleIdleFlushLocked() }
  }

  func markOmitted() {
    lock.lock()
    defer { lock.unlock() }
    guard !recorderDone else { return }
    if !omitted {
      omitted = true
      flushLocked(force: true)
    }
  }

  func markCompressed() {
    lock.lock()
    defer { lock.unlock() }
    guard !recorderDone else { return }
    compressed = true
  }

  func markClosed(reason: String, closeCode: Int? = nil) {
    lock.lock()
    defer { lock.unlock() }
    markClosedLocked(reason: reason, closeCode: closeCode)
    flushLocked(force: true)
    idleFlushWorkItem?.cancel()
    idleFlushWorkItem = nil
  }

  func flush(force: Bool = true) {
    lock.lock()
    defer { lock.unlock() }
    flushLocked(force: force)
    if force {
      idleFlushWorkItem?.cancel()
      idleFlushWorkItem = nil
    }
  }

  private func markClosedLocked(reason: String, closeCode: Int?) {
    if sessionClosed {
      let existing = endReason
      if existing == "close_frame" || reason != "close_frame" { return }
    }
    sessionClosed = true
    endReason = reason
    if let closeCode { endCloseCode = closeCode }
    if endedAtMs == nil {
      endedAtMs = Int64(Date().timeIntervalSince1970 * 1000)
    }
  }

  private func scheduleIdleFlushLocked() {
    idleFlushWorkItem?.cancel()
    let item = DispatchWorkItem { [weak self] in
      self?.flush(force: true)
    }
    idleFlushWorkItem = item
    DispatchQueue.global(qos: .utility).asyncAfter(
      deadline: .now() + .milliseconds(Int(WebSocketFrames.flushIntervalMs)),
      execute: item
    )
  }

  /// Snapshot pending frames and persist off the relay path.
  private func flushLocked(force: Bool) {
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    if !force && pending.isEmpty && !sessionClosed { return }
    if !force
      && now - lastFlushMs < WebSocketFrames.flushIntervalMs
      && pending.count < 8
    {
      return
    }
    let shouldFlushClosed = force && sessionClosed
    if pending.isEmpty && !(force && (omitted || compressed || shouldFlushClosed)) { return }
    let batch = pending
    pending.removeAll(keepingCapacity: true)
    lastFlushMs = now
    let closed = sessionClosed
    let reason = endReason
    let closeCode = endCloseCode
    let endedAt = endedAtMs
    let omit = omitted
    let comp = compressed
    let id = captureId
    Self.flushQueue.async {
      if batch.isEmpty && closed {
        LenswireShared.markWsClosed(
          id: id,
          reason: reason ?? "eof",
          closeCode: closeCode,
          endedAt: endedAt ?? now
        )
      } else {
        LenswireShared.appendWsFrames(
          id: id,
          frames: batch,
          omitted: omit,
          compressed: comp,
          wsClosed: closed,
          endedAt: closed ? endedAt : nil,
          wsEndReason: closed ? reason : nil,
          wsCloseCode: closed ? closeCode : nil
        )
      }
    }
  }

  private static let flushQueue = DispatchQueue(label: "lenswire.ws.flush", qos: .utility)
}
