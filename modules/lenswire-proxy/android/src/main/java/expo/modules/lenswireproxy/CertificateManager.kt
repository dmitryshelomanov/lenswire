package expo.modules.lenswireproxy

import android.content.Context
import android.content.Intent
import android.security.KeyChain
import java.io.File
import java.security.KeyStore

object CertificateManager {
  private const val PREFS = "lenswire_ca"
  private const val KEY_FINGERPRINT = "fingerprint"
  private const val KEY_GENERATED_AT = "generatedAt"
  private const val LEAF_ALIAS_PREFIX = "lenswire-leaf-"
  private val LEAF_PASSWORD = "lenswire".toCharArray()

  fun info(context: Context): Map<String, Any?> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val persistedFingerprint = prefs.getString(KEY_FINGERPRINT, null)
    val generatedAt = prefs.getLong(KEY_GENERATED_AT, 0L)
    val ready = caCertDerFile(context).exists() && SecureCaKeyStore.hasKey(context)
    val fingerprint = if (ready) {
      persistedFingerprint ?: runCatching {
        X509Util.sha256Fingerprint(caCertDerFile(context).readBytes())
      }.getOrNull()
    } else {
      null
    }
    return mapOf(
      "status" to if (ready) "ready" else "not_generated",
      "fingerprint" to fingerprint,
      "generatedAt" to if (ready) generatedAt else null,
      "pemPath" to if (ready) pemFile(context).absolutePath else null,
    )
  }

  fun generate(context: Context): Map<String, Any?> {
    val dir = certsDir(context)
    dir.mkdirs()
    val ca = X509Util.generateCa()
    caCertDerFile(context).writeBytes(ca.certDer)
    SecureCaKeyStore.storePkcs8(context, ca.keyPkcs8)
    pemFile(context).writeText(ca.certPem)
    cerFile(context).writeBytes(ca.certDer)

    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit()
      .putString(KEY_FINGERPRINT, ca.fingerprint)
      .putLong(KEY_GENERATED_AT, System.currentTimeMillis())
      .apply()
    // Drop cached MITM leaves/bypass so new CA is used immediately if VPN is running.
    LenswireVpnService.proxyServer?.clearMitmState()
    return info(context)
  }

  /** DER `.cer` for manual Settings install / share. */
  fun cerPath(context: Context): String? {
    if (!caCertDerFile(context).exists() || !SecureCaKeyStore.hasKey(context)) return null
    val cer = cerFile(context)
    if (!cer.exists()) {
      cer.parentFile?.mkdirs()
      cer.writeBytes(caCertDerFile(context).readBytes())
    }
    return cer.absolutePath
  }

  fun exportPath(context: Context): String? = cerPath(context)

  fun installIntent(context: Context): Intent? {
    if (!caCertDerFile(context).exists() || !SecureCaKeyStore.hasKey(context)) return null
    val cer = cerFile(context)
    if (!cer.exists()) {
      cer.parentFile?.mkdirs()
      cer.writeBytes(caCertDerFile(context).readBytes())
    }
    return KeyChain.createInstallIntent().apply {
      putExtra(KeyChain.EXTRA_CERTIFICATE, cer.readBytes())
      putExtra(KeyChain.EXTRA_NAME, "Lenswire CA")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  fun loadCa(context: Context): X509Util.CaMaterial? {
    val certFile = caCertDerFile(context)
    if (!certFile.exists()) return null
    val keyBytes = SecureCaKeyStore.loadPkcs8(context) ?: return null
    return runCatching {
      X509Util.loadCa(certFile.readBytes(), keyBytes)
    }.getOrNull()
  }

  fun leafKeyStore(context: Context, host: String): KeyStore? {
    val ca = loadCa(context) ?: return null
    val leaf = runCatching { X509Util.issueLeaf(host, ca) }.getOrNull() ?: return null
    return KeyStore.getInstance("PKCS12").apply {
      load(null, null)
      setKeyEntry(
        "$LEAF_ALIAS_PREFIX$host",
        leaf.privateKey,
        LEAF_PASSWORD,
        arrayOf(leaf.certificate, ca.certificate),
      )
    }
  }

  fun leafPassword(): CharArray = LEAF_PASSWORD

  private fun certsDir(context: Context) = File(context.filesDir, "certs")
  private fun pemFile(context: Context) = File(certsDir(context), "lenswire-ca.pem")
  private fun cerFile(context: Context) = File(certsDir(context), "lenswire-ca.cer")
  private fun caCertDerFile(context: Context) = File(certsDir(context), "lenswire-ca.der")
}
