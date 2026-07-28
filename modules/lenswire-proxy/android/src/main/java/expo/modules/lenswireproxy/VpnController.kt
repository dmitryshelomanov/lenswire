package expo.modules.lenswireproxy

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import java.nio.charset.StandardCharsets
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL

object VpnController {
  private const val START_TIMEOUT_MS = 8_000L
  private const val START_POLL_MS = 50L
  private const val DEFAULT_PROBE_TYPE = "http_get"
  private const val DEFAULT_SCHEME = "http"

  private data class ProbeRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: ByteArray? = null,
  )

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

  fun sendProbe(context: Context, probeType: String?, useHttps: Boolean?) {
    if (ProxyRuntime.status != "listening") {
      throw IllegalStateException("Start capture before sending a test request.")
    }

    val probe = buildProbeRequest(probeType, useHttps)
    val proxy = Proxy(Proxy.Type.HTTP, InetSocketAddress("127.0.0.1", CaptureStore.PROXY_PORT))
    val conn = (URL(probe.url).openConnection(proxy) as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 20_000
      requestMethod = probe.method
      instanceFollowRedirects = true
      probe.headers.forEach { (k, v) -> setRequestProperty(k, v) }
      if (probe.body != null) {
        doOutput = true
        // Force Content-Length so LocalProxyServer can read the body (no chunked).
        setFixedLengthStreamingMode(probe.body.size)
        setRequestProperty("Content-Length", probe.body.size.toString())
      }
    }
    try {
      probe.body?.let { body ->
        conn.outputStream.use { stream -> stream.write(body) }
      }
      conn.responseCode
      try {
        conn.inputStream?.close()
      } catch (_: Exception) {
        conn.errorStream?.close()
      }
    } finally {
      conn.disconnect()
    }
  }

  private fun buildProbeRequest(probeType: String?, useHttps: Boolean?): ProbeRequest {
    val selectedType = probeType?.trim()?.lowercase() ?: DEFAULT_PROBE_TYPE
    val scheme = when {
      selectedType == "https_get" -> "https"
      useHttps == true -> "https"
      else -> DEFAULT_SCHEME
    }
    return when (selectedType) {
      "http_get" -> ProbeRequest(
        method = "GET",
        url = "$scheme://httpbin.org/get?probe=http_get",
      )
      "https_get" -> ProbeRequest(
        method = "GET",
        url = "https://httpbin.org/get?probe=https_get",
      )
      "post_json" -> ProbeRequest(
        method = "POST",
        url = "$scheme://httpbin.org/post",
        headers = mapOf(
          "Content-Type" to "application/json; charset=utf-8",
        ),
        body = """
          {
            "probe":"post_json",
            "client":"lenswire",
            "platform":"android",
            "features":["pretty-json","payload-render"]
          }
        """.trimIndent().toByteArray(StandardCharsets.UTF_8),
      )
      "post_form_urlencoded" -> ProbeRequest(
        method = "POST",
        url = "$scheme://httpbin.org/post",
        headers = mapOf(
          "Content-Type" to "application/x-www-form-urlencoded; charset=utf-8",
        ),
        body = "probe=post_form_urlencoded&client=lenswire&platform=android"
          .toByteArray(StandardCharsets.UTF_8),
      )
      "post_multipart" -> {
        val boundary = "----LenswireProbeBoundary${System.currentTimeMillis()}"
        ProbeRequest(
          method = "POST",
          url = "$scheme://httpbin.org/post",
          headers = mapOf("Content-Type" to "multipart/form-data; boundary=$boundary"),
          body = buildMultipartBody(boundary),
        )
      }
      "get_image" -> ProbeRequest(
        method = "GET",
        url = "$scheme://httpbin.org/image/png",
      )
      else -> ProbeRequest(
        method = "GET",
        url = "$scheme://httpbin.org/get?probe=http_get",
      )
    }
  }

  private fun buildMultipartBody(boundary: String): ByteArray {
    val payload = buildString {
      append("--").append(boundary).append("\r\n")
      append("Content-Disposition: form-data; name=\"probe\"\r\n\r\n")
      append("post_multipart\r\n")
      append("--").append(boundary).append("\r\n")
      append("Content-Disposition: form-data; name=\"platform\"\r\n\r\n")
      append("android\r\n")
      append("--").append(boundary).append("\r\n")
      append("Content-Disposition: form-data; name=\"file\"; filename=\"probe.txt\"\r\n")
      append("Content-Type: text/plain\r\n\r\n")
      append("Lenswire multipart probe body\n")
      append("--").append(boundary).append("--\r\n")
    }
    return payload.toByteArray(StandardCharsets.UTF_8)
  }

  fun openInstallCertificate(activity: Activity?): Boolean {
    val ctx = activity ?: return false
    val intent = CertificateManager.installIntent(ctx) ?: return false
    ctx.startActivity(intent)
    return true
  }
}
