package expo.modules.lenswireproxy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MitmAlpnTest {
  @Test
  fun emptyOrNullAllowsMitm() {
    assertTrue(MitmAlpn.allowsHttp11Mitm(null))
    assertTrue(MitmAlpn.allowsHttp11Mitm(emptyList()))
  }

  @Test
  fun http11AloneAllowsMitm() {
    assertTrue(MitmAlpn.allowsHttp11Mitm(listOf("http/1.1")))
  }

  @Test
  fun http10AllowsMitm() {
    assertTrue(MitmAlpn.allowsHttp11Mitm(listOf("http/1.0")))
  }

  @Test
  fun h2WithHttp11AllowsMitm() {
    assertTrue(MitmAlpn.allowsHttp11Mitm(listOf("h2", "http/1.1")))
  }

  @Test
  fun h2OnlySkipsMitm() {
    assertFalse(MitmAlpn.allowsHttp11Mitm(listOf("h2")))
  }

  @Test
  fun h3OnlySkipsMitm() {
    assertFalse(MitmAlpn.allowsHttp11Mitm(listOf("h3")))
  }

  @Test
  fun caseInsensitiveHttp11() {
    assertTrue(MitmAlpn.allowsHttp11Mitm(listOf("HTTP/1.1")))
  }
}
