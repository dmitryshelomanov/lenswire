package expo.modules.lenswireproxy

import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.BasicConstraints
import org.bouncycastle.asn1.x509.ExtendedKeyUsage
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.asn1.x509.KeyPurposeId
import org.bouncycastle.asn1.x509.KeyUsage
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509ExtensionUtils
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.openssl.jcajce.JcaPEMWriter
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.io.StringWriter
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Date

object X509Util {
  data class CaMaterial(
    val certificate: X509Certificate,
    val privateKey: PrivateKey,
    val certDer: ByteArray,
    val keyPkcs8: ByteArray,
    val certPem: String,
    val keyPem: String,
    val fingerprint: String,
  )

  data class LeafMaterial(
    val certificate: X509Certificate,
    val privateKey: PrivateKey,
  )

  fun generateCa(): CaMaterial {
    val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    val now = System.currentTimeMillis()
    val notBefore = Date(now - 60_000L)
    val notAfter = Date(now + 10L * 365 * 24 * 60 * 60 * 1000)
    val subject = X500Name("CN=Lenswire CA,O=Lenswire,C=US")
    val serial = BigInteger(160, java.security.SecureRandom()).abs().max(BigInteger.ONE)
    val extUtils = JcaX509ExtensionUtils()

    val builder = JcaX509v3CertificateBuilder(
      subject,
      serial,
      notBefore,
      notAfter,
      subject,
      keyPair.public,
    )
    builder.addExtension(Extension.basicConstraints, true, BasicConstraints(true))
    builder.addExtension(
      Extension.keyUsage,
      true,
      KeyUsage(KeyUsage.keyCertSign or KeyUsage.cRLSign),
    )
    builder.addExtension(Extension.subjectKeyIdentifier, false, extUtils.createSubjectKeyIdentifier(keyPair.public))

    // Let Android pick a provider that actually exposes SHA256withRSA signing.
    val signer = JcaContentSignerBuilder("SHA256withRSA").build(keyPair.private)
    val cert = JcaX509CertificateConverter().getCertificate(builder.build(signer))
    cert.verify(keyPair.public)
    return caMaterial(cert, keyPair.private)
  }

  fun loadCa(certDer: ByteArray, keyPkcs8: ByteArray): CaMaterial {
    val cert = CertificateFactory.getInstance("X.509")
      .generateCertificate(certDer.inputStream()) as X509Certificate
    val key = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(keyPkcs8))
    return caMaterial(cert, key)
  }

  fun issueLeaf(host: String, ca: CaMaterial): LeafMaterial {
    val leafPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    val now = System.currentTimeMillis()
    val notBefore = Date(now - 60_000L)
    val notAfter = Date(now + 365L * 24 * 60 * 60 * 1000)
    val serial = BigInteger(160, java.security.SecureRandom()).abs().max(BigInteger.ONE)
    val subject = X500Name("CN=$host,O=Lenswire MITM,C=US")
    // Must reuse the CA subject encoding byte-for-byte. Re-parsing
    // X500Principal.name breaks PKIX issuer/subject chaining on Android/BoringSSL.
    val issuer = X500Name.getInstance(ca.certificate.subjectX500Principal.encoded)
    val extUtils = JcaX509ExtensionUtils()

    val builder = JcaX509v3CertificateBuilder(
      issuer,
      serial,
      notBefore,
      notAfter,
      subject,
      leafPair.public,
    )
    builder.addExtension(Extension.basicConstraints, true, BasicConstraints(false))
    builder.addExtension(
      Extension.keyUsage,
      true,
      KeyUsage(KeyUsage.digitalSignature or KeyUsage.keyEncipherment),
    )
    builder.addExtension(
      Extension.extendedKeyUsage,
      false,
      ExtendedKeyUsage(KeyPurposeId.id_kp_serverAuth),
    )
    builder.addExtension(
      Extension.subjectAlternativeName,
      false,
      GeneralNames(GeneralName(GeneralName.dNSName, host)),
    )
    builder.addExtension(
      Extension.subjectKeyIdentifier,
      false,
      extUtils.createSubjectKeyIdentifier(leafPair.public),
    )
    builder.addExtension(
      Extension.authorityKeyIdentifier,
      false,
      extUtils.createAuthorityKeyIdentifier(ca.certificate),
    )

    val signer = JcaContentSignerBuilder("SHA256withRSA").build(ca.privateKey)
    val leafCert = JcaX509CertificateConverter().getCertificate(builder.build(signer))
    leafCert.verify(ca.certificate.publicKey)
    require(leafCert.issuerX500Principal == ca.certificate.subjectX500Principal) {
      "MITM leaf issuer does not match CA subject"
    }
    return LeafMaterial(leafCert, leafPair.private)
  }

  fun sha256Fingerprint(der: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(der)
    return digest.joinToString(":") { "%02X".format(it) }
  }

  private fun caMaterial(cert: X509Certificate, privateKey: PrivateKey): CaMaterial {
    val certDer = cert.encoded
    val keyPkcs8 = privateKey.encoded
    return CaMaterial(
      certificate = cert,
      privateKey = privateKey,
      certDer = certDer,
      keyPkcs8 = keyPkcs8,
      certPem = pemOf(cert),
      keyPem = pemOf(privateKey),
      fingerprint = sha256Fingerprint(certDer),
    )
  }

  private fun pemOf(value: Any): String {
    val writer = StringWriter()
    JcaPEMWriter(writer).use { pem ->
      pem.writeObject(value)
    }
    return writer.toString()
  }
}
