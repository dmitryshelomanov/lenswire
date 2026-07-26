package expo.modules.lenswireproxy

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object CaptureStore {
  private const val PREFS = "lenswire_captures"
  private const val KEY = "items"
  private const val MAX = 200

  const val PROXY_PORT = 9090

  @Synchronized
  fun append(context: Context, entry: Map<String, Any?>) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(KEY, "[]"))
    val obj = JSONObject()
    entry.forEach { (k, v) -> obj.put(k, v ?: JSONObject.NULL) }
    val next = JSONArray()
    next.put(obj)
    for (i in 0 until minOf(arr.length(), MAX - 1)) {
      next.put(arr.get(i))
    }
    prefs.edit().putString(KEY, next.toString()).apply()
  }

  @Synchronized
  fun read(context: Context): List<Map<String, Any?>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(KEY, "[]"))
    val out = ArrayList<Map<String, Any?>>(arr.length())
    for (i in 0 until arr.length()) {
      val obj = arr.getJSONObject(i)
      val map = HashMap<String, Any?>()
      val keys = obj.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val v = obj.get(k)
        map[k] = if (v == JSONObject.NULL) null else v
      }
      out.add(map)
    }
    return out
  }

  @Synchronized
  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
}
