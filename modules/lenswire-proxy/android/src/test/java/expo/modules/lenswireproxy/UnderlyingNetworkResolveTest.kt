package expo.modules.lenswireproxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lightweight checks for IP-literal short-circuit in [UnderlyingNetwork.resolve]
 * (no Android ConnectivityManager required).
 */
class UnderlyingNetworkResolveTest {
  @Test
  fun resolve_ipv4Literal_noException() {
    val addr = UnderlyingNetwork.resolve("8.8.8.8")
    assertEquals("8.8.8.8", addr.hostAddress)
  }

  @Test
  fun resolve_ipv6Literal_bracketed() {
    val addr = UnderlyingNetwork.resolve("[::1]")
    assertTrue(addr.isLoopbackAddress)
  }
}
