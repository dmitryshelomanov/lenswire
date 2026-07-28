package expo.modules.lenswireproxy

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class SocksBridgeServer(
  private val localProxyPort: Int,
  private val listenPort: Int = 1080,
) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var pool: ExecutorService? = null
  private val relayPool: ExecutorService = Executors.newCachedThreadPool()

  fun start() {
    if (!running.compareAndSet(false, true)) return
    val nextPool = Executors.newCachedThreadPool()
    pool = nextPool
    try {
      serverSocket = ServerSocket(listenPort, 50, InetAddress.getByName("127.0.0.1"))
    } catch (e: Exception) {
      running.set(false)
      nextPool.shutdownNow()
      pool = null
      throw e
    }

    nextPool.execute {
      val server = serverSocket ?: return@execute
      while (running.get()) {
        try {
          val client = server.accept()
          nextPool.execute { handleClient(client) }
        } catch (_: Exception) {
          if (!running.get()) break
        }
      }
    }
  }

  fun stop() {
    running.set(false)
    runCatching { serverSocket?.close() }
    serverSocket = null
    pool?.shutdownNow()
    pool = null
    relayPool.shutdownNow()
  }

  private fun handleClient(client: Socket) {
    client.soTimeout = 25_000
    val input = BufferedInputStream(client.getInputStream())
    val output = BufferedOutputStream(client.getOutputStream())
    try {
      if (!handshake(input, output)) {
        client.close()
        return
      }
      val target = readConnectRequest(input, output) ?: run {
        client.close()
        return
      }

      if (target.port == 80) {
        val proxySocket = Socket()
        proxySocket.connect(InetSocketAddress("127.0.0.1", localProxyPort), 10_000)
        proxySocket.soTimeout = 25_000
        // Plain HTTP origin-form requests can be forwarded directly.
        output.write(byteArrayOf(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
        output.flush()
        relayBidirectionalStreams(input, output, proxySocket)
        return
      }

      // HTTPS / other TCP: reply SOCKS OK first so the app sends ClientHello,
      // peek SNI, then CONNECT to local proxy with X-Lenswire-SNI.
      output.write(byteArrayOf(0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
      output.flush()

      client.soTimeout = 12_000
      val peek = try {
        TlsSni.peekClientHello(input)
      } catch (_: Exception) {
        TlsSni.PeekResult(ByteArray(0), null)
      }

      val proxySocket = Socket()
      proxySocket.connect(InetSocketAddress("127.0.0.1", localProxyPort), 10_000)
      proxySocket.soTimeout = 25_000

      val sni = peek.sniHostname?.trim().orEmpty()
      val sniHeader = if (sni.isNotEmpty()) "X-Lenswire-SNI: $sni\r\n" else ""
      val connectReq =
        "CONNECT ${target.host}:${target.port} HTTP/1.1\r\n" +
          "Host: ${target.host}:${target.port}\r\n" +
          sniHeader +
          "Connection: keep-alive\r\n\r\n"
      proxySocket.getOutputStream().write(connectReq.toByteArray(Charsets.ISO_8859_1))
      proxySocket.getOutputStream().flush()
      val status = readHttpStatusLine(proxySocket)
      if (!status.contains(" 200 ")) {
        proxySocket.close()
        client.close()
        return
      }
      if (peek.bytes.isNotEmpty()) {
        proxySocket.getOutputStream().write(peek.bytes)
        proxySocket.getOutputStream().flush()
      }
      relayBidirectionalStreams(input, output, proxySocket)
    } catch (_: Exception) {
      runCatching { client.close() }
    }
  }

  private fun handshake(input: BufferedInputStream, output: BufferedOutputStream): Boolean {
    val ver = input.read()
    if (ver != 0x05) return false
    val methodsCount = input.read()
    if (methodsCount <= 0) return false
    repeat(methodsCount) { input.read() }
    // No-auth method.
    output.write(byteArrayOf(0x05, 0x00))
    output.flush()
    return true
  }

  private data class Target(val host: String, val port: Int)

  private fun readConnectRequest(
    input: BufferedInputStream,
    output: BufferedOutputStream,
  ): Target? {
    val ver = input.read()
    val cmd = input.read()
    input.read() // RSV
    val atyp = input.read()
    // Only TCP CONNECT — UDP ASSOCIATE (QUIC) is rejected so clients fall back to TCP.
    if (ver != 0x05 || cmd != 0x01) {
      output.write(byteArrayOf(0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
      output.flush()
      return null
    }

    val host = when (atyp) {
      0x01 -> {
        val bytes = ByteArray(4)
        if (input.read(bytes) != 4) return null
        InetAddress.getByAddress(bytes).hostAddress ?: return null
      }
      0x03 -> {
        val len = input.read()
        if (len <= 0) return null
        val bytes = ByteArray(len)
        if (input.read(bytes) != len) return null
        String(bytes)
      }
      0x04 -> {
        val bytes = ByteArray(16)
        if (input.read(bytes) != 16) return null
        InetAddress.getByAddress(bytes).hostAddress ?: return null
      }
      else -> return null
    }

    val portHi = input.read()
    val portLo = input.read()
    if (portHi < 0 || portLo < 0) return null
    val port = (portHi shl 8) or portLo
    return Target(host, port)
  }

  private fun readHttpStatusLine(socket: Socket): String {
    val input = socket.getInputStream()
    val buf = ArrayList<Byte>(256)
    var prev = 0
    var curr: Int
    while (true) {
      curr = input.read()
      if (curr == -1) break
      buf.add(curr.toByte())
      if (prev == '\n'.code && curr == '\r'.code) {
        // keep going until header separator
      }
      val size = buf.size
      if (size >= 4 &&
        buf[size - 4] == '\r'.code.toByte() &&
        buf[size - 3] == '\n'.code.toByte() &&
        buf[size - 2] == '\r'.code.toByte() &&
        buf[size - 1] == '\n'.code.toByte()
      ) {
        break
      }
      prev = curr
      if (size > 16_384) break
    }
    val headerText = buf.toByteArray().toString(Charsets.ISO_8859_1)
    return headerText.substringBefore("\r\n")
  }

  private fun relayBidirectionalStreams(
    clientIn: InputStream,
    clientOut: OutputStream,
    proxy: Socket,
  ) {
    val proxyIn = proxy.getInputStream()
    val proxyOut = proxy.getOutputStream()
    val closeBoth = {
      runCatching { clientIn.close() }
      runCatching { clientOut.close() }
      runCatching { proxy.close() }
    }
    relayPool.execute {
      relayStreams(clientIn, proxyOut)
      closeBoth()
    }
    relayPool.execute {
      relayStreams(proxyIn, clientOut)
      closeBoth()
    }
  }

  private fun relayStreams(source: InputStream, sink: OutputStream) {
    try {
      val buf = ByteArray(32 * 1024)
      while (true) {
        val read = source.read(buf)
        if (read <= 0) break
        sink.write(buf, 0, read)
        sink.flush()
      }
    } catch (_: SocketException) {
      // Expected on half-close/teardown.
    } catch (_: IOException) {
      // Normal during connection shutdown.
    }
  }
}
