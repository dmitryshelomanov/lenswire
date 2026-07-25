import ExpoModulesCore

public class LenswireProxyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LenswireProxy")

    Function("isSimulator") { () -> Bool in
      VPNManager.shared.isSimulator
    }

    Function("getStatus") { () -> String in
      VPNManager.shared.getStatus()
    }

    AsyncFunction("startCapture") { (promise: Promise) in
      VPNManager.shared.start { error in
        if let error {
          promise.reject("VPN_START_FAILED", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("stopCapture") { (promise: Promise) in
      VPNManager.shared.stop { error in
        if let error {
          promise.reject("VPN_STOP_FAILED", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("sendProbe") { (promise: Promise) in
      VPNManager.shared.sendProbe { error in
        if let error {
          promise.reject("PROBE_FAILED", error.localizedDescription)
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
        promise.reject("CA_GENERATE_FAILED", error.localizedDescription)
      }
    }

    Function("getCertificateInstallUrl") { () -> String? in
      CertificateManager.shared.mobileConfigInstallUrl()
    }

    Function("getCertificatePemPath") { () -> String? in
      CertificateManager.shared.pemPath()
    }

    AsyncFunction("installCertificate") { (promise: Promise) in
      #if targetEnvironment(simulator)
      promise.reject("CA_INSTALL_FAILED", "On Simulator run: npm run sim:trust-ca")
      #else
      promise.reject("CA_INSTALL_FAILED", "On iOS use Install profile")
      #endif
    }

    Function("getProxyPort") { () -> Int in
      Int(LenswireShared.proxyPort)
    }

    Function("getCaptures") { () -> [[String: Any]] in
      VPNManager.shared.getCaptures()
    }

    Function("clearCaptures") {
      VPNManager.shared.clearCaptures()
    }
  }
}
