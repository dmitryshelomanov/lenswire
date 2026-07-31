package expo.modules.lenswireproxy

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object OverrideRules {
  private const val PREFS = "lenswire_settings"
  private const val KEY = "overrides"

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
    val status: Int,
    val contentType: String,
    val headers: Map<String, String>,
    val bodyText: String,
    val createdAt: Long,
  ) {
    fun bodyBytes(): ByteArray = bodyText.toByteArray(Charsets.UTF_8)

    fun responseHeaders(): Map<String, String> {
      val headers = LinkedHashMap<String, String>()
      if (contentType.isNotBlank()) {
        headers["Content-Type"] = contentType
      }
      mergeHeaders(headers, this.headers)
      // Writers always set Content-Length / Connection; drop hop-by-hop from the rule.
      removeHeaderIgnoreCase(headers, "content-length")
      removeHeaderIgnoreCase(headers, "transfer-encoding")
      return headers
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
  ): Rule? {
    val normalizedPath = path.ifEmpty { "/" }
    return load(context).firstOrNull { rule ->
      rule.enabled &&
        rule.kind == kind &&
        rule.method.equals(method, ignoreCase = true) &&
        rule.scheme.equals(scheme, ignoreCase = true) &&
        rule.host.equals(host, ignoreCase = true) &&
        rule.path == normalizedPath &&
        rule.query == query
    }
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
    if (rule.contentType.isNotBlank()) {
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

  fun toJsonArray(rules: List<Rule>): String {
    val arr = JSONArray()
    rules.forEach { rule ->
      arr.put(
        JSONObject()
          .put("id", rule.id)
          .put("enabled", rule.enabled)
          .put("kind", rule.kind)
          .put("method", rule.method)
          .put("scheme", rule.scheme)
          .put("host", rule.host)
          .put("path", rule.path)
          .put("query", rule.query)
          .put("status", rule.status)
          .put("contentType", rule.contentType)
          .put("headers", headersToJson(rule.headers))
          .put("bodyText", rule.bodyText)
          .put("createdAt", rule.createdAt),
      )
    }
    return arr.toString()
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

  private fun headersToJson(headers: Map<String, String>): JSONObject {
    val obj = JSONObject()
    headers.forEach { (key, value) ->
      obj.put(key, value)
    }
    return obj
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
