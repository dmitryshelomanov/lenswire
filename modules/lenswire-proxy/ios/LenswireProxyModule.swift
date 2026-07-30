import ExpoModulesCore

private final class RejectException: Exception {
  private let message: String

  init(_ code: String, _ message: String) {
    self.message = message
    super.init(name: code, description: message, code: code)
  }

  override var reason: String { message }
}

public class LenswireProxyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LenswireProxy")

    Function("getStatus") { () -> String in
      VPNManager.shared.getStatus()
    }

    Function("getDiagnostics") { () -> [String: Any] in
      [
        "status": VPNManager.shared.getStatus(),
        "lastError": NSNull(),
        "runtime": [
          "mode": "packet_tunnel",
          "proxyPort": Int(LenswireShared.proxyPort),
        ],
      ]
    }

    AsyncFunction("startCapture") { (promise: Promise) in
      VPNManager.shared.start { error in
        if let error {
          promise.reject(RejectException("VPN_START_FAILED", error.localizedDescription))
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("stopCapture") { (promise: Promise) in
      VPNManager.shared.stop { error in
        if let error {
          promise.reject(RejectException("VPN_STOP_FAILED", error.localizedDescription))
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("sendProbe") { (probeType: String?, useHttps: Bool?, promise: Promise) in
      VPNManager.shared.sendProbe(probeType: probeType, useHttps: useHttps) { error in
        if let error {
          let message = error.localizedDescription.isEmpty
            ? String(describing: error)
            : error.localizedDescription
          promise.reject(RejectException("PROBE_FAILED", message))
        } else {
          promise.resolve(nil)
        }
      }
    }

    Function("getCertificateInfo") { () -> [String: Any] in
      CertificateManager.shared.info()
    }

    AsyncFunction("generateCertificate") { (promise: Promise) in
      do {
        let info = try CertificateManager.shared.generate()
        promise.resolve(info)
      } catch {
        promise.reject(RejectException("CA_GENERATE_FAILED", error.localizedDescription))
      }
    }

    Function("getCertificateInstallUrl") { () -> String? in
      CertificateManager.shared.mobileConfigInstallUrl()
    }

    Function("getCertificatePemPath") { () -> String? in
      CertificateManager.shared.pemPath()
    }

    Function("getCertificateExportPath") { () -> String? in
      CertificateManager.shared.exportPath()
    }

    AsyncFunction("installCertificate") { (promise: Promise) in
      promise.reject(RejectException("CA_INSTALL_FAILED", "On iOS use Install profile"))
    }

    Function("getProxyPort") { () -> Int in
      Int(LenswireShared.proxyPort)
    }

    Function("getCapturesRevision") { () -> Int in
      Int(VPNManager.shared.getCapturesRevision())
    }

    AsyncFunction("getCaptures") { () -> [[String: Any]] in
      VPNManager.shared.getCaptures()
    }

    AsyncFunction("getCapture") { (id: String) -> [String: Any]? in
      VPNManager.shared.getCapture(id: id)
    }

    Function("clearCaptures") {
      VPNManager.shared.clearCaptures()
    }

    Function("setHttpsDecrypt") { (enabled: Bool) in
      LenswireShared.httpsDecryptEnabled = enabled
    }

    Function("getHttpsDecrypt") { () -> Bool in
      LenswireShared.httpsDecryptEnabled
    }

    Function("setOverrides") { (rulesJson: String) in
      LenswireShared.overridesJson = rulesJson
    }

    Function("getOverrides") { () -> String in
      LenswireShared.overridesJson
    }
  }
}
