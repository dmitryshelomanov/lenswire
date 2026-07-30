package expo.modules.lenswireproxy

/**
 * Decides whether ClientHello ALPN is compatible with HTTP/1.1-only MITM.
 * Empty / missing ALPN → allow MITM (many clients omit the extension).
 * Non-empty without http/1.0 or http/1.1 → skip MITM (e.g. h2-only).
 */
internal object MitmAlpn {
  fun allowsHttp11Mitm(alpnProtocols: List<String>?): Boolean {
    if (alpnProtocols.isNullOrEmpty()) return true
    return alpnProtocols.any { name ->
      name.equals("http/1.1", ignoreCase = true) ||
        name.equals("http/1.0", ignoreCase = true)
    }
  }
}
