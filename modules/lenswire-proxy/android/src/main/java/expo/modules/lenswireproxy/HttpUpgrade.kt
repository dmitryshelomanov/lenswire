package expo.modules.lenswireproxy

/**
 * Detects HTTP Upgrade to WebSocket from request headers.
 * Lenswire does not terminate WebSocket frames; callers should relay (pipe) without host bypass.
 */
internal object HttpUpgrade {
  fun isWebSocketUpgrade(headers: Map<String, String>): Boolean {
    val upgrade = headers.entries
      .firstOrNull { it.key.equals("Upgrade", ignoreCase = true) }
      ?.value
      ?: return false
    return upgrade.contains("websocket", ignoreCase = true)
  }
}
