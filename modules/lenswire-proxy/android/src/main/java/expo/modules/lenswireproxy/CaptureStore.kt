package expo.modules.lenswireproxy

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

object CaptureStore {
  private const val PREFS = "lenswire_captures"
  private const val KEY = "items"
  private const val MAX = 200
  private const val DIR_NAME = "captures"
  private const val INDEX_NAME = "index.json"
  private const val REVISION_NAME = "revision"

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
    writeTextAtomically(File(dir, fileName), obj.toString())

    val index = readIndex(dir)
    val next = buildNextIndex(fileName, index, MAX)
    val keep = HashSet<String>(next.length())
    for (i in 0 until next.length()) {
      next.optString(i)?.takeIf { it.isNotBlank() }?.let { keep.add(it) }
    }
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (name.isNullOrBlank() || keep.contains(name)) continue
      File(dir, name).delete()
    }
    writeIndex(dir, next)
    bumpRevision(dir)
  }

  @Synchronized
  fun revision(context: Context): Long {
    migrateAwayFromPrefs(context)
    return readRevision(capturesDir(context))
  }

  @Synchronized
  fun read(context: Context, summaries: Boolean = false): List<Map<String, Any?>> {
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
      val map = fromJsonObject(obj)
      out.add(if (summaries) toSummary(map) else map)
      valid.put(name)
    }
    if (valid.length() != index.length()) {
      writeIndex(dir, valid)
    }
    cleanupOrphans(dir, valid)
    return out
  }

  @Synchronized
  fun readOne(context: Context, id: String): Map<String, Any?>? {
    migrateAwayFromPrefs(context)
    val trimmed = id.trim()
    if (trimmed.isEmpty()) return null
    val file = File(capturesDir(context), "$trimmed.json")
    if (!file.isFile) return null
    val text = runCatching { file.readText() }.getOrNull() ?: return null
    val obj = runCatching { JSONObject(text) }.getOrNull() ?: return null
    return fromJsonObject(obj)
  }

  @Synchronized
  fun clear(context: Context) {
    migrateAwayFromPrefs(context)
    val dir = capturesDir(context)
    dir.listFiles()?.forEach { it.delete() }
    writeIndex(dir, JSONArray())
    bumpRevision(dir)
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
    writeTextAtomically(File(dir, INDEX_NAME), index.toString())
  }

  private fun readRevision(dir: File): Long {
    val file = File(dir, REVISION_NAME)
    if (!file.isFile) return 0L
    return runCatching { file.readText().trim().toLong() }.getOrDefault(0L)
  }

  private fun bumpRevision(dir: File) {
    val next = readRevision(dir) + 1L
    writeTextAtomically(File(dir, REVISION_NAME), next.toString())
  }

  internal fun buildNextIndex(latestFileName: String, previous: JSONArray, maxItems: Int): JSONArray {
    val next = JSONArray()
    next.put(latestFileName)
    for (i in 0 until previous.length()) {
      val name = previous.optString(i)
      if (name.isNullOrBlank() || name == latestFileName) continue
      if (next.length() >= maxItems) break
      next.put(name)
    }
    return next
  }

  internal fun toSummary(entry: Map<String, Any?>): Map<String, Any?> {
    val out = HashMap(entry)
    out["requestBody"] = bodyStub(entry["requestBody"])
    out["responseBody"] = bodyStub(entry["responseBody"])
    return out
  }

  private fun bodyStub(value: Any?): Map<String, Any?> {
    if (value !is Map<*, *>) {
      return mapOf("kind" to "empty", "size" to 0)
    }
    val kind = value["kind"]?.toString() ?: "empty"
    val size = when (val raw = value["size"]) {
      is Number -> raw.toLong()
      else -> runCatching { raw?.toString()?.toLong() }.getOrDefault(0L)
    }
    val stub = HashMap<String, Any?>()
    stub["kind"] = kind
    stub["size"] = size
    if (value["truncated"] == true) stub["truncated"] = true
    if (value["encodingDecoded"] == true) stub["encodingDecoded"] = true
    return stub
  }

  private fun writeTextAtomically(target: File, text: String) {
    val tmp = File(target.parentFile, "${target.name}.tmp-${System.nanoTime()}")
    tmp.writeText(text)
    try {
      Files.move(
        tmp.toPath(),
        target.toPath(),
        StandardCopyOption.REPLACE_EXISTING,
        StandardCopyOption.ATOMIC_MOVE
      )
      return
    } catch (_: Exception) {
      // Continue with non-atomic move fallback below.
    }
    runCatching {
      Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }.getOrElse {
      target.writeText(text)
      tmp.delete()
    }
  }

  private fun cleanupOrphans(dir: File, index: JSONArray) {
    val keep = HashSet<String>(index.length() + 2)
    keep.add(INDEX_NAME)
    keep.add(REVISION_NAME)
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (!name.isNullOrBlank()) keep.add(name)
    }
    dir.listFiles()?.forEach { file ->
      if (!file.isFile) return@forEach
      if (keep.contains(file.name)) return@forEach
      if (file.name.contains(".tmp-")) {
        file.delete()
        return@forEach
      }
      if (file.extension == "json") {
        file.delete()
      }
    }
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
