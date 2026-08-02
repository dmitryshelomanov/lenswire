package expo.modules.lenswireproxy

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object OverrideRules {
  private const val PREFS = "lenswire_settings"
  private const val KEY = "overrides"
  private const val MAX_DELAY_MS = 30_000L

  @Volatile
  private var cachedJson: String? = null

  @Volatile
  private var cachedRules: List<Rule>? = null

  data class Rule(
    val id: String,
    val enabled: Boolean,
    val kind: String,
    val method: String,
    val scheme: String,
    val host: String,
    val path: String,
    val query: String,
    val pathMatch: String,
    val matchHeaders: Map<String, String>,
    val delayMs: Long,
    val bodyMode: String,
    val status: Int,
    val contentType: String,
    val headers: Map<String, String>,
    val bodyText: String,
    val createdAt: Long,
  ) {
    fun isStatusOnly(): Boolean = bodyMode.equals("statusOnly", ignoreCase = true)

    fun bodyBytes(): ByteArray =
      if (isStatusOnly()) ByteArray(0) else bodyText.toByteArray(Charsets.UTF_8)

    fun responseHeaders(): Map<String, String> {
      val headers = LinkedHashMap<String, String>()
      if (!isStatusOnly() && contentType.isNotBlank()) {
        headers["Content-Type"] = contentType
      }
      mergeHeaders(headers, this.headers)
      // Writers always set Content-Length / Connection; drop hop-by-hop from the rule.
      removeHeaderIgnoreCase(headers, "content-length")
      removeHeaderIgnoreCase(headers, "transfer-encoding")
      return headers
    }

    fun applyDelay() {
      val ms = delayMs.coerceIn(0L, MAX_DELAY_MS)
      if (ms > 0L) {
        try {
          Thread.sleep(ms)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
        }
      }
    }
  }

  fun getJson(context: Context): String {
    return context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY, "[]") ?: "[]"
  }

  fun setJson(context: Context, json: String) {
    val normalized = json.ifBlank { "[]" }
    context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY, normalized)
      .apply()
    cachedJson = normalized
    cachedRules = null
  }

  fun load(context: Context): List<Rule> {
    val json = getJson(context)
    cachedRules?.let { cached ->
      if (cachedJson == json) return cached
    }
    val loaded = try {
      val arr = JSONArray(json)
      val out = ArrayList<Rule>(arr.length())
      for (i in 0 until arr.length()) {
        val obj = arr.optJSONObject(i) ?: continue
        out.add(
          Rule(
            id = obj.optString("id", ""),
            enabled = obj.optBoolean("enabled", true),
            kind = obj.optString("kind", ""),
            method = obj.optString("method", "GET").uppercase(),
            scheme = obj.optString("scheme", "https").lowercase(),
            host = obj.optString("host", ""),
            path = obj.optString("path", "/").ifEmpty { "/" },
            query = obj.optString("query", ""),
            pathMatch = obj.optString("pathMatch", "exact").ifBlank { "exact" },
            matchHeaders = parseHeaders(obj.optJSONObject("matchHeaders")),
            delayMs = obj.optLong("delayMs", 0L).coerceIn(0L, MAX_DELAY_MS),
            bodyMode = obj.optString("bodyMode", "body").ifBlank { "body" },
            status = obj.optInt("status", 200),
            contentType = obj.optString("contentType", ""),
            headers = parseHeaders(obj.optJSONObject("headers")),
            bodyText = obj.optString("bodyText", ""),
            createdAt = obj.optLong("createdAt", 0L),
          ),
        )
      }
      out
    } catch (_: Exception) {
      emptyList()
    }
    cachedJson = json
    cachedRules = loaded
    return loaded
  }

  fun find(
    context: Context,
    kind: String,
    method: String,
    scheme: String,
    host: String,
    path: String,
    query: String,
    requestHeaders: Map<String, String> = emptyMap(),
  ): Rule? {
    val normalizedPath = path.ifEmpty { "/" }
    return load(context).firstOrNull { rule ->
      rule.enabled &&
        rule.kind == kind &&
        rule.method.equals(method, ignoreCase = true) &&
        rule.scheme.equals(scheme, ignoreCase = true) &&
        rule.host.equals(host, ignoreCase = true) &&
        pathMatches(rule, normalizedPath) &&
        queryMatches(rule, query) &&
        headersMatch(rule.matchHeaders, requestHeaders)
    }
  }

  private fun pathMatches(rule: Rule, path: String): Boolean {
    return if (rule.pathMatch.equals("regex", ignoreCase = true)) {
      try {
        Regex(rule.path).containsMatchIn(path)
      } catch (_: Exception) {
        false
      }
    } else {
      rule.path == path
    }
  }

  private fun queryMatches(rule: Rule, query: String): Boolean {
    if (rule.query.isEmpty()) return true
    return rule.query == query
  }

  private fun headersMatch(
    required: Map<String, String>,
    actual: Map<String, String>,
  ): Boolean {
    if (required.isEmpty()) return true
    for ((name, expected) in required) {
      val trimmedName = name.trim()
      if (trimmedName.isEmpty()) continue
      val value = actual.entries.firstOrNull { it.key.equals(trimmedName, ignoreCase = true) }?.value
        ?: return false
      if (expected.isNotEmpty() && !value.contains(expected, ignoreCase = true)) {
        return false
      }
    }
    return true
  }

  fun rewriteRequest(
    headers: Map<String, String>,
    rule: Rule,
  ): Pair<Map<String, String>, ByteArray> {
    val body = rule.bodyBytes()
    val next = LinkedHashMap<String, String>()
    headers.forEach { (k, v) ->
      val lower = k.lowercase()
      if (lower == "content-length" || lower == "transfer-encoding" || lower == "content-type") {
        return@forEach
      }
      next[k] = v
    }
    if (!rule.isStatusOnly() && rule.contentType.isNotBlank()) {
      next["Content-Type"] = rule.contentType
    }
    next["Content-Length"] = body.size.toString()
    mergeHeaders(next, rule.headers)
    // Hop-by-hop: body size always wins; never leave chunked encoding after rewrite.
    removeHeaderIgnoreCase(next, "transfer-encoding")
    removeHeaderIgnoreCase(next, "content-length")
    next["Content-Length"] = body.size.toString()
    return next to body
  }

  private fun parseHeaders(obj: JSONObject?): Map<String, String> {
    if (obj == null) return emptyMap()
    val out = LinkedHashMap<String, String>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val name = key.trim()
      if (name.isEmpty()) continue
      out[name] = obj.optString(key, "")
    }
    return out
  }

  /** Merge/set: non-blank value replaces (case-insensitive name); blank value removes. */
  private fun mergeHeaders(
    target: MutableMap<String, String>,
    overrides: Map<String, String>,
  ) {
    overrides.forEach { (name, value) ->
      val trimmedName = name.trim()
      if (trimmedName.isEmpty()) return@forEach
      removeHeaderIgnoreCase(target, trimmedName)
      if (value.trim().isNotEmpty()) {
        target[trimmedName] = value
      }
    }
  }

  private fun removeHeaderIgnoreCase(target: MutableMap<String, String>, name: String) {
    val lower = name.lowercase()
    val keys = target.keys.filter { it.equals(lower, ignoreCase = true) }
    keys.forEach { target.remove(it) }
  }
}
