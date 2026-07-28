package expo.modules.lenswireproxy

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

object CaptureStore {
  private const val PREFS = "lenswire_captures"
  private const val KEY = "items"
  private const val MAX = 200
  private const val DIR_NAME = "captures"
  private const val INDEX_NAME = "index.json"

  const val PROXY_PORT = 9090

  @Synchronized
  fun append(context: Context, entry: Map<String, Any?>) {
    migrateAwayFromPrefs(context)
    val dir = capturesDir(context)
    val id = entry["id"]?.toString()?.takeIf { it.isNotBlank() }
      ?: java.util.UUID.randomUUID().toString()
    val fileName = "$id.json"
    val obj = JSONObject()
    entry.forEach { (k, v) -> obj.put(k, toJsonValue(v)) }
    if (!obj.has("id")) obj.put("id", id)
    File(dir, fileName).writeText(obj.toString())

    val index = readIndex(dir)
    val next = JSONArray()
    next.put(fileName)
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (name.isNullOrBlank() || name == fileName) continue
      if (next.length() >= MAX) {
        File(dir, name).delete()
        continue
      }
      next.put(name)
    }
    writeIndex(dir, next)
  }

  @Synchronized
  fun read(context: Context): List<Map<String, Any?>> {
    migrateAwayFromPrefs(context)
    val dir = capturesDir(context)
    val index = readIndex(dir)
    val out = ArrayList<Map<String, Any?>>(index.length())
    val valid = JSONArray()
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (name.isNullOrBlank()) continue
      val file = File(dir, name)
      if (!file.isFile) continue
      val text = runCatching { file.readText() }.getOrNull() ?: continue
      val obj = runCatching { JSONObject(text) }.getOrNull() ?: continue
      out.add(fromJsonObject(obj))
      valid.put(name)
    }
    if (valid.length() != index.length()) {
      writeIndex(dir, valid)
    }
    return out
  }

  @Synchronized
  fun clear(context: Context) {
    migrateAwayFromPrefs(context)
    val dir = capturesDir(context)
    dir.listFiles()?.forEach { it.delete() }
    writeIndex(dir, JSONArray())
  }

  private fun capturesDir(context: Context): File {
    val dir = File(context.filesDir, DIR_NAME)
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun readIndex(dir: File): JSONArray {
    val file = File(dir, INDEX_NAME)
    if (!file.isFile) return JSONArray()
    return runCatching { JSONArray(file.readText()) }.getOrDefault(JSONArray())
  }

  private fun writeIndex(dir: File, index: JSONArray) {
    File(dir, INDEX_NAME).writeText(index.toString())
  }

  private fun migrateAwayFromPrefs(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.contains(KEY)) return
    prefs.edit().remove(KEY).apply()
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
