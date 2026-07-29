package expo.modules.lenswireproxy

import android.content.Context

internal data class ClientAttribution(
  val label: String? = null,
  val packageName: String? = null,
  val uid: Int? = null,
  val kind: String? = null,
)

internal object ClientAttributionHeaders {
  private const val LABEL = "X-Lenswire-Client-Label"
  private const val PACKAGE = "X-Lenswire-Client-Package"
  private const val UID = "X-Lenswire-Client-Uid"
  private const val KIND = "X-Lenswire-Client-Attribution-Kind"

  fun probeHeaders(context: Context): Map<String, String> {
    val label = runCatching {
      val appInfo = context.applicationInfo
      context.packageManager.getApplicationLabel(appInfo)?.toString()
    }.getOrNull()?.trim().orEmpty()
    return buildMap {
      put(KIND, "exact")
      if (label.isNotEmpty()) put(LABEL, label)
      put(PACKAGE, context.packageName)
      put(UID, context.applicationInfo.uid.toString())
    }
  }

  fun stripAndExtract(headers: Map<String, String>): Pair<Map<String, String>, ClientAttribution?> {
    if (headers.isEmpty()) return headers to null
    val sanitized = LinkedHashMap<String, String>(headers.size)
    var label: String? = null
    var packageName: String? = null
    var uid: Int? = null
    var kind: String? = null

    for ((key, value) in headers) {
      when {
        key.equals(LABEL, true) -> label = value.trim().ifEmpty { null }
        key.equals(PACKAGE, true) -> packageName = value.trim().ifEmpty { null }
        key.equals(UID, true) -> uid = value.trim().toIntOrNull()
        key.equals(KIND, true) -> kind = value.trim().ifEmpty { null }
        else -> sanitized[key] = value
      }
    }

    val resolvedKind = when {
      kind == "exact" || kind == "heuristic" || kind == "unknown" -> kind
      !label.isNullOrBlank() || !packageName.isNullOrBlank() || uid != null -> "exact"
      else -> null
    }
    val attribution = if (
      label.isNullOrBlank() &&
      packageName.isNullOrBlank() &&
      uid == null &&
      resolvedKind == null
    ) {
      null
    } else {
      ClientAttribution(
        label = label,
        packageName = packageName,
        uid = uid,
        kind = resolvedKind,
      )
    }
    return sanitized to attribution
  }

  fun asCaptureFields(attribution: ClientAttribution?): Map<String, Any?> {
    if (attribution == null) return emptyMap()
    return buildMap {
      if (!attribution.label.isNullOrBlank()) put("clientLabel", attribution.label)
      if (!attribution.packageName.isNullOrBlank()) put("clientPackage", attribution.packageName)
      if (attribution.uid != null) put("clientUid", attribution.uid)
      if (!attribution.kind.isNullOrBlank()) put("clientAttributionKind", attribution.kind)
    }
  }
}
