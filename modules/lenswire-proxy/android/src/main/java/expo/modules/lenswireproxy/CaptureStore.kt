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
  private const val SUMMARIES_NAME = "summaries.json"
  private const val REVISION_NAME = "revision"

  const val PROXY_PORT = 9090

  @Volatile
  private var recordingPaused: Boolean = false

  fun setRecordingPaused(paused: Boolean) {
    recordingPaused = paused
  }

  fun isRecordingPaused(): Boolean = recordingPaused

  @Synchronized
  fun append(context: Context, entry: Map<String, Any?>) {
    if (recordingPaused) return
    migrateAwayFromPrefs(context)
    val dir = capturesDir(context)
    var id = entry["id"]?.toString()?.takeIf { it.isNotBlank() }
      ?: java.util.UUID.randomUUID().toString()
    // Never replace an existing WebSocket capture with a non-WS row (e.g. HardFailure tunnel).
    val existingFile = File(dir, "$id.json")
    if (existingFile.isFile) {
      val existing = runCatching { fromJsonObject(JSONObject(existingFile.readText())) }.getOrNull()
      if (existing != null && shouldReassignIdToProtectWs(existing, entry)) {
        id = java.util.UUID.randomUUID().toString()
      }
    }
    val fileName = "$id.json"
    val obj = JSONObject()
    entry.forEach { (k, v) -> obj.put(k, toJsonValue(v)) }
    obj.put("id", id)
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
    prependSummary(dir, toSummary(fromJsonObject(obj)), next)
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
    if (summaries) {
      val cached = readSummaries(dir)
      if (cached != null && summariesAlignWithIndex(cached, index)) {
        if (index.length() == 0) return emptyList()
        val out = ArrayList<Map<String, Any?>>(cached.length())
        var ok = true
        for (i in 0 until cached.length()) {
          val obj = cached.optJSONObject(i)
          if (obj == null) {
            ok = false
            break
          }
          out.add(fromJsonObject(obj))
        }
        if (ok) return out
      }
    }

    val out = ArrayList<Map<String, Any?>>(index.length())
    val valid = JSONArray()
    val rebuiltSummaries = JSONArray()
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (name.isNullOrBlank()) continue
      val file = File(dir, name)
      if (!file.isFile) continue
      val text = runCatching { file.readText() }.getOrNull() ?: continue
      val obj = runCatching { JSONObject(text) }.getOrNull() ?: continue
      val map = fromJsonObject(obj)
      val summary = toSummary(map)
      out.add(if (summaries) summary else map)
      valid.put(name)
      rebuiltSummaries.put(toJsonValue(summary))
    }
    if (valid.length() != index.length()) {
      writeIndex(dir, valid)
    }
    writeSummaries(dir, rebuiltSummaries)
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
    writeSummaries(dir, JSONArray())
    bumpRevision(dir)
  }

  /**
   * Append inspected WebSocket frames onto an existing capture and bump revision.
   * Caps at [WebSocketFrames.MAX_FRAMES]; sets reasonCode to `websocket_frames`.
   */
  @Synchronized
  fun appendWsFrames(
    context: Context,
    id: String,
    frames: List<Map<String, Any?>>,
    omitted: Boolean = false,
    compressed: Boolean = false,
    wsClosed: Boolean = false,
    endedAt: Long? = null,
    wsEndReason: String? = null,
    wsCloseCode: Int? = null,
  ) {
    if (recordingPaused) return
    migrateAwayFromPrefs(context)
    val trimmed = id.trim()
    if (trimmed.isEmpty()) return
    val dir = capturesDir(context)
    val file = File(dir, "$trimmed.json")
    if (!file.isFile) return
    val text = runCatching { file.readText() }.getOrNull() ?: return
    val obj = runCatching { JSONObject(text) }.getOrNull() ?: return

    val existing = obj.optJSONArray("wsFrames") ?: JSONArray()
    var count = existing.length()
    for (frame in frames) {
      val isClose = frame["opcode"]?.toString() == "close"
      if (count >= WebSocketFrames.MAX_FRAMES && !isClose) {
        break
      }
      // Close frames may exceed the soft cap by one so teardown is always visible.
      if (count >= WebSocketFrames.MAX_FRAMES && isClose) {
        // replace last non-close if at hard cap+1 already, else append
        if (count > WebSocketFrames.MAX_FRAMES) {
          existing.put(count - 1, toJsonValue(frame))
        } else {
          existing.put(toJsonValue(frame))
          count += 1
        }
        continue
      }
      existing.put(toJsonValue(frame))
      count += 1
    }
    obj.put("wsFrames", existing)
    obj.put("wsFrameCount", count)
    if (omitted || count >= WebSocketFrames.MAX_FRAMES) {
      obj.put("wsFramesOmitted", true)
    }
    if (compressed || obj.optBoolean("wsCompressed", false)) {
      obj.put("wsCompressed", true)
    }
    applyWsClosedFields(obj, wsClosed, endedAt, wsEndReason, wsCloseCode)
    obj.put("reasonCode", "websocket_frames")
    obj.put("captureSummary", "WebSocket frames inspected (read-only); no inject or rewrite.")
    obj.put("httpPayloadAvailable", true)
    writeTextAtomically(file, obj.toString())
    updateSummaryForId(dir, trimmed, fromJsonObject(obj))
    bumpRevision(dir)
  }

  /** Mark a WebSocket capture as closed (idempotent if already closed with close_frame). */
  @Synchronized
  fun markWsClosed(
    context: Context,
    id: String,
    reason: String,
    closeCode: Int? = null,
    endedAt: Long = System.currentTimeMillis(),
  ) {
    if (recordingPaused) return
    migrateAwayFromPrefs(context)
    val trimmed = id.trim()
    if (trimmed.isEmpty()) return
    val dir = capturesDir(context)
    val file = File(dir, "$trimmed.json")
    if (!file.isFile) return
    val text = runCatching { file.readText() }.getOrNull() ?: return
    val obj = runCatching { JSONObject(text) }.getOrNull() ?: return
    if (obj.optBoolean("wsClosed", false)) {
      val existingReason = obj.optString("wsEndReason", "")
      // Prefer close_frame over eof/error; never downgrade.
      if (existingReason == "close_frame" || reason != "close_frame") {
        return
      }
    }
    applyWsClosedFields(obj, true, endedAt, reason, closeCode)
    writeTextAtomically(file, obj.toString())
    updateSummaryForId(dir, trimmed, fromJsonObject(obj))
    bumpRevision(dir)
  }

  private fun applyWsClosedFields(
    obj: JSONObject,
    wsClosed: Boolean,
    endedAt: Long?,
    wsEndReason: String?,
    wsCloseCode: Int?,
  ) {
    if (!wsClosed) return
    obj.put("wsClosed", true)
    if (endedAt != null) obj.put("endedAt", endedAt)
    if (!wsEndReason.isNullOrBlank()) obj.put("wsEndReason", wsEndReason)
    if (wsCloseCode != null) obj.put("wsCloseCode", wsCloseCode)
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

  private fun readSummaries(dir: File): JSONArray? {
    val file = File(dir, SUMMARIES_NAME)
    if (!file.isFile) return null
    return runCatching { JSONArray(file.readText()) }.getOrNull()
  }

  /** True when each summary id matches the corresponding index entry (`{id}.json`). */
  internal fun summariesAlignWithIndex(summaries: JSONArray, index: JSONArray): Boolean {
    if (summaries.length() != index.length()) return false
    for (i in 0 until index.length()) {
      val name = index.optString(i)
      if (name.isNullOrBlank()) return false
      val id = name.removeSuffix(".json")
      val obj = summaries.optJSONObject(i) ?: return false
      if (obj.optString("id") != id) return false
    }
    return true
  }

  private fun writeSummaries(dir: File, summaries: JSONArray) {
    writeTextAtomically(File(dir, SUMMARIES_NAME), summaries.toString())
  }

  private fun prependSummary(dir: File, summary: Map<String, Any?>, index: JSONArray) {
    val next = JSONArray()
    next.put(toJsonValue(summary))
    val previous = readSummaries(dir) ?: JSONArray()
    val seenIds = HashSet<String>()
    summary["id"]?.toString()?.let { seenIds.add(it) }
    for (i in 0 until previous.length()) {
      if (next.length() >= index.length()) break
      val obj = previous.optJSONObject(i) ?: continue
      val id = obj.optString("id")
      if (id.isNotBlank() && !seenIds.add(id)) continue
      next.put(obj)
    }
    // Keep summaries aligned with index length.
    while (next.length() > index.length()) {
      next.remove(next.length() - 1)
    }
    writeSummaries(dir, next)
  }

  private fun updateSummaryForId(dir: File, id: String, entry: Map<String, Any?>) {
    val summaries = readSummaries(dir) ?: return
    val summary = toSummary(entry)
    var updated = false
    for (i in 0 until summaries.length()) {
      val obj = summaries.optJSONObject(i) ?: continue
      if (obj.optString("id") == id) {
        summaries.put(i, toJsonValue(summary))
        updated = true
        break
      }
    }
    if (updated) writeSummaries(dir, summaries)
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

  /** True when [existing] is a WS capture and [incoming] would clobber it with a non-WS row. */
  internal fun shouldReassignIdToProtectWs(
    existing: Map<String, Any?>,
    incoming: Map<String, Any?>,
  ): Boolean = isWsCaptureMap(existing) && !isWsCaptureMap(incoming)

  internal fun isWsCaptureMap(entry: Map<String, Any?>): Boolean {
    val reason = entry["reasonCode"]?.toString()
    if (
      reason == "websocket_frames" ||
      reason == "websocket_relay" ||
      reason == "mitm_websocket"
    ) {
      return true
    }
    val frameCount = when (val raw = entry["wsFrameCount"]) {
      is Number -> raw.toInt()
      else -> 0
    }
    if (frameCount > 0) return true
    val frames = entry["wsFrames"]
    return when (frames) {
      is List<*> -> frames.isNotEmpty()
      is JSONArray -> frames.length() > 0
      else -> false
    }
  }

  internal fun toSummary(entry: Map<String, Any?>): Map<String, Any?> {
    val out = HashMap(entry)
    out["requestBody"] = bodyStub(entry["requestBody"])
    out["responseBody"] = bodyStub(entry["responseBody"])
    // Keep count for list UI; drop full frame payloads from summaries.
    val frameCount = when (val raw = entry["wsFrameCount"]) {
      is Number -> raw.toInt()
      else -> (entry["wsFrames"] as? List<*>)?.size ?: 0
    }
    if (frameCount > 0) {
      out["wsFrameCount"] = frameCount
    }
    out.remove("wsFrames")
    // Lifecycle fields stay on summaries for live list badges.
    if (entry["wsClosed"] == true) out["wsClosed"] = true
    entry["endedAt"]?.let { out["endedAt"] = it }
    entry["wsEndReason"]?.let { out["wsEndReason"] = it }
    entry["wsCloseCode"]?.let { out["wsCloseCode"] = it }
    if (entry["wsCompressed"] == true) out["wsCompressed"] = true
    if (entry["wsFramesOmitted"] == true) out["wsFramesOmitted"] = true
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
    val keep = HashSet<String>(index.length() + 3)
    keep.add(INDEX_NAME)
    keep.add(SUMMARIES_NAME)
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
