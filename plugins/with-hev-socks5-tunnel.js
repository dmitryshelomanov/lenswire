/**
 * Marker plugin: HevSocks5Tunnel is linked by `npm run prebuild:ios` → scripts/link-hev-ios.js
 * after @bacons/apple-targets creates the Packet Tunnel target.
 */
const { createRunOncePlugin } = require('@expo/config-plugins');

function withHevSocks5Tunnel(config) {
  return config;
}

module.exports = createRunOncePlugin(withHevSocks5Tunnel, 'with-hev-socks5-tunnel', '1.0.4');
