const {
  withAndroidManifest,
  AndroidConfig,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'with-user-ca';
const PACKAGE_VERSION = '1.3.0';

/**
 * Trust User CA store via networkSecurityConfig so MITM works after
 * Lenswire Install CA (no System CA / no bundled @raw CA).
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
      const xmlDest = path.join(xmlDestDir, 'network_security_config.xml');

      await fs.promises.mkdir(xmlDestDir, { recursive: true });
      await fs.promises.copyFile(xmlSrc, xmlDest);

      // Remove leftover bundled CA from older builds.
      for (const name of ['lenswire_ca.pem', 'lenswire_ca.cer']) {
        const stale = path.join(rawDestDir, name);
        if (fs.existsSync(stale)) {
          await fs.promises.unlink(stale);
        }
      }

      return config;
    },
  ]);
}

module.exports = createRunOncePlugin(withUserCa, PACKAGE_NAME, PACKAGE_VERSION);
