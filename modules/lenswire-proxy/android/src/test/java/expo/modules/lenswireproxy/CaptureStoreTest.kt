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
}
