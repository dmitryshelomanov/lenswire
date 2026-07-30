package expo.modules.lenswireproxy

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class HttpIoReadFirstChunkTest {
  @Test
  fun returnsDataWhenAvailable() {
    val input = ByteArrayInputStream("GET / HTTP/1.1\r\n".toByteArray())
    val chunk = HttpIo.readFirstChunk(input)
    assertEquals("GET / HTTP/1.1\r\n", String(chunk))
  }

  @Test
  fun negativeReadIsEof() {
    val input = object : InputStream() {
      override fun read(): Int = -1
      override fun read(b: ByteArray, off: Int, len: Int): Int = -1
    }
    val chunk = HttpIo.readFirstChunk(input)
    assertArrayEquals(ByteArray(0), chunk)
  }

  @Test
  fun zeroReadRetriesUntilData() {
    var calls = 0
    val payload = "GET".toByteArray()
    val input = object : InputStream() {
      override fun read(): Int = error("unused")
      override fun read(b: ByteArray, off: Int, len: Int): Int {
        calls++
        if (calls < 3) return 0
        val n = minOf(len, payload.size)
        System.arraycopy(payload, 0, b, off, n)
        return n
      }
    }
    val chunk = HttpIo.readFirstChunk(input)
    assertEquals(3, calls)
    assertArrayEquals(payload, chunk)
  }

  @Test
  fun zeroReadRetriesUntilEof() {
    var calls = 0
    val input = object : InputStream() {
      override fun read(): Int = error("unused")
      override fun read(b: ByteArray, off: Int, len: Int): Int {
        calls++
        return if (calls < 2) 0 else -1
      }
    }
    val chunk = HttpIo.readFirstChunk(input)
    assertEquals(2, calls)
    assertArrayEquals(ByteArray(0), chunk)
  }
}
