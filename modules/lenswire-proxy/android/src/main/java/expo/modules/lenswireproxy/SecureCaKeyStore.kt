package expo.modules.lenswireproxy

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Protects the CA PKCS#8 private key with an AES key held in Android Keystore.
 * Ciphertext lives on disk; the wrapping key never leaves the Keystore.
 */
internal object SecureCaKeyStore {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val WRAP_ALIAS = "lenswire-ca-wrap"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val GCM_TAG_BITS = 128
  private const val IV_BYTES = 12

  fun encryptedKeyFile(context: Context): File =
    File(File(context.filesDir, "certs"), "lenswire-ca.key.enc")

  fun plaintextKeyFile(context: Context): File =
    File(File(context.filesDir, "certs"), "lenswire-ca.key")

  fun hasKey(context: Context): Boolean =
    encryptedKeyFile(context).exists() || plaintextKeyFile(context).exists()

  fun storePkcs8(context: Context, pkcs8: ByteArray) {
    val dir = File(context.filesDir, "certs")
    dir.mkdirs()
    val secret = getOrCreateWrapKey()
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, secret)
    val iv = cipher.iv
    val ciphertext = cipher.doFinal(pkcs8)
    val payload = ByteArray(IV_BYTES + ciphertext.size)
    System.arraycopy(iv, 0, payload, 0, IV_BYTES)
    System.arraycopy(ciphertext, 0, payload, IV_BYTES, ciphertext.size)
    encryptedKeyFile(context).writeBytes(payload)
    plaintextKeyFile(context).delete()
  }

  fun loadPkcs8(context: Context): ByteArray? {
    val enc = encryptedKeyFile(context)
    if (enc.exists()) {
      return runCatching { decrypt(enc.readBytes()) }.getOrNull()
    }
    val plain = plaintextKeyFile(context)
    if (!plain.exists()) return null
    val bytes = runCatching { plain.readBytes() }.getOrNull() ?: return null
    // Migrate legacy plaintext key into Keystore-wrapped storage.
    runCatching { storePkcs8(context, bytes) }
    return bytes
  }

  private fun decrypt(payload: ByteArray): ByteArray {
    require(payload.size > IV_BYTES) { "Encrypted CA key payload too short" }
    val iv = payload.copyOfRange(0, IV_BYTES)
    val ciphertext = payload.copyOfRange(IV_BYTES, payload.size)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateWrapKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
    return cipher.doFinal(ciphertext)
  }

  private fun getOrCreateWrapKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    val existing = keyStore.getKey(WRAP_ALIAS, null) as? SecretKey
    if (existing != null) return existing

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    val builder = KeyGenParameterSpec.Builder(
      WRAP_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      builder.setUnlockedDeviceRequired(false)
    }
    keyGenerator.init(builder.build())
    return keyGenerator.generateKey()
  }
}
