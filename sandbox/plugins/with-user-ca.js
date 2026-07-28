const {
  withAndroidManifest,
  AndroidConfig,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'with-user-ca';
const PACKAGE_VERSION = '1.2.0';

/**
 * Trust User CA store + bundled Lenswire CA (@raw/lenswire_ca) so MITM works
 * without System CA. Run `npm run sync:ca` before prebuild/build.
 *
 * Bundles PEM (res/raw/lenswire_ca.pem) — Android NSC loads PEM reliably.
 */
function withUserCa(config) {
  config = withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const xmlDestDir = path.join(platformRoot, 'app/src/main/res/xml');
      const rawDestDir = path.join(platformRoot, 'app/src/main/res/raw');
      const xmlSrc = path.join(projectRoot, 'plugins/network_security_config.xml');
      const pemSrc = path.join(projectRoot, 'plugins/raw/lenswire_ca.pem');
      const cerSrc = path.join(projectRoot, 'plugins/raw/lenswire_ca.cer');
      const xmlDest = path.join(xmlDestDir, 'network_security_config.xml');
      const pemDest = path.join(rawDestDir, 'lenswire_ca.pem');

      let source = pemSrc;
      if (!fs.existsSync(source) && fs.existsSync(cerSrc)) {
        // Fallback: convert DER → PEM during prebuild if sync wrote only .cer
        const { execFileSync } = require('child_process');
        execFileSync('openssl', [
          'x509',
          '-in',
          cerSrc,
          '-inform',
          'DER',
          '-out',
          pemSrc,
          '-outform',
          'PEM',
        ]);
        source = pemSrc;
      }

      if (!fs.existsSync(source)) {
        throw new Error(
          'Missing plugins/raw/lenswire_ca.pem. In Lenswire: Generate CA, then from sandbox run: npm run sync:ca',
        );
      }

      await fs.promises.mkdir(xmlDestDir, { recursive: true });
      await fs.promises.mkdir(rawDestDir, { recursive: true });
      await fs.promises.copyFile(xmlSrc, xmlDest);
      await fs.promises.copyFile(source, pemDest);

      // Drop stale DER raw resource from older builds so only PEM remains.
      const staleCer = path.join(rawDestDir, 'lenswire_ca.cer');
      if (fs.existsSync(staleCer)) {
        await fs.promises.unlink(staleCer);
      }

      return config;
    },
  ]);
}

module.exports = createRunOncePlugin(withUserCa, PACKAGE_NAME, PACKAGE_VERSION);
