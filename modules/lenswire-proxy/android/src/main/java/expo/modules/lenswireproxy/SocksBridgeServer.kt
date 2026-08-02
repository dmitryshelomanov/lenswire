package expo.modules.lenswireproxy

import android.content.Context
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class SocksBridgeServer(
  private val localProxyPort: Int,
  private val listenPort: Int = 1080,
  private val protectSocket: ((Socket) -> Boolean)? = null,
  private val appContext: Context? = null,
) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var pool: ExecutorService? = null
  private val relayPool: ExecutorService = Executors.newCachedThreadPool()

  private fun protectIfNeeded(socket: Socket) {
    runCatching { protectSocket?.invoke(socket) }
  }

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
      when (val req = readRequest(input, output)) {
        null -> {
          client.close()
          return
        }
        is SocksRequest.UdpAssociate -> {
          handleUdpAssociate(client, output)
          return
        }
        is SocksRequest.Connect -> handleTcpConnect(client, input, output, req.target)
      }
    } catch (_: Exception) {
      runCatching { client.close() }
    }
  }

  private fun handleTcpConnect(
    client: Socket,
    input: BufferedInputStream,
    output: BufferedOutputStream,
    target: Target,
  ) {
    if (target.port == 80) {
      val proxySocket = Socket()
      protectIfNeeded(proxySocket)
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
    protectIfNeeded(proxySocket)
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
  }

  /**
   * SOCKS5 UDP ASSOCIATE — required so tun2socks/leaf can forward DNS (UDP/53)
   * and other UDP through a protected datagram socket on the underlying network.
   */
  private fun handleUdpAssociate(client: Socket, output: BufferedOutputStream) {
    // Local relay stays on loopback so leaf/tun2socks can reach it; only outbound
    // datagrams (below) are protect()+bound to the underlying network.
    val relay = DatagramSocket(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
    relay.soTimeout = 2_000
    val relayPort = relay.localPort
    val portHi = (relayPort ushr 8) and 0xff
    val portLo = relayPort and 0xff
    // BND.ADDR = 127.0.0.1, BND.PORT = relayPort
    output.write(
      byteArrayOf(
        0x05, 0x00, 0x00, 0x01,
        127, 0, 0, 1,
        portHi.toByte(), portLo.toByte(),
      ),
    )
    output.flush()
    Log.d(TAG, "UDP ASSOCIATE relay 127.0.0.1:$relayPort")

    // Keep the TCP control connection open; relay UDP until it closes or VPN stops.
    client.soTimeout = 0
    val done = AtomicBoolean(false)
    relayPool.execute {
      try {
        val buf = ByteArray(64 * 1024)
        while (running.get() && !done.get() && !client.isClosed) {
          val packet = DatagramPacket(buf, buf.size)
          try {
            relay.receive(packet)
          } catch (_: SocketTimeoutException) {
            continue
          }
          handleSocksUdpDatagram(relay, packet)
        }
      } catch (e: Exception) {
        Log.d(TAG, "UDP ASSOCIATE relay ended: ${e.message}")
      } finally {
        done.set(true)
        runCatching { relay.close() }
        runCatching { client.close() }
      }
    }
    try {
      // Block until control connection EOF.
      val sink = ByteArray(256)
      val input = client.getInputStream()
      while (running.get() && !done.get()) {
        val n = input.read(sink)
        if (n < 0) break
      }
    } catch (_: Exception) {
    } finally {
      done.set(true)
      runCatching { relay.close() }
      runCatching { client.close() }
    }
  }

  private fun handleSocksUdpDatagram(relay: DatagramSocket, packet: DatagramPacket) {
    val data = packet.data
    val len = packet.length
    val offset = packet.offset
    if (len < 4) return
    // RSV RSV FRAG ATYP ...
    val frag = data[offset + 2].toInt() and 0xff
    if (frag != 0) return // fragmentation not supported
    val atyp = data[offset + 3].toInt() and 0xff
    var idx = offset + 4
    val destHost: String
    val destAddr: InetAddress
    when (atyp) {
      0x01 -> {
        if (idx + 4 > offset + len) return
        val bytes = data.copyOfRange(idx, idx + 4)
        idx += 4
        destAddr = InetAddress.getByAddress(bytes)
        destHost = destAddr.hostAddress ?: return
      }
      0x03 -> {
        if (idx >= offset + len) return
        val hostLen = data[idx].toInt() and 0xff
        idx += 1
        if (idx + hostLen > offset + len) return
        destHost = String(data, idx, hostLen, Charsets.US_ASCII)
        idx += hostLen
        destAddr = UnderlyingNetwork.resolve(destHost)
      }
      0x04 -> {
        if (idx + 16 > offset + len) return
        val bytes = data.copyOfRange(idx, idx + 16)
        idx += 16
        destAddr = InetAddress.getByAddress(bytes)
        destHost = destAddr.hostAddress ?: return
      }
      else -> return
    }
    if (idx + 2 > offset + len) return
    val destPort = ((data[idx].toInt() and 0xff) shl 8) or (data[idx + 1].toInt() and 0xff)
    idx += 2
    if (destPort == 443) {
      QuicUdpBlock.recordDrop(appContext, destHost)
      Log.d(TAG, "UDP/443 blocked (QUIC) host=$destHost")
      return
    }
    val payloadLen = offset + len - idx
    if (payloadLen < 0) return
    val payload = data.copyOfRange(idx, idx + payloadLen)

    val outbound = DatagramSocket()
    try {
      UnderlyingNetwork.prepareDatagramSocket(outbound)
      outbound.soTimeout = 5_000
      val outPacket = DatagramPacket(payload, payload.size, destAddr, destPort)
      outbound.send(outPacket)
      val respBuf = ByteArray(64 * 1024)
      val respPacket = DatagramPacket(respBuf, respBuf.size)
      outbound.receive(respPacket)

      // Wrap response in SOCKS UDP header; echo original header ATYP/addr/port.
      val headerLen = idx - offset
      val header = data.copyOfRange(offset, idx)
      // Zero RSV + FRAG
      header[0] = 0
      header[1] = 0
      header[2] = 0
      val response = ByteArray(headerLen + respPacket.length)
      System.arraycopy(header, 0, response, 0, headerLen)
      System.arraycopy(respPacket.data, respPacket.offset, response, headerLen, respPacket.length)
      val reply = DatagramPacket(response, response.size, packet.socketAddress)
      relay.send(reply)
      if (destPort == 53) {
        Log.d(TAG, "UDP DNS forwarded host=$destHost bytes=${payload.size}->${respPacket.length}")
      }
    } catch (e: Exception) {
      Log.w(TAG, "UDP forward failed $destHost:$destPort: ${e.message}")
    } finally {
      runCatching { outbound.close() }
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

  private sealed class SocksRequest {
    data class Connect(val target: Target) : SocksRequest()
    data object UdpAssociate : SocksRequest()
  }

  private fun readRequest(
    input: BufferedInputStream,
    output: BufferedOutputStream,
  ): SocksRequest? {
    val ver = input.read()
    val cmd = input.read()
    input.read() // RSV
    val atyp = input.read()
    if (ver != 0x05) {
      output.write(byteArrayOf(0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
      output.flush()
      return null
    }

    // Consume address + port for both CONNECT and UDP ASSOCIATE.
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
      else -> {
        output.write(byteArrayOf(0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
        output.flush()
        return null
      }
    }

    val portHi = input.read()
    val portLo = input.read()
    if (portHi < 0 || portLo < 0) return null
    val port = (portHi shl 8) or portLo

    return when (cmd) {
      0x01 -> SocksRequest.Connect(Target(host, port))
      0x03 -> {
        Log.d(TAG, "UDP ASSOCIATE request from client (dst=$host:$port)")
        SocksRequest.UdpAssociate
      }
      else -> {
        // Command not supported (e.g. BIND).
        output.write(byteArrayOf(0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0))
        output.flush()
        null
      }
    }
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

  companion object {
    private const val TAG = "LenswireSocks"
  }
}
