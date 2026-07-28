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
    entry.forEach { (k, v) -> obj.put(k, toJsonValue(v)) }
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
      out.add(fromJsonObject(obj))
    }
    return out
  }

  @Synchronized
  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }

  private fun toJsonValue(value: Any?): Any {
    return when (value) {
      null -> JSONObject.NULL
      is JSONObject, is JSONArray -> value
      is Map<*, *> -> {
        val obj = JSONObject()
        value.forEach { (k, v) ->
          if (k != null) obj.put(k.toString(), toJsonValue(v))
        }
        obj
      }
      is Collection<*> -> {
        val arr = JSONArray()
        value.forEach { item -> arr.put(toJsonValue(item)) }
        arr
      }
      is Array<*> -> {
        val arr = JSONArray()
        value.forEach { item -> arr.put(toJsonValue(item)) }
        arr
      }
      is Boolean, is Number, is String -> value
      else -> value.toString()
    }
  }

  private fun fromJsonObject(obj: JSONObject): Map<String, Any?> {
    val map = HashMap<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      map[k] = fromJsonValue(obj.get(k))
    }
    return map
  }

  private fun fromJsonValue(value: Any?): Any? {
    return when (value) {
      null, JSONObject.NULL -> null
      is JSONObject -> fromJsonObject(value)
      is JSONArray -> {
        val list = ArrayList<Any?>(value.length())
        for (i in 0 until value.length()) {
          list.add(fromJsonValue(value.get(i)))
        }
        list
      }
      else -> value
    }
  }
}
