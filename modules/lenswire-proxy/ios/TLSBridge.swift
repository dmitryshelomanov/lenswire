import Foundation
import Network
import Security

/// TLS server (or client) over an existing `NWConnection` using Secure Transport IO callbacks.
final class TLSBridge {
  enum Role {
    case server
    case client
  }

  enum TLSError: Error {
    case contextCreateFailed
    case handshakeFailed(OSStatus)
    case readFailed(OSStatus)
    case writeFailed(OSStatus)
    case closed
  }

  private let connection: NWConnection
  private let queue: DispatchQueue
  private var context: SSLContext
  private let lock = NSLock()
  private var inbox = Data()
  private var closed = false
  private var receiveInFlight = false

  init(
    connection: NWConnection,
    queue: DispatchQueue,
    role: Role,
    identity: SecIdentity?,
    preloadedData: Data = Data()
  ) throws {
    self.connection = connection
    self.queue = queue
    self.inbox = preloadedData

    let side: SSLProtocolSide = role == .server ? .serverSide : .clientSide
    guard let ctx = SSLCreateContext(kCFAllocatorDefault, side, .streamType) else {
      throw TLSError.contextCreateFailed
    }
    self.context = ctx

    SSLSetIOFuncs(ctx, TLSBridge.sslRead, TLSBridge.sslWrite)
    let unmanaged = Unmanaged.passUnretained(self).toOpaque()
    SSLSetConnection(ctx, unmanaged)

    if role == .server, let identity {
      let certs: [Any] = [identity]
      SSLSetCertificate(ctx, certs as CFArray)
    }

    // Prefer HTTP/1.1 so we can parse requests without HTTP/2 framing.
    if #available(iOS 11.0, *) {
      let protocols = ["http/1.1"] as CFArray
      SSLSetALPNProtocols(ctx, protocols)
    }
  }

  func handshake() throws {
    while true {
      let status = SSLHandshake(context)
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

  func read(maxLength: Int = 65536) throws -> Data {
    var buffer = [UInt8](repeating: 0, count: maxLength)
    while true {
      var processed = 0
      let status = SSLRead(context, &buffer, maxLength, &processed)
      if processed > 0 {
        return Data(buffer.prefix(processed))
      }
      if status == errSecSuccess {
        return Data()
      }
      if status == errSSLWouldBlock {
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
        return SSLWrite(context, base + total, bytes.count - total, &processed)
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
    SSLClose(context)
    connection.cancel()
  }

  // MARK: - NW receive → inbox

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
      _ = semaphore.wait(timeout: .now() + 30)
      lock.lock()
      let isClosed = closed && inbox.isEmpty
      lock.unlock()
      if let receiveError { throw receiveError }
      if isClosed { throw TLSError.closed }
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
