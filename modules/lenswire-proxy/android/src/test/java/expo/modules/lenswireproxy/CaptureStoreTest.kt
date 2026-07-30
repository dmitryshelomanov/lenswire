package expo.modules.lenswireproxy

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CaptureStoreTest {
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
}
