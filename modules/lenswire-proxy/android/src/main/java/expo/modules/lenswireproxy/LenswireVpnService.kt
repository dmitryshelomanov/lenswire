package expo.modules.lenswireproxy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.net.DatagramSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VpnService: establishes a VPN session and routes traffic through
 * TUN → tun2socks → SOCKS bridge → LocalProxyServer (MITM).
 */
class LenswireVpnService : VpnService() {
  companion object {
    const val ACTION_START = "expo.modules.lenswireproxy.START"
    const val ACTION_STOP = "expo.modules.lenswireproxy.STOP"
    const val CHANNEL_ID = "lenswire_vpn"
    const val NOTIFICATION_ID = 42
    private const val IPV6_ROUTE_ENABLED_KEY = "vpnIpv6RouteEnabled"

    private var serviceInstance: LenswireVpnService? = null

    fun protectSocket(socket: Socket): Boolean =
      serviceInstance?.runCatching { protect(socket) }?.getOrDefault(false) == true

    fun protectDatagram(socket: DatagramSocket): Boolean =
      serviceInstance?.runCatching { protect(socket) }?.getOrDefault(false) == true

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var proxyServer: LocalProxyServer? = null
      private set

    @Volatile
    var socksBridgeServer: SocksBridgeServer? = null
      private set
  }

  private var tunInterface: ParcelFileDescriptor? = null
  private var tun2Socks: Tun2SocksRuntime? = null
  private val started = AtomicBoolean(false)

  override fun onCreate() {
    super.onCreate()
    serviceInstance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCapture()
        stopSelf()
        return START_NOT_STICKY
      }
      else -> startCapture()
    }
    return START_STICKY
  }

  private fun startCapture() {
    if (!started.compareAndSet(false, true)) return

    ProxyRuntime.lastError = null
    ProxyRuntime.status = "connecting"

    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification())

    val builder = Builder()
      .setSession("Lenswire")
      .setMtu(1500)
      .addAddress("10.8.0.2", 32)
      .addRoute("0.0.0.0", 0)
      .addDnsServer("1.1.1.1")
      .addDnsServer("8.8.8.8")
    val includeIpv6Route = shouldIncludeIpv6Route()
    if (includeIpv6Route && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      builder.addRoute("::", 0)
    }
    try {
      builder.addDisallowedApplication(packageName)
    } catch (_: PackageManager.NameNotFoundException) {
    }

    try {
      tunInterface = builder.establish()
      if (tunInterface == null) {
        failStart("VPN interface could not be established")
        return
      }

      UnderlyingNetwork.configure(
        context = applicationContext,
        protectSocket = ::protectSocket,
        protectDatagram = ::protectDatagram,
      )

      val proxy = LocalProxyServer(applicationContext, ::protectSocket)
      proxy.start(CaptureStore.PROXY_PORT)
      proxyServer = proxy

      val socks = SocksBridgeServer(
        localProxyPort = CaptureStore.PROXY_PORT,
        listenPort = 1080,
        protectSocket = ::protectSocket,
        appContext = applicationContext,
      )
      socks.start()
      socksBridgeServer = socks

      QuicUdpBlock.reset()

      val tunFd = tunInterface?.fd ?: throw IllegalStateException("TUN fd unavailable")
      val engine = Tun2SocksRuntime(
        tunFd = tunFd,
        socksPort = 1080,
        mtu = 1500,
      )
      engine.start()
      tun2Socks = engine

      isRunning = true
      ProxyRuntime.status = "listening"
      ProxyRuntime.lastError = null
      ProxyRuntime.diagnostics = mapOf(
        "mode" to "full_tun",
        "tunFd" to tunFd,
        "proxyPort" to CaptureStore.PROXY_PORT,
        "socksPort" to 1080,
        "routes" to if (includeIpv6Route) listOf("0.0.0.0/0", "::/0") else listOf("0.0.0.0/0"),
        "ipv6RouteEnabled" to includeIpv6Route,
        "dns" to listOf("1.1.1.1", "8.8.8.8"),
        "underlyingNetwork" to (UnderlyingNetwork.underlyingOrNull()?.toString()),
        "httpsDecrypt" to applicationContext
          .getSharedPreferences("lenswire_settings", MODE_PRIVATE)
          .getBoolean("httpsDecrypt", true),
        "caReady" to (CertificateManager.loadCa(applicationContext) != null),
        "quicUdpBlocked" to true,
        "quicDecrypt" to false,
        "quicDrops" to QuicUdpBlock.dropCount(),
        "udpAssociate" to true,
        "capabilities" to mapOf(
          "httpCapture" to true,
          "httpsMitmNonPinned" to true,
          "pinnedTrafficDecrypt" to false,
          "nonHttpPortsVisible" to true,
          "tcpOnlySocks" to false,
          "quicDecrypt" to false,
          "quicUdpBlocked" to true,
        ),
      )
    } catch (e: Exception) {
      failStart(e.message ?: "Failed to start local proxy")
    }
  }

  private fun failStart(message: String) {
    ProxyRuntime.lastError = message
    ProxyRuntime.status = "error"
    isRunning = false
    try {
      proxyServer?.stop()
    } catch (_: Exception) {
    }
    proxyServer = null
    try {
      socksBridgeServer?.stop()
    } catch (_: Exception) {
    }
    socksBridgeServer = null
    try {
      tun2Socks?.stop()
    } catch (_: Exception) {
    }
    tun2Socks = null
    try {
      tunInterface?.close()
    } catch (_: Exception) {
    }
    tunInterface = null
    UnderlyingNetwork.clear()
    started.set(false)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun stopCapture() {
    isRunning = false
    ProxyRuntime.status = "stopped"
    ProxyRuntime.lastError = null
    try {
      proxyServer?.stop()
    } catch (_: Exception) {
    }
    proxyServer = null
    try {
      socksBridgeServer?.stop()
    } catch (_: Exception) {
    }
    socksBridgeServer = null
    try {
      tun2Socks?.stop()
    } catch (_: Exception) {
    }
    tun2Socks = null
    try {
      tunInterface?.close()
    } catch (_: Exception) {
    }
    tunInterface = null
    UnderlyingNetwork.clear()
    started.set(false)
    ProxyRuntime.diagnostics = mapOf(
      "mode" to "stopped",
      "proxyPort" to CaptureStore.PROXY_PORT,
      "socksPort" to 1080,
    )
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  override fun onDestroy() {
    serviceInstance = null
    stopCapture()
    super.onDestroy()
  }

  private fun shouldIncludeIpv6Route(): Boolean =
    applicationContext
      .getSharedPreferences("lenswire_settings", MODE_PRIVATE)
      .getBoolean(IPV6_ROUTE_ENABLED_KEY, false)

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Lenswire Capture",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "HTTP(S) inspection proxy is running"
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Lenswire")
      .setContentText("Local proxy listening on :${CaptureStore.PROXY_PORT}")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setContentIntent(pending)
      .setOngoing(true)
      .build()
  }
}

object ProxyRuntime {
  @Volatile
  var status: String = "stopped"

  @Volatile
  var lastError: String? = null

  @Volatile
  var diagnostics: Map<String, Any?> = mapOf(
    "mode" to "stopped",
    "proxyPort" to CaptureStore.PROXY_PORT,
    "socksPort" to 1080,
  )
}
