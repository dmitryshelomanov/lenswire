package expo.modules.lenswireproxy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

class HttpIoWriteResponseTest {
  @Test
  fun writeHttpResponse_defaultsToConnectionClose() {
    val out = ByteArrayOutputStream()
    HttpIo.writeHttpResponse(out, 200, mapOf("Content-Type" to "text/plain"), "ok".toByteArray())
    val text = out.toString(Charsets.ISO_8859_1.name())
    assertTrue(text.contains("Connection: close"))
    assertFalse(text.contains("Connection: keep-alive"))
  }

  @Test
  fun writeHttpResponse_canKeepAlive() {
    val out = ByteArrayOutputStream()
    HttpIo.writeHttpResponse(
      out,
      200,
      mapOf("Content-Type" to "text/plain", "Connection" to "close"),
      "ok".toByteArray(),
      connectionClose = false,
    )
    val text = out.toString(Charsets.ISO_8859_1.name())
    assertTrue(text.contains("Connection: keep-alive"))
    // Upstream/client Connection header must not be echoed alongside ours.
    assertFalse(text.contains("Connection: close"))
  }

  @Test
  fun clientWantsKeepAlive_defaultsTrueUnlessConnectionClose() {
    assertTrue(HttpIo.clientWantsKeepAlive(emptyMap()))
    assertTrue(HttpIo.clientWantsKeepAlive(mapOf("Connection" to "keep-alive")))
    assertFalse(HttpIo.clientWantsKeepAlive(mapOf("Connection" to "close")))
    assertFalse(HttpIo.clientWantsKeepAlive(mapOf("connection" to "Close, TE")))
  }
}
