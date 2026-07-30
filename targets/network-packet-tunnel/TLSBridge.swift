import Darwin
import Foundation
import Network
import Security

// Secure Transport is required to terminate TLS with a custom identity on an existing
// NWConnection byte stream (MITM). Network.framework cannot do that. Re-bind C symbols
// so Swift does not treat the still-linked APIs as hard deprecations.

@_silgen_name("SSLCreateContext")
private func ST_SSLCreateContext(
  _ alloc: CFAllocator?,
  _ protocolSide: SSLProtocolSide,
  _ connectionType: SSLConnectionType
) -> SSLContext?

@_silgen_name("SSLSetIOFuncs")
private func ST_SSLSetIOFuncs(
  _ context: SSLContext,
  _ readFunc: SSLReadFunc,
  _ writeFunc: SSLWriteFunc
) -> OSStatus

@_silgen_name("SSLSetConnection")
private func ST_SSLSetConnection(
  _ context: SSLContext,
  _ connection: SSLConnectionRef
) -> OSStatus

@_silgen_name("SSLSetCertificate")
private func ST_SSLSetCertificate(
  _ context: SSLContext,
  _ certRefs: CFArray?
) -> OSStatus

@_silgen_name("SSLSetALPNProtocols")
private func ST_SSLSetALPNProtocols(
  _ context: SSLContext,
  _ protocols: CFArray
) -> OSStatus

@_silgen_name("SSLCopyALPNProtocols")
private func ST_SSLCopyALPNProtocols(
  _ context: SSLContext,
  _ protocols: UnsafeMutablePointer<CFArray?>
) -> OSStatus

@_silgen_name("SSLHandshake")
private func ST_SSLHandshake(_ context: SSLContext) -> OSStatus

@_silgen_name("SSLRead")
private func ST_SSLRead(
  _ context: SSLContext,
  _ data: UnsafeMutableRawPointer,
  _ dataLength: Int,
  _ processed: UnsafeMutablePointer<Int>
) -> OSStatus

@_silgen_name("SSLWrite")
private func ST_SSLWrite(
  _ context: SSLContext,
  _ data: UnsafeRawPointer,
  _ dataLength: Int,
  _ processed: UnsafeMutablePointer<Int>
) -> OSStatus

@_silgen_name("SSLSetPeerDomainName")
private func ST_SSLSetPeerDomainName(
  _ context: SSLContext,
  _ peerName: UnsafePointer<CChar>?,
  _ peerNameLen: Int
) -> OSStatus

@_silgen_name("SSLClose")
private func ST_SSLClose(_ context: SSLContext) -> OSStatus

/// TLS server (or client) over an existing `NWConnection` using Secure Transport IO callbacks.
final class TLSBridge {
  enum Role {
    case server
    case client
  }

  enum TLSError: Error {
    case contextCreateFailed
    case configureFailed(String, OSStatus)
    case handshakeFailed(OSStatus)
    case readFailed(OSStatus)
    case writeFailed(OSStatus)
    case closed
    /// No application data within the idle wait window (used after MITM handshake).
    case timedOut
  }

  private let connection: NWConnection
  private let queue: DispatchQueue
  private var context: SSLContext
  private let lock = NSLock()
  private var inbox = Data()
  private var closed = false
  private var receiveInFlight = false
  /// When true, `pumpReceive(wait:)` throws `timedOut` if the wait expires with an empty inbox.
  /// Enable for post-handshake MITM request reads; leave false for WebSocket relay (idle is normal).
  var throwOnIdleTimeout = false

