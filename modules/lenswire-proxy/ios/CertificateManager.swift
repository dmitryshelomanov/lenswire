import Foundation

final class CertificateManager {
  static let shared = CertificateManager()

  func info() -> [String: Any] {
    CertificateAuthority.shared.info()
  }

  func generate() throws -> [String: Any] {
    _ = try CertificateAuthority.shared.generate()
    return CertificateAuthority.shared.info()
  }

  func exportPath() -> String? {
    CertificateAuthority.shared.exportPath()
  }

  func mobileConfigInstallUrl() -> String? {
    CertificateAuthority.shared.mobileConfigInstallUrl()
  }
}
