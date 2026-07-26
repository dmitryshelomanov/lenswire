package expo.modules.lenswireproxy

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL

object VpnController {
  private const val START_TIMEOUT_MS = 8_000L
  private const val START_POLL_MS = 50L

  fun prepareIntent(context: Context): Intent? = VpnService.prepare(context)

  fun start(context: Context) {
    val intent = Intent(context, LenswireVpnService::class.java).apply {
      action = LenswireVpnService.ACTION_START
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  fun stop(context: Context) {
    val intent = Intent(context, LenswireVpnService::class.java).apply {
      action = LenswireVpnService.ACTION_STOP
    }
    context.startService(intent)
  }

  fun status(): String = ProxyRuntime.status

  fun awaitListening(timeoutMs: Long = START_TIMEOUT_MS) {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (ProxyRuntime.status == "listening") return
      if (ProxyRuntime.status == "error") {
        throw IllegalStateException(ProxyRuntime.lastError ?: "VPN failed to start")
      }
      Thread.sleep(START_POLL_MS)
    }
    throw IllegalStateException("Timed out waiting for VPN / local proxy to start")
  }

  fun sendProbe(context: Context) {
    if (ProxyRuntime.status != "listening") {
      throw IllegalStateException("Start capture before sending a test request.")
    }
    val proxy = Proxy(Proxy.Type.HTTP, InetSocketAddress("127.0.0.1", CaptureStore.PROXY_PORT))
    val url = URL("http://example.com/")
    val conn = (url.openConnection(proxy) as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 20_000
      requestMethod = "GET"
      instanceFollowRedirects = true
    }
    try {
      conn.responseCode
      conn.inputStream?.close()
    } finally {
      conn.disconnect()
    }
  }

  fun openInstallCertificate(activity: Activity?): Boolean {
    val ctx = activity ?: return false
    val intent = CertificateManager.installIntent(ctx) ?: return false
    ctx.startActivity(intent)
    return true
  }
}
