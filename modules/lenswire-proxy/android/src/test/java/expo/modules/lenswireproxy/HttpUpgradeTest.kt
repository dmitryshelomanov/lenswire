package expo.modules.lenswireproxy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpUpgradeTest {
  @Test
  fun upgradeWebsocketAlone() {
    assertTrue(HttpUpgrade.isWebSocketUpgrade(mapOf("Upgrade" to "websocket")))
  }

  @Test
  fun connectionUpgradeAndWebsocket() {
    assertTrue(
      HttpUpgrade.isWebSocketUpgrade(
        mapOf(
          "Connection" to "Upgrade",
          "Upgrade" to "websocket",
        ),
      ),
    )
  }

  @Test
  fun caseInsensitive() {
    assertTrue(HttpUpgrade.isWebSocketUpgrade(mapOf("upgrade" to "WebSocket")))
  }

  @Test
  fun missingUpgrade() {
    assertFalse(HttpUpgrade.isWebSocketUpgrade(mapOf("Connection" to "Upgrade")))
  }

  @Test
  fun otherUpgradeProtocol() {
    assertFalse(
      HttpUpgrade.isWebSocketUpgrade(
        mapOf(
          "Connection" to "Upgrade",
          "Upgrade" to "h2c",
        ),
      ),
    )
  }
}
