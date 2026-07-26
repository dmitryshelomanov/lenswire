package expo.modules.lenswireproxy

import android.content.Context
import android.content.Intent
import android.security.KeyChain
import android.util.Base64
import java.io.File
import java.security.MessageDigest

object CertificateManager {
  private const val PREFS = "lenswire_ca"
  private const val KEY_FINGERPRINT = "fingerprint"
  private const val KEY_GENERATED_AT = "generatedAt"

  // Same Dev CA as iOS Simulator trust material.
  private val EMBEDDED_PEM = """
    -----BEGIN CERTIFICATE-----
    MIIDVTCCAj2gAwIBAgIUMibGFbliLlhmTeQirY8DuakGnGIwDQYJKoZIhvcNAQEL
    BQAwOjEYMBYGA1UEAwwPTGVuc3dpcmUgRGV2IENBMREwDwYDVQQKDAhMZW5zd2ly
    ZTELMAkGA1UEBhMCVVMwHhcNMjYwNzI3MTMxODUwWhcNMzYwNzI0MTMxODUwWjA6
    MRgwFgYDVQQDDA9MZW5zd2lyZSBEZXYgQ0ExETAPBgNVBAoMCExlbnN3aXJlMQsw
    CQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMlrQjS7
    YnaYwX1Oa4VERtLRW7ZbXa9tktP4TNhMD86+PC8je9kOnIZqoOBEzU6jgQ+68hjU
    XzITRIOUmameWD+wRNS6wgkxz1f3PhcoiUmSDO6mCcKvFTIgR4yE237wdi6hjKWC
    ERzZlRdR8vdSqG/t4AHqGX985QNsEJdkxuQF4EJSkFkqg7d+xkSbXn/Vnrw3li+l
    suP8e2jetdWccORDx+RdWY7Bbx3ZBP3JC6scmFKA+L2tfH1BtBPiiwmhteciP6TV
    VZ/lTx8oQ9Bv9wCzHZ8KsSyfjSrIUo8/Kd6kpuF8f6tBPioE8DuhFpj5A5AfT9HE
    G6ByiJopqtmy/A0CAwEAAaNTMFEwHQYDVR0OBBYEFJJ85kbxzZGhunSjs6Sdx2D2
    Q6XdMB8GA1UdIwQYMBaAFJJ85kbxzZGhunSjs6Sdx2D2Q6XdMA8GA1UdEwEB/wQF
    MAMBAf8wDQYJKoZIhvcNAQELBQADggEBAIY04eokjXrBuKv2bgPpAwEj+HWr22n4
    hUpMh7bzcap00Zihj77Iu9D84OEzs0OQ0DC69nPSQmkdFZE5+ifi3d2u6nUY0mlN
    ZfglAKSG4Do880ThCPAlQyvdEML8QuuRvMWMHDBnhBe1nGgdTbn1CH1Z/7hI/zXT
    e2kn+UooexoSxeqO7SmGBH8o9uneS1PAEhObt2J9fBOJ7kElV0pTk/+YOzJS60Yc
    IPof15Vj/aY1ls52b4T06ZzJLMZav4YU35dYL9bqhZ1gGlsu+qORgPz9u0cA1Kg0
    iua+Qm3B0T9Q6FkBkmDhtdwoYWgNcj3UQZYmDnlEon1sSpOgrP2NHCw=
    -----END CERTIFICATE-----
  """.trimIndent()

  private const val EMBEDDED_FINGERPRINT =
    "B1:3E:75:29:97:D2:3A:8A:2E:59:49:07:CF:10:4C:F7:CC:3C:C6:C8:0E:D2:C5:29:53:FD:55:01:23:61:97:D5"

  fun info(context: Context): Map<String, Any?> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val fingerprint = prefs.getString(KEY_FINGERPRINT, null)
    val generatedAt = prefs.getLong(KEY_GENERATED_AT, 0L)
    val ready = fingerprint != null
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
    pemFile(context).writeText(EMBEDDED_PEM)
    cerFile(context).writeBytes(pemToDer(EMBEDDED_PEM))

    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit()
      .putString(KEY_FINGERPRINT, EMBEDDED_FINGERPRINT)
      .putLong(KEY_GENERATED_AT, System.currentTimeMillis())
      .apply()
    return info(context)
  }

  fun pemPath(context: Context): String? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getString(KEY_FINGERPRINT, null) == null) return null
    val file = pemFile(context)
    if (!file.exists()) {
      file.parentFile?.mkdirs()
      file.writeText(EMBEDDED_PEM)
    }
    return file.absolutePath
  }

  fun installIntent(context: Context): Intent? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getString(KEY_FINGERPRINT, null) == null) return null
    val cer = cerFile(context)
    if (!cer.exists()) {
      cer.parentFile?.mkdirs()
      cer.writeBytes(pemToDer(EMBEDDED_PEM))
    }
    return KeyChain.createInstallIntent().apply {
      putExtra(KeyChain.EXTRA_CERTIFICATE, cer.readBytes())
      putExtra(KeyChain.EXTRA_NAME, "Lenswire CA")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

  private fun certsDir(context: Context) = File(context.filesDir, "certs")
  private fun pemFile(context: Context) = File(certsDir(context), "lenswire-ca.pem")
  private fun cerFile(context: Context) = File(certsDir(context), "lenswire-ca.cer")

  private fun pemToDer(pem: String): ByteArray {
    val b64 = pem
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace("\\s".toRegex(), "")
    return Base64.decode(b64, Base64.DEFAULT)
  }

  @Suppress("unused")
  private fun sha256Fingerprint(der: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(der)
    return digest.joinToString(":") { "%02X".format(it) }
  }
}
