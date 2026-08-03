package expo.modules.lenswireproxy

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.UnknownHostException
import javax.net.SocketFactory

/**
 * Egress helper: dial / resolve / bind on the real Wi‑Fi/cellular network so VPN
 * upstream sockets never loop back into the TUN.
 */
object UnderlyingNetwork {
  private const val TAG = "LenswireUpstream"

  @Volatile
  private var appContext: Context? = null

  @Volatile
  private var protectSocket: ((Socket) -> Boolean)? = null

  @Volatile
  private var protectDatagram: ((DatagramSocket) -> Boolean)? = null

  fun configure(
    context: Context,
    protectSocket: ((Socket) -> Boolean)?,
    protectDatagram: ((DatagramSocket) -> Boolean)? = null,
    replaceDatagramProtect: Boolean = protectDatagram != null,
  ) {
    appContext = context.applicationContext
    this.protectSocket = protectSocket
    if (replaceDatagramProtect) {
      this.protectDatagram = protectDatagram
    }
  }

  fun clear() {
    appContext = null
    protectSocket = null
    protectDatagram = null
  }

  fun underlyingOrNull(): Network? {
    return try {
      val cm = connectivityManager() ?: return null
      val networks = cm.allNetworks
      for (network in networks) {
        val caps = cm.getNetworkCapabilities(network) ?: continue
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
        return network
      }
      // Fallback: active network if it is not VPN-only.
      val active = cm.activeNetwork ?: return null
      val caps = cm.getNetworkCapabilities(active) ?: return active
      if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
        !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
        !caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
        !caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
      ) {
        return null
      }
      active
    } catch (e: SecurityException) {
      Log.w(TAG, "ACCESS_NETWORK_STATE missing or denied: ${e.message}")
      null
    }
  }

  fun resolve(host: String): InetAddress {
    val trimmed = host.trim()
    if (trimmed.isEmpty()) throw UnknownHostException("empty host")
    val literal = trimmed.removePrefix("[").removeSuffix("]")
    if (looksLikeIpLiteral(trimmed)) {
      return InetAddress.getByName(literal)
    }
    val network = underlyingOrNull()
    if (network != null) {
      try {
        val addresses = network.getAllByName(literal)
        val chosen = addresses.firstOrNull() ?: throw UnknownHostException(literal)
        Log.d(TAG, "dns host=$literal -> ${chosen.hostAddress} via underlying network")
        return chosen
      } catch (e: Exception) {
        Log.w(TAG, "underlying dns failed host=$literal: ${e.message}; falling back to system dns")
      }
    } else {
      Log.w(TAG, "no underlying network; system dns for host=$literal")
    }
    return try {
      val chosen = InetAddress.getByName(literal)
      Log.d(TAG, "dns host=$literal -> ${chosen.hostAddress} via system dns")
      chosen
    } catch (e: Exception) {
      throw if (e is UnknownHostException) e else UnknownHostException("$literal (${e.message})")
    }
  }

  /**
   * Create, protect, bind to underlying network, resolve [host], connect.
   */
  fun connect(host: String, port: Int, timeoutMs: Int): Socket {
    val address = resolve(host)
    val socket = Socket()
    prepareTcpSocket(socket)
    val target = InetSocketAddress(address, port)
    Log.d(
      TAG,
      "connect host=$host resolved=${address.hostAddress}:$port protectBound timeoutMs=$timeoutMs",
    )
    socket.connect(target, timeoutMs)
    return socket
  }

  fun prepareTcpSocket(socket: Socket) {
    val protected = runCatching { protectSocket?.invoke(socket) }.getOrNull()
    if (protected == false) {
      Log.w(TAG, "protect(socket) returned false — risk of VPN routing loop")
    } else {
      Log.d(TAG, "protect(socket)=${protected ?: "skipped"}")
    }
    val network = underlyingOrNull()
    if (network != null) {
      try {
        network.bindSocket(socket)
        Log.d(TAG, "bindSocket ok network=$network")
      } catch (e: Exception) {
        Log.w(TAG, "bindSocket failed: ${e.message}")
      }
    } else {
      Log.w(TAG, "no underlying network for bindSocket")
    }
  }

  fun prepareDatagramSocket(socket: DatagramSocket) {
    val protected = runCatching { protectDatagram?.invoke(socket) }.getOrNull()
    if (protected == false) {
      Log.w(TAG, "protect(datagram) returned false")
    }
    val network = underlyingOrNull()
    if (network != null) {
      try {
        network.bindSocket(socket)
      } catch (e: Exception) {
        Log.w(TAG, "bindSocket(datagram) failed: ${e.message}")
      }
    }
  }

  fun socketFactory(): SocketFactory = object : SocketFactory() {
    override fun createSocket(): Socket {
      val socket = Socket()
      prepareTcpSocket(socket)
      return socket
    }

    override fun createSocket(host: String, port: Int): Socket = connect(host, port, 20_000)

    override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket {
      val socket = Socket()
      prepareTcpSocket(socket)
      socket.bind(InetSocketAddress(localHost, localPort))
      val address = resolve(host)
      socket.connect(InetSocketAddress(address, port), 20_000)
      return socket
    }

    override fun createSocket(address: InetAddress, port: Int): Socket {
      val socket = Socket()
      prepareTcpSocket(socket)
      socket.connect(InetSocketAddress(address, port), 20_000)
      return socket
    }

    override fun createSocket(
      address: InetAddress,
      port: Int,
      localAddress: InetAddress,
      localPort: Int,
    ): Socket {
      val socket = Socket()
      prepareTcpSocket(socket)
      socket.bind(InetSocketAddress(localAddress, localPort))
      socket.connect(InetSocketAddress(address, port), 20_000)
      return socket
    }
  }

  private fun connectivityManager(): ConnectivityManager? {
    val ctx = appContext ?: return null
    return ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
  }

  private fun looksLikeIpLiteral(host: String): Boolean {
    if (host.startsWith("[")) return true
    // IPv4
    if (host.matches(Regex("""^\d{1,3}(\.\d{1,3}){3}$"""))) return true
    // Rough IPv6
    if (host.contains(':') && host.all { it.isDigit() || it in "abcdefABCDEF:" }) return true
    return false
  }
}
