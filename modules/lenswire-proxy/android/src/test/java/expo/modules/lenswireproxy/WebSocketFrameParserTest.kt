package expo.modules.lenswireproxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebSocketFrameParserTest {
  private fun textFrame(payload: String, fin: Boolean = true, mask: Boolean = true): ByteArray {
    val data = payload.toByteArray(Charsets.UTF_8)
    return buildFrame(opcode = WebSocketFrames.OPCODE_TEXT, payload = data, fin = fin, mask = mask)
  }

  private fun buildFrame(
    opcode: Int,
    payload: ByteArray,
    fin: Boolean,
    mask: Boolean,
    maskKey: ByteArray = byteArrayOf(0x01, 0x02, 0x03, 0x04),
    rsv: Int = 0,
  ): ByteArray {
    val out = ArrayList<Byte>()
    out.add(((if (fin) 0x80 else 0) or ((rsv and 0x7) shl 4) or (opcode and 0x0f)).toByte())
    val len = payload.size
    val maskBit = if (mask) 0x80 else 0
    when {
      len < 126 -> out.add((maskBit or len).toByte())
      len <= 0xffff -> {
        out.add((maskBit or 126).toByte())
        out.add((len ushr 8).toByte())
        out.add((len and 0xff).toByte())
      }
      else -> {
        out.add((maskBit or 127).toByte())
        for (i in 7 downTo 0) {
          out.add(((len.toLong() ushr (i * 8)) and 0xff).toByte())
        }
      }
    }
    val wirePayload = if (mask) {
      out.addAll(maskKey.toList())
      ByteArray(payload.size) { i -> (payload[i].toInt() xor maskKey[i % 4].toInt()).toByte() }
    } else {
      payload
    }
    out.addAll(wirePayload.toList())
    return out.toByteArray()
  }

  @Test
  fun `parses masked text frame`() {
    val parser = WebSocketFrameParser()
    parser.append(textFrame("""{"ok":true}"""))
    val frames = parser.drain()
    assertEquals(1, frames.size)
    assertEquals(WebSocketFrames.OPCODE_TEXT, frames[0].opcode)
    assertTrue(frames[0].fin)
    assertEquals("""{"ok":true}""", String(frames[0].payload, Charsets.UTF_8))
  }

  @Test
  fun `parses across chunk boundaries`() {
    val full = textFrame("hello", mask = false)
    val parser = WebSocketFrameParser()
    parser.append(full.copyOfRange(0, 2))
    assertTrue(parser.drain().isEmpty())
    parser.append(full.copyOfRange(2, full.size))
    val frames = parser.drain()
    assertEquals(1, frames.size)
    assertEquals("hello", String(frames[0].payload, Charsets.UTF_8))
  }

  @Test
  fun `assembles fragmented text`() {
    val assembler = WebSocketMessageAssembler()
    val parser = WebSocketFrameParser()
    parser.append(textFrame("hel", fin = false, mask = false))
    parser.append(
      buildFrame(
        opcode = WebSocketFrames.OPCODE_CONTINUATION,
        payload = "lo".toByteArray(),
        fin = true,
        mask = false,
      ),
    )
    val raws = parser.drain()
    assertEquals(2, raws.size)
    assertNull(assembler.accept(raws[0]))
    val done = assembler.accept(raws[1])!!
    assertEquals(WebSocketFrames.OPCODE_TEXT, done.opcode)
    assertEquals("hello", String(done.payload, Charsets.UTF_8))
  }

  @Test
  fun `control frames emit immediately`() {
    val assembler = WebSocketMessageAssembler()
    val ping = buildFrame(
      opcode = WebSocketFrames.OPCODE_PING,
      payload = "x".toByteArray(),
      fin = true,
      mask = false,
    )
    val parser = WebSocketFrameParser()
    parser.append(ping)
    val raw = parser.drain().single()
    val msg = assembler.accept(raw)!!
    assertEquals(WebSocketFrames.OPCODE_PING, msg.opcode)
    assertEquals("x", String(msg.payload, Charsets.UTF_8))
  }

  @Test
  fun `display frame classifies json`() {
    val frame = WebSocketFrames.displayFrame("client", WebSocketFrames.OPCODE_TEXT, """{"a":1}""".toByteArray())
    assertEquals("client", frame["dir"])
    assertEquals("text", frame["opcode"])
    val payload = frame["payload"] as Map<*, *>
    assertEquals("json", payload["kind"])
  }

  @Test
  fun `rsv frames classify as compressed binary`() {
    val payload = "hello".toByteArray()
    val frame = buildFrame(opcode = WebSocketFrames.OPCODE_TEXT, payload = payload, fin = true, mask = false, rsv = 4)
    val parser = WebSocketFrameParser()
    parser.append(frame)
    val raw = parser.drain().single()
    assertEquals(4, raw.rsv)
    // Empty payload avoids android.util.Base64 stubs in JVM unit tests.
    val body = WebSocketFrames.classifyPayload(WebSocketFrames.OPCODE_TEXT, ByteArray(0), rsv = 4)
    assertEquals("empty", body["kind"])
    assertEquals(true, body["compressed"])
  }

  @Test
  fun `closeCodeFromPayload reads status`() {
    val payload = byteArrayOf(0x03, 0xe8.toByte()) + "bye".toByteArray()
    assertEquals(1000, WebSocketFrames.closeCodeFromPayload(payload))
    assertEquals(null, WebSocketFrames.closeCodeFromPayload(ByteArray(0)))
    assertEquals(null, WebSocketFrames.closeCodeFromPayload(byteArrayOf(0x03)))
  }

  @Test
  fun `close frame parses code and reason`() {
    val payload = byteArrayOf(0x03, 0xe8.toByte()) + "bye".toByteArray() // 1000
    val body = WebSocketFrames.classifyPayload(WebSocketFrames.OPCODE_CLOSE, payload)
    assertEquals("text", body["kind"])
    assertEquals(1000, body["closeCode"])
    assertEquals("code=1000 reason=bye", body["text"])
  }

  @Test
  fun `oversized frame is omitted not empty message`() {
    val assembler = WebSocketMessageAssembler()
    val oversized = WebSocketFrameParser.RawFrame(
      fin = true,
      opcode = WebSocketFrames.OPCODE_TEXT,
      payload = ByteArray(0),
      oversized = true,
    )
    val result = assembler.accept(oversized)!!
    assertTrue(result.omitted)
  }

  @Test
  fun `assembler drops when assembled size exceeds cap`() {
    val assembler = WebSocketMessageAssembler()
    val chunk = ByteArray(WebSocketFrames.MAX_ASSEMBLED_BYTES / 2 + 1) { 1 }
    val first = WebSocketFrameParser.RawFrame(
      fin = false,
      opcode = WebSocketFrames.OPCODE_BINARY,
      payload = chunk,
    )
    assertNull(assembler.accept(first))
    val second = WebSocketFrameParser.RawFrame(
      fin = true,
      opcode = WebSocketFrames.OPCODE_CONTINUATION,
      payload = chunk,
    )
    val result = assembler.accept(second)!!
    assertTrue(result.omitted)
  }
}
