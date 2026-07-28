/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'network-packet-tunnel',
  name: 'network-packet-tunnel',
  displayName: 'Lenswire Tunnel',
  bundleIdentifier: '.network-packet-tunnel',
  deploymentTarget: '16.0',
  frameworks: ['NetworkExtension', 'Network', 'Security'],
  entitlements: {
    'com.apple.developer.networking.networkextension': ['packet-tunnel-provider'],
    'com.apple.security.application-groups': ['group.com.lenswire.app'],
  },
});
