package expo.modules.lenswireproxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class HttpIoStreamTeeTest {
  @Test
  fun streamHttpResponse_forwardsFullBodyAndCapturesAllWhenUnderCap() {
    val payload = ByteArray(64 * 1024) { (it % 251).toByte() }
    val client = ByteArrayOutputStream()
    val tee = HttpIo.streamHttpResponse(
      out = client,
      status = 200,
      headers = mapOf("Content-Type" to "application/octet-stream"),
      bodyStream = ByteArrayInputStream(payload),
      contentLength = payload.size.toLong(),
      connectionClose = true,
    )
    val text = client.toString(Charsets.ISO_8859_1.name())
    assertTrue(text.startsWith("HTTP/1.1 200"))
    assertTrue(text.contains("Content-Length: ${payload.size}"))
    assertEquals(payload.toList(), tee.capture.toList())
    assertFalse(tee.truncated)
    assertEquals(payload.size.toLong(), tee.wireBytes)
    val bodyOffset = text.indexOf("\r\n\r\n") + 4
    val wireBody = client.toByteArray().copyOfRange(bodyOffset, client.size())
    assertEquals(payload.toList(), wireBody.toList())
  }

  @Test
  fun streamHttpResponse_forwardsBeyondCapButTruncatesCapture() {
    val oversize = HttpIo.MAX_BODY_BYTES + 128 * 1024
    val payload = ByteArray(oversize) { (it % 251).toByte() }
    val client = ByteArrayOutputStream()
    val tee = HttpIo.streamHttpResponse(
      out = client,
      status = 200,
      headers = mapOf("Content-Type" to "application/octet-stream"),
      bodyStream = ByteArrayInputStream(payload),
      contentLength = payload.size.toLong(),
      connectionClose = true,
    )
    assertTrue(tee.truncated)
    assertEquals(HttpIo.MAX_BODY_BYTES, tee.capture.size)
    assertEquals(payload.size.toLong(), tee.wireBytes)
    val bodyOffset = client.toString(Charsets.ISO_8859_1.name()).indexOf("\r\n\r\n") + 4
    val wireBody = client.toByteArray().copyOfRange(bodyOffset, client.size())
    assertEquals(payload.size, wireBody.size)
    assertEquals(payload.toList(), wireBody.toList())
  }

  @Test
  fun streamHttpResponse_usesChunkedWhenContentLengthUnknown() {
    val payload = "hello-stream".toByteArray()
    val client = ByteArrayOutputStream()
    val tee = HttpIo.streamHttpResponse(
      out = client,
      status = 200,
      headers = mapOf("Content-Type" to "text/plain"),
      bodyStream = ByteArrayInputStream(payload),
      contentLength = null,
      connectionClose = false,
    )
    val text = client.toString(Charsets.ISO_8859_1.name())
    assertTrue(text.contains("Transfer-Encoding: chunked"))
    assertTrue(text.contains("Connection: keep-alive"))
    assertFalse(text.contains("Content-Length:"))
    assertEquals(payload.toList(), tee.capture.toList())
    assertEquals(payload.size.toLong(), tee.wireBytes)
    assertTrue(text.contains("\r\n0\r\n\r\n"))
  }

  @Test
  fun teeRawBody_continuesPipeAfterCaptureCap() {
    val maxCapture = 1024
    val payload = ByteArray(maxCapture + 500) { 7 }
    val out = ByteArrayOutputStream()
    val tee = HttpIo.teeRawBody(ByteArrayInputStream(payload), out, maxCapture)
    assertEquals(maxCapture, tee.capture.size)
    assertTrue(tee.truncated)
    assertEquals(payload.size.toLong(), tee.wireBytes)
    assertEquals(payload.toList(), out.toByteArray().toList())
  }
}
