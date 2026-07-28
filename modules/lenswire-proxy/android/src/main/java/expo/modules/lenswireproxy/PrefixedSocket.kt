package expo.modules.lenswireproxy

import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.Socket
import java.net.SocketAddress
import java.nio.channels.SocketChannel

/**
 * Connected socket facade that replays [prefix] bytes before the underlying input stream.
 * Used so SSLSocket can handshake after an SNI peek consumed the ClientHello.
 */
class PrefixedSocket(
  private val inner: Socket,
  prefix: ByteArray,
) : Socket() {
  private val input = PrefixInputStream(prefix, inner.getInputStream())

  override fun getInputStream(): InputStream = input
  override fun getOutputStream(): OutputStream = inner.getOutputStream()

  override fun connect(endpoint: SocketAddress?) = throw UnsupportedOperationException()
  override fun connect(endpoint: SocketAddress?, timeout: Int) = throw UnsupportedOperationException()
  override fun bind(bindpoint: SocketAddress?) = throw UnsupportedOperationException()

  override fun isConnected(): Boolean = inner.isConnected
  override fun isBound(): Boolean = inner.isBound
  override fun isClosed(): Boolean = inner.isClosed
  override fun isInputShutdown(): Boolean = inner.isInputShutdown
  override fun isOutputShutdown(): Boolean = inner.isOutputShutdown

  override fun getInetAddress(): InetAddress? = inner.inetAddress
  override fun getLocalAddress(): InetAddress = inner.localAddress
  override fun getPort(): Int = inner.port
  override fun getLocalPort(): Int = inner.localPort
  override fun getRemoteSocketAddress(): SocketAddress? = inner.remoteSocketAddress
  override fun getLocalSocketAddress(): SocketAddress? = inner.localSocketAddress

  override fun setTcpNoDelay(on: Boolean) = inner.setTcpNoDelay(on)
  override fun getTcpNoDelay(): Boolean = inner.tcpNoDelay
  override fun setSoLinger(on: Boolean, linger: Int) = inner.setSoLinger(on, linger)
  override fun getSoLinger(): Int = inner.soLinger
  override fun setSoTimeout(timeout: Int) {
    inner.soTimeout = timeout
  }
  override fun getSoTimeout(): Int = inner.soTimeout
  override fun setSendBufferSize(size: Int) = inner.setSendBufferSize(size)
  override fun getSendBufferSize(): Int = inner.sendBufferSize
  override fun setReceiveBufferSize(size: Int) = inner.setReceiveBufferSize(size)
  override fun getReceiveBufferSize(): Int = inner.receiveBufferSize
  override fun setKeepAlive(on: Boolean) = inner.setKeepAlive(on)
  override fun getKeepAlive(): Boolean = inner.keepAlive
  override fun setTrafficClass(tc: Int) = inner.setTrafficClass(tc)
  override fun getTrafficClass(): Int = inner.trafficClass
  override fun setReuseAddress(on: Boolean) = inner.setReuseAddress(on)
  override fun getReuseAddress(): Boolean = inner.reuseAddress
  override fun setOOBInline(on: Boolean) = inner.setOOBInline(on)
  override fun getOOBInline(): Boolean = inner.oobInline
  override fun sendUrgentData(data: Int) = inner.sendUrgentData(data)
  override fun shutdownInput() = inner.shutdownInput()
  override fun shutdownOutput() = inner.shutdownOutput()
  override fun close() = inner.close()
  override fun getChannel(): SocketChannel? = inner.channel

  private class PrefixInputStream(
    private val prefix: ByteArray,
    private val rest: InputStream,
  ) : InputStream() {
    private var index = 0

    override fun read(): Int {
      if (index < prefix.size) {
        return prefix[index++].toInt() and 0xff
      }
      return rest.read()
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
      if (len <= 0) return 0
      if (index < prefix.size) {
        val n = minOf(len, prefix.size - index)
        System.arraycopy(prefix, index, b, off, n)
        index += n
        return n
      }
      return rest.read(b, off, len)
    }

    override fun available(): Int {
      val pending = prefix.size - index
      return pending + rest.available()
    }

    override fun close() = rest.close()
  }
}
