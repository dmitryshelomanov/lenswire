package expo.modules.lenswireproxy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.util.concurrent.atomic.AtomicBoolean

/**
 * MVP VpnService: establishes a VPN session (system toggle) without routing all traffic
 * through TUN (no addRoute). LocalProxyServer handles captures / probe / emulator http-proxy.
 * Full tun2socks capture is a follow-up.
 */
class LenswireVpnService : VpnService() {
  companion object {
    const val ACTION_START = "expo.modules.lenswireproxy.START"
    const val ACTION_STOP = "expo.modules.lenswireproxy.STOP"
    const val CHANNEL_ID = "lenswire_vpn"
    const val NOTIFICATION_ID = 42

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var proxyServer: LocalProxyServer? = null
      private set
  }

  private var tunInterface: ParcelFileDescriptor? = null
  private val started = AtomicBoolean(false)

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
    // Intentionally no addRoute(): keep device connectivity; proxy is in-process.

    try {
      tunInterface = builder.establish()
      if (tunInterface == null) {
        failStart("VPN interface could not be established")
        return
      }

      val proxy = LocalProxyServer(applicationContext)
      proxy.start(CaptureStore.PROXY_PORT)
      proxyServer = proxy
      isRunning = true
      ProxyRuntime.status = "listening"
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
      tunInterface?.close()
    } catch (_: Exception) {
    }
    tunInterface = null
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
      tunInterface?.close()
    } catch (_: Exception) {
    }
    tunInterface = null
    started.set(false)
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

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
}
