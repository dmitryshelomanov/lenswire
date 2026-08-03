package expo.modules.lenswireproxy

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureStoreTest {
  @Test
  fun `recording pause flag toggles`() {
    CaptureStore.setRecordingPaused(true)
    assertTrue(CaptureStore.isRecordingPaused())
    CaptureStore.setRecordingPaused(false)
    assertFalse(CaptureStore.isRecordingPaused())
  }

  @Test
  fun `buildNextIndex keeps latest first and removes duplicate`() {
    val prev = JSONArray(listOf("a.json", "b.json", "c.json"))
    val next = CaptureStore.buildNextIndex("b.json", prev, 10)

    assertEquals(3, next.length())
    assertEquals("b.json", next.getString(0))
    assertEquals("a.json", next.getString(1))
    assertEquals("c.json", next.getString(2))
  }

  @Test
  fun `buildNextIndex enforces max size`() {
    val prev = JSONArray(listOf("a.json", "b.json", "c.json", "d.json"))
    val next = CaptureStore.buildNextIndex("z.json", prev, 3)

    assertEquals(3, next.length())
    assertEquals("z.json", next.getString(0))
    assertEquals("a.json", next.getString(1))
    assertEquals("b.json", next.getString(2))
    assertFalse((0 until next.length()).any { next.getString(it) == "d.json" })
  }

  @Test
  fun `toSummary strips body payloads but keeps kind and size`() {
    val entry = mapOf(
      "id" to "1",
      "requestBody" to mapOf(
        "kind" to "json",
        "text" to """{"ok":true}""",
        "size" to 11,
        "truncated" to true,
      ),
      "responseBody" to mapOf(
        "kind" to "image",
        "size" to 2048,
        "previewBase64" to "abcd",
        "encodingDecoded" to true,
      ),
    )

    val summary = CaptureStore.toSummary(entry)
    val request = summary["requestBody"] as Map<*, *>
    val response = summary["responseBody"] as Map<*, *>

    assertEquals("json", request["kind"])
    assertEquals(11L, (request["size"] as Number).toLong())
    assertEquals(true, request["truncated"])
    assertFalse(request.containsKey("text"))
    assertEquals("image", response["kind"])
    assertEquals(2048L, (response["size"] as Number).toLong())
    assertEquals(true, response["encodingDecoded"])
    assertFalse(response.containsKey("previewBase64"))
  }

  @Test
  fun `toSummary keeps websocket lifecycle fields`() {
    val entry = mapOf(
      "id" to "ws-1",
      "wsFrames" to listOf(mapOf("opcode" to "text")),
      "wsFrameCount" to 3,
      "wsClosed" to true,
      "endedAt" to 1_700_000_000_000L,
      "wsEndReason" to "close_frame",
      "wsCloseCode" to 1000,
      "wsCompressed" to true,
      "wsFramesOmitted" to true,
      "requestBody" to mapOf("kind" to "empty", "size" to 0),
      "responseBody" to mapOf("kind" to "empty", "size" to 0),
    )
    val summary = CaptureStore.toSummary(entry)
    assertFalse(summary.containsKey("wsFrames"))
    assertEquals(3, summary["wsFrameCount"])
    assertEquals(true, summary["wsClosed"])
    assertEquals(1_700_000_000_000L, summary["endedAt"])
    assertEquals("close_frame", summary["wsEndReason"])
    assertEquals(1000, summary["wsCloseCode"])
    assertEquals(true, summary["wsCompressed"])
    assertEquals(true, summary["wsFramesOmitted"])
  }

  @Test
  fun `shouldReassignIdToProtectWs when tunnel would overwrite frames`() {
    val existing = mapOf(
      "id" to "same",
      "reasonCode" to "websocket_frames",
      "wsFrameCount" to 4,
    )
    val incoming = mapOf(
      "id" to "same",
      "reasonCode" to "mitm_error",
      "status" to 502,
    )
    assertTrue(CaptureStore.shouldReassignIdToProtectWs(existing, incoming))
    assertFalse(
      CaptureStore.shouldReassignIdToProtectWs(
        existing,
        mapOf("id" to "same", "reasonCode" to "websocket_frames"),
      ),
    )
    assertFalse(
      CaptureStore.shouldReassignIdToProtectWs(
        mapOf("id" to "http", "reasonCode" to "ok"),
        incoming,
      ),
    )
  }

  @Test
  fun `summariesAlignWithIndex requires matching ids in order`() {
    val index = JSONArray(listOf("a.json", "b.json"))
    val ok = JSONArray()
    ok.put(org.json.JSONObject(mapOf("id" to "a")))
    ok.put(org.json.JSONObject(mapOf("id" to "b")))
    assertTrue(CaptureStore.summariesAlignWithIndex(ok, index))

    val mismatched = JSONArray()
    mismatched.put(org.json.JSONObject(mapOf("id" to "b")))
    mismatched.put(org.json.JSONObject(mapOf("id" to "a")))
    assertFalse(CaptureStore.summariesAlignWithIndex(mismatched, index))

    val short = JSONArray()
    short.put(org.json.JSONObject(mapOf("id" to "a")))
    assertFalse(CaptureStore.summariesAlignWithIndex(short, index))
  }
}
