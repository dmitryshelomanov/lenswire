package expo.modules.lenswireproxy

import android.content.Context
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.Proxy
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.net.URL
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class LocalProxyServer(private val context: Context) {
  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptPool: ExecutorService? = null

  fun start(port: Int = CaptureStore.PROXY_PORT) {
    if (!running.compareAndSet(false, true)) return
    val pool = Executors.newCachedThreadPool()
    acceptPool = pool
    try {
      serverSocket = ServerSocket(port, 50, InetAddress.getByName("0.0.0.0"))
    } catch (e: Exception) {
      running.set(false)
      acceptPool = null
      pool.shutdownNow()
      throw e
    }
    pool.execute {
      val server = serverSocket ?: return@execute
      while (running.get()) {
        try {
          val client = server.accept()
          pool.execute { handleClient(client) }
        } catch (_: Exception) {
          if (!running.get()) break
        }
      }
    }
  }

  fun stop() {
    running.set(false)
    try {
      serverSocket?.close()
    } catch (_: Exception) {
    }
    serverSocket = null
    acceptPool?.shutdownNow()
    acceptPool = null
  }

  private fun handleClient(client: Socket) {
    try {
      client.soTimeout = 20_000
      val reader = BufferedReader(InputStreamReader(client.getInputStream(), Charsets.ISO_8859_1))
      val requestLine = reader.readLine() ?: run {
        client.close()
        return
      }
      val parts = requestLine.split(" ")
      if (parts.size < 2) {
        client.close()
        return
      }
      val method = parts[0]
      val target = parts[1]
      val headers = LinkedHashMap<String, String>()
      while (true) {
        val line = reader.readLine() ?: break
        if (line.isEmpty()) break
        val idx = line.indexOf(':')
        if (idx > 0) {
          headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
        }
      }

      val id = UUID.randomUUID().toString()
      val startedAt = System.currentTimeMillis()
      var host = "unknown"
      var path = "/"
      var scheme = "http"
      var query = ""
      var status = 0

      if (method == "CONNECT") {
        val hostPort = target.split(":")
        host = hostPort.firstOrNull() ?: "unknown"
        scheme = "https"
        path = "/"
        status = 200
        CaptureStore.append(
          context,
          mapOf(
            "id" to id,
            "startedAt" to startedAt,
            "method" to method,
            "scheme" to scheme,
            "host" to host,
            "path" to path,
            "query" to query,
            "status" to status,
          ),
        )
        val out = OutputStreamWriter(client.getOutputStream(), Charsets.ISO_8859_1)
        out.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        out.flush()
        client.close()
        return
      }

      val upstreamUrl = when {
        target.startsWith("http://") || target.startsWith("https://") -> {
          val uri = URI(target)
          host = uri.host ?: headers["Host"]?.substringBefore(':') ?: "unknown"
          path = uri.path.ifEmpty { "/" }
          scheme = uri.scheme ?: "http"
          query = uri.query ?: ""
          URL(target)
        }
        else -> {
          path = target.substringBefore('?').ifEmpty { "/" }
          query = target.substringAfter('?', missingDelimiterValue = "")
          host = headers["Host"]?.substringBefore(':') ?: "unknown"
          scheme = "http"
          URL("http://$host$path" + if (query.isNotEmpty()) "?$query" else "")
        }
      }

      status = forwardHttp(method, upstreamUrl, headers, client)
      CaptureStore.append(
        context,
        mapOf(
          "id" to id,
          "startedAt" to startedAt,
          "method" to method,
          "scheme" to scheme,
          "host" to host,
          "path" to path,
          "query" to query,
          "status" to status,
        ),
      )
    } catch (_: Exception) {
      try {
        client.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun forwardHttp(
    method: String,
    url: URL,
    headers: Map<String, String>,
    client: Socket,
  ): Int {
    return try {
      // Bypass system/emulator HTTP proxy so upstream does not loop back into us.
      val conn = (url.openConnection(Proxy.NO_PROXY) as HttpURLConnection).apply {
        requestMethod = method
        instanceFollowRedirects = false
        connectTimeout = 15_000
        readTimeout = 20_000
        doInput = true
        headers.forEach { (k, v) ->
          if (
            !k.equals("Proxy-Connection", true) &&
            !k.equals("Connection", true) &&
            !k.equals("Content-Length", true) &&
            !k.equals("Transfer-Encoding", true)
          ) {
            setRequestProperty(k, v)
          }
        }
      }
      val code = conn.responseCode
      val bodyStream = try {
        conn.inputStream
      } catch (_: Exception) {
        conn.errorStream
      }
      val body = bodyStream?.readBytes() ?: ByteArray(0)
      val out = client.getOutputStream()
      val headerBuf = StringBuilder()
      headerBuf.append("HTTP/1.1 ").append(code).append(' ')
        .append(conn.responseMessage ?: "").append("\r\n")
      conn.headerFields.forEach { (key, values) ->
        if (key == null) return@forEach
        if (key.equals("Transfer-Encoding", true)) return@forEach
        if (key.equals("Content-Length", true)) return@forEach
        values.forEach { value ->
          headerBuf.append(key).append(": ").append(value).append("\r\n")
        }
      }
      headerBuf.append("Content-Length: ").append(body.size).append("\r\n")
      headerBuf.append("Connection: close\r\n\r\n")
      out.write(headerBuf.toString().toByteArray(Charsets.ISO_8859_1))
      out.write(body)
      out.flush()
      client.close()
      code
    } catch (_: Exception) {
      val body = "Lenswire upstream error\r\n".toByteArray()
      val payload =
        "HTTP/1.1 502 Bad Gateway\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
      try {
        val out = client.getOutputStream()
        out.write(payload.toByteArray(Charsets.ISO_8859_1))
        out.write(body)
        out.flush()
        client.close()
      } catch (_: Exception) {
      }
      502
    }
  }
}
