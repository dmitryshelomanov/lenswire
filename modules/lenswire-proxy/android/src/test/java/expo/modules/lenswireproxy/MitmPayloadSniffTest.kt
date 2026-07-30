package expo.modules.lenswireproxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MitmPayloadSniffTest {
  @Test
  fun detectsHttp2Preface() {
    val bytes = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.HTTP2, result.guess)
    assertEquals("PRI", result.method)
    assertFalse(result.looksLikeHttp11)
    assertTrue(MitmPayloadSniff.shouldAbortMitm(result, bytes))
    val detail = MitmPayloadSniff.formatDetail(result, bytes)
    assertTrue(detail.contains("guess=http2"))
    assertTrue(detail.contains("method=PRI"))
    assertTrue(detail.contains("hex="))
  }

  @Test
  fun detectsPartialHttp2PrefaceAsHttp2() {
    val bytes = "PRI * HT".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.HTTP2, result.guess)
    assertTrue(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun detectsHttp11Get() {
    val bytes = "GET /v1/x HTTP/1.1\r\nHost: example.com\r\n\r\n".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.HTTP11, result.guess)
    assertEquals("GET", result.method)
    assertTrue(result.looksLikeHttp11)
    assertTrue(MitmPayloadSniff.isSupportedMethod(result.method!!))
    assertFalse(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun doesNotAbortPartialHttp11Method() {
    val bytes = "GET".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.NON_HTTP, result.guess)
    assertFalse(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun doesNotAbortPartialHttp11WithoutPath() {
    val bytes = "GET ".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.NON_HTTP, result.guess)
    assertFalse(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun detectsUnsupportedMethodAsHttp11() {
    val bytes = "TRACE / HTTP/1.1\r\nHost: example.com\r\n\r\n".toByteArray(Charsets.US_ASCII)
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.HTTP11, result.guess)
    assertEquals("TRACE", result.method)
    assertFalse(MitmPayloadSniff.isSupportedMethod(result.method!!))
    assertTrue(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun detectsBinaryAsNonHttpAndAborts() {
    val bytes = byteArrayOf(0x16, 0x03, 0x03, 0x00, 0x01, 0x02, 0xff.toByte())
    val result = MitmPayloadSniff.analyze(bytes)
    assertEquals(MitmPayloadSniff.Guess.NON_HTTP, result.guess)
    assertFalse(result.looksLikeHttp11)
    assertTrue(MitmPayloadSniff.shouldAbortMitm(result, bytes))
  }

  @Test
  fun detectsEmptyAndAborts() {
    val result = MitmPayloadSniff.analyze(ByteArray(0))
    assertEquals(MitmPayloadSniff.Guess.EMPTY, result.guess)
    assertTrue(MitmPayloadSniff.shouldAbortMitm(result, ByteArray(0)))
  }

  @Test
  fun isMostlyPrintable() {
    assertTrue(MitmPayloadSniff.isMostlyPrintable("GET / HTTP/1.1".toByteArray()))
    assertFalse(MitmPayloadSniff.isMostlyPrintable(byteArrayOf(0x00, 0x01, 0x02, 0x03)))
  }
}
