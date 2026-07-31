package expo.modules.lenswireproxy

import android.app.Activity
import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LenswireProxyModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var pendingStartPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("LenswireProxy")

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_VPN) return@OnActivityResult
      val promise = pendingStartPromise
      pendingStartPromise = null
      if (promise == null) return@OnActivityResult
      if (payload.resultCode == Activity.RESULT_OK) {
        resolveStart(promise)
      } else {
        promise.reject("VPN_PERMISSION_DENIED", "VPN permission was denied", null)
      }
    }

    Function("isSimulator") {
      Build.FINGERPRINT.contains("generic") ||
        Build.MODEL.contains("Emulator") ||
        Build.MODEL.contains("Android SDK") ||
        Build.MANUFACTURER.contains("Genymotion") ||
        Build.PRODUCT.contains("sdk") ||
        Build.PRODUCT.contains("google_sdk") ||
        Build.HARDWARE.contains("goldfish") ||
        Build.HARDWARE.contains("ranchu")
    }

    Function("getStatus") {
      VpnController.status()
    }

    Function("setRecordingPaused") { paused: Boolean ->
      CaptureStore.setRecordingPaused(paused)
    }

    Function("getRecordingPaused") {
      CaptureStore.isRecordingPaused()
    }

    Function("getDiagnostics") {
      val status = VpnController.status()
      mapOf(
        "status" to status,
        "lastError" to ProxyRuntime.lastError,
        "runtime" to ProxyRuntime.diagnostics,
      )
    }

    AsyncFunction("startCapture") { promise: Promise ->
      val prepare = VpnController.prepareIntent(context)
      if (prepare != null) {
        val activity = appContext.currentActivity
        if (activity == null) {
          promise.reject("VPN_PERMISSION_REQUIRED", "No activity to request VPN permission", null)
          return@AsyncFunction
        }
        pendingStartPromise = promise
        @Suppress("DEPRECATION")
        activity.startActivityForResult(prepare, REQUEST_VPN)
        return@AsyncFunction
      }
      resolveStart(promise)
    }

    AsyncFunction("stopCapture") { promise: Promise ->
      try {
        VpnController.stop(context)
        ProxyRuntime.status = "stopped"
        ProxyRuntime.lastError = null
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("VPN_STOP_FAILED", e.message ?: "Failed to stop", e)
      }
    }

    AsyncFunction("sendProbe") { probeType: String?, useHttps: Boolean?, promise: Promise ->
      try {
        VpnController.sendProbe(context, probeType, useHttps)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("PROBE_FAILED", e.message ?: "Probe failed", e)
      }
    }

    Function("getCertificateInfo") {
      CertificateManager.info(context)
    }

    AsyncFunction("generateCertificate") { promise: Promise ->
      try {
        promise.resolve(CertificateManager.generate(context))
      } catch (e: Exception) {
        promise.reject("CA_GENERATE_FAILED", e.message ?: "Generate failed", e)
      }
    }

    Function("getCertificateInstallUrl") {
      null
    }

    Function("getCertificatePemPath") {
      CertificateManager.pemPath(context)
    }

    Function("getCertificateExportPath") {
      CertificateManager.exportPath(context)
    }

    AsyncFunction("installCertificate") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("CA_INSTALL_FAILED", "No activity available", null)
        return@AsyncFunction
      }
      val ok = VpnController.openInstallCertificate(activity)
      if (ok) {
        promise.resolve(null)
      } else {
        promise.reject("CA_INSTALL_FAILED", "Generate the CA first", null)
      }
    }

    Function("getProxyPort") {
      CaptureStore.PROXY_PORT
    }

    Function("getCapturesRevision") {
      CaptureStore.revision(context)
    }

    AsyncFunction("getCaptures") {
      CaptureStore.read(context, summaries = true)
    }

    AsyncFunction("getCapture") { id: String ->
      CaptureStore.readOne(context, id)
    }

    Function("clearCaptures") {
      CaptureStore.clear(context)
    }

    Function("setHttpsDecrypt") { enabled: Boolean ->
      context
        .getSharedPreferences("lenswire_settings", Context.MODE_PRIVATE)
        .edit()
        .putBoolean("httpsDecrypt", enabled)
        .apply()
    }

    Function("getHttpsDecrypt") {
      context
        .getSharedPreferences("lenswire_settings", Context.MODE_PRIVATE)
        .getBoolean("httpsDecrypt", true)
    }

    Function("setOverrides") { rulesJson: String ->
      OverrideRules.setJson(context, rulesJson)
    }

    Function("getOverrides") {
      OverrideRules.getJson(context)
    }
  }

  private fun resolveStart(promise: Promise) {
    // VpnService start is async; poll off the UI / activity-result thread.
    Thread {
      try {
        VpnController.start(context)
        VpnController.awaitListening()
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("VPN_START_FAILED", e.message ?: "Failed to start VPN", e)
      }
    }.start()
  }

  companion object {
    private const val REQUEST_VPN = 9910
  }
}
