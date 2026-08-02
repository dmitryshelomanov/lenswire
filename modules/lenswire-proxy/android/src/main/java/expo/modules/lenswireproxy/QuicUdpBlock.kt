package expo.modules.lenswireproxy

import android.content.Context
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** Tracks UDP/443 (QUIC) drops so diagnostics/UI can show an explicit signal. */
object QuicUdpBlock {
  private val drops = AtomicLong(0)
  private val loggedHosts = ConcurrentHashMap.newKeySet<String>()

  fun reset() {
    drops.set(0)
    loggedHosts.clear()
  }

  fun dropCount(): Long = drops.get()

  fun recordDrop(context: Context?, host: String) {
    drops.incrementAndGet()
    val key = host.lowercase().ifBlank { "unknown" }
    if (context == null) return
    if (!loggedHosts.add(key)) return
    CaptureStore.append(
      context,
      mapOf(
        "id" to UUID.randomUUID().toString(),
        "startedAt" to System.currentTimeMillis(),
        "method" to "CONNECT",
        "scheme" to "https",
        "host" to key,
        "path" to "/",
        "query" to "",
        "status" to 0,
        "requestHeaders" to emptyMap<String, String>(),
        "responseHeaders" to emptyMap<String, String>(),
        "requestBody" to mapOf("kind" to "empty", "size" to 0),
        "responseBody" to mapOf("kind" to "empty", "size" to 0),
        "timing" to mapOf(
          "dnsMs" to 0,
          "connectMs" to 0,
          "tlsMs" to 0,
          "ttfbMs" to 0,
          "downloadMs" to 0,
          "totalMs" to 1,
        ),
        "reasonCode" to "quic_udp_blocked",
        "hostnameSource" to "udp",
        "hostnameConfidence" to "medium",
        "rawTarget" to "$key:443/udp",
        "connectTarget" to "$key:443",
        "connectHost" to key,
        "connectPort" to 443,
        "effectiveHost" to key,
        "captureMode" to "tunnel",
        "httpPayloadAvailable" to false,
        "captureSummary" to
          "UDP/443 (QUIC) blocked — browser should fall back to TCP. QUIC payload is not captured.",
      ),
    )
  }
}