  init(
    connection: NWConnection,
    queue: DispatchQueue,
    role: Role,
    identity: SecIdentity?,
    preloadedData: Data = Data(),
    peerHostname: String? = nil
  ) throws {
    self.connection = connection
    self.queue = queue
    self.inbox = preloadedData

    let side: SSLProtocolSide = role == .server ? .serverSide : .clientSide
    guard let ctx = ST_SSLCreateContext(kCFAllocatorDefault, side, .streamType) else {
      throw TLSError.contextCreateFailed
    }
    self.context = ctx

    try checkStatus(
      ST_SSLSetIOFuncs(ctx, TLSBridge.sslRead, TLSBridge.sslWrite),
      operation: "SSLSetIOFuncs"
    )
    let unmanaged = Unmanaged.passUnretained(self).toOpaque()
    try checkStatus(
      ST_SSLSetConnection(ctx, unmanaged),
      operation: "SSLSetConnection"
    )

    if role == .server, let identity {
      let certs: [Any] = [identity]
      try checkStatus(
        ST_SSLSetCertificate(ctx, certs as CFArray),
        operation: "SSLSetCertificate"
      )
    }

    if role == .client, let peerHostname, !peerHostname.isEmpty {
      try peerHostname.withCString { cstr in
        try checkStatus(
          ST_SSLSetPeerDomainName(ctx, cstr, strlen(cstr)),
          operation: "SSLSetPeerDomainName"
        )
      }
    }

    // Prefer HTTP/1.1 so we can parse requests without HTTP/2 framing.
    if #available(iOS 11.0, *) {
      let protocols = ["http/1.1"] as CFArray
      try checkStatus(
        ST_SSLSetALPNProtocols(ctx, protocols),
        operation: "SSLSetALPNProtocols"
      )
    }
  }

  func handshake() throws {
    while true {
      let status = ST_SSLHandshake(context)
      if status == errSecSuccess {
        return
      }
      if status == errSSLWouldBlock {
        try pumpReceive(wait: true)
        continue
      }
      throw TLSError.handshakeFailed(status)
    }
  }

  /// Negotiated ALPN after handshake (MITM server forces http/1.1).
  func negotiatedAlpn() -> String {
    if #available(iOS 11.0, *) {
      var protocols: CFArray?
      let status = ST_SSLCopyALPNProtocols(context, &protocols)
      if status == errSecSuccess, let protocols {
        let names = protocols as? [String] ?? []
        if let first = names.first, !first.isEmpty {
          return first
        }
      }
    }
    return "http/1.1"
  }

  func read(maxLength: Int = 65536) throws -> Data {
    var buffer = [UInt8](repeating: 0, count: maxLength)
    while true {
      var processed = 0
      let status = ST_SSLRead(context, &buffer, maxLength, &processed)
      if processed > 0 {
        return Data(buffer.prefix(processed))
      }
      // errSecSuccess + 0 bytes is not EOF — treat as would-block and wait for data.
      // Only errSSLClosed* / TLSError.closed surface a closed peer.
      if status == errSecSuccess || status == errSSLWouldBlock {
        try pumpReceive(wait: true)
        continue
      }
      if status == errSSLClosedGraceful || status == errSSLClosedNoNotify {
        throw TLSError.closed
      }
      throw TLSError.readFailed(status)
    }
  }

  func write(_ data: Data) throws {
    var total = 0
    let bytes = [UInt8](data)
    while total < bytes.count {
      var processed = 0
      let status: OSStatus = bytes.withUnsafeBufferPointer { buffer in
        guard let base = buffer.baseAddress else { return errSSLBadConfiguration }
        return ST_SSLWrite(context, base + total, bytes.count - total, &processed)
      }
      total += processed
      if status == errSecSuccess {
        continue
      }
      if status == errSSLWouldBlock {
        try pumpReceive(wait: false)
        Thread.sleep(forTimeInterval: 0.005)
        continue
      }
      throw TLSError.writeFailed(status)
    }
  }

  func close() {
    lock.lock()
    closed = true
    lock.unlock()
    _ = ST_SSLClose(context)
    connection.cancel()
  }

  // MARK: - NW receive → inbox

  private func checkStatus(_ status: OSStatus, operation: String) throws {
    if status == errSecSuccess {
      return
    }
    throw TLSError.configureFailed(operation, status)
  }

  private func pumpReceive(wait: Bool) throws {
    lock.lock()
    if closed {
      lock.unlock()
      throw TLSError.closed
    }
    if !inbox.isEmpty {
      lock.unlock()
      return
    }
    lock.unlock()

    let semaphore = wait ? DispatchSemaphore(value: 0) : nil
    var receiveError: Error?

    lock.lock()
    let shouldStart = !receiveInFlight
    if shouldStart { receiveInFlight = true }
    lock.unlock()

    if shouldStart {
      connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
        guard let self else {
          semaphore?.signal()
          return
        }
        self.lock.lock()
        self.receiveInFlight = false
        if let data, !data.isEmpty {
          self.inbox.append(data)
        }
        if isComplete {
          self.closed = true
        }
        if let error {
          receiveError = error
          self.closed = true
        }
        self.lock.unlock()
        semaphore?.signal()
      }
    }

    if let semaphore {
      let waitResult = semaphore.wait(timeout: .now() + 30)
      lock.lock()
      let isClosed = closed && inbox.isEmpty
      let idleEmpty = inbox.isEmpty && !closed
      let shouldThrowTimeout = throwOnIdleTimeout
      lock.unlock()
      if let receiveError { throw receiveError }
      if isClosed { throw TLSError.closed }
      if waitResult == .timedOut && shouldThrowTimeout && idleEmpty {
        throw TLSError.timedOut
      }
    }
  }

  fileprivate func takeInbox(maxLength: Int) -> (Data, Bool) {
    lock.lock()
    defer { lock.unlock() }
    if inbox.isEmpty {
      return (Data(), closed)
    }
    let chunk = inbox.prefix(maxLength)
    inbox.removeFirst(chunk.count)
    return (Data(chunk), false)
  }

  fileprivate func sendRaw(_ data: Data) -> OSStatus {
    let semaphore = DispatchSemaphore(value: 0)
    var sendStatus: OSStatus = noErr
    connection.send(content: data, completion: .contentProcessed { error in
      if error != nil {
        sendStatus = errSSLClosedAbort
      }
      semaphore.signal()
    })
    _ = semaphore.wait(timeout: .now() + 30)
    return sendStatus
  }

  // MARK: - SSL IO

  private static let sslRead: SSLReadFunc = { connection, data, dataLength in
    let bridge = Unmanaged<TLSBridge>.fromOpaque(connection).takeUnretainedValue()
    let wanted = dataLength.pointee
    let (chunk, isClosed) = bridge.takeInbox(maxLength: wanted)
    if chunk.isEmpty {
      dataLength.pointee = 0
      return isClosed ? errSSLClosedGraceful : errSSLWouldBlock
    }
    chunk.copyBytes(to: data.assumingMemoryBound(to: UInt8.self), count: chunk.count)
    dataLength.pointee = chunk.count
    return noErr
  }

  private static let sslWrite: SSLWriteFunc = { connection, data, dataLength in
    let bridge = Unmanaged<TLSBridge>.fromOpaque(connection).takeUnretainedValue()
    let length = dataLength.pointee
    let buffer = Data(bytes: data, count: length)
    let status = bridge.sendRaw(buffer)
    if status != noErr {
      dataLength.pointee = 0
      return status
    }
    return noErr
  }
}
