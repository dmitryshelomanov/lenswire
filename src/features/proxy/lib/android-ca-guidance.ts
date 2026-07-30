export const ANDROID_TRUST_COMMAND = 'npm run android:trust-ca';

export const ANDROID_CA_INSTALL_PATH =
  'Settings -> Security -> Encryption & credentials -> Install a certificate -> CA certificate';

export const ANDROID_CA_TYPE_WARNING =
  'Choose CA certificate - never VPN and app user certificate. That option needs a private key (.p12); Lenswire CA is a root cert only and Android will show "File is invalid".';

export const IOS_PINNING_NOTE =
  'Apps with certificate pinning reject MITM even after full CA trust. Unpinning requires a jailbreak + Frida / SSL Kill Switch - Lenswire cannot bypass pinning itself.';

export const ANDROID_PINNING_NOTE =
  'System CA (emulator) or User CA trust does not disable certificate pinning. Pinned apps need a separate root + Frida / objection / LSPosed unpin step; Lenswire will keep those flows tunnel-only.';

const BASE_ANDROID_STEPS = [
  'Tap Generate CA, then Install (User store). Prefer Install over opening the .cer from Downloads.',
  `If Install opens nothing: Save certificate -> choose Downloads (or any folder) -> ${ANDROID_CA_INSTALL_PATH}.`,
  ANDROID_CA_TYPE_WARNING,
  'Settings -> HTTPS decryption Enabled -> Start -> open https://example.com',
  'On Android 7+, Chrome ignores User CAs - browser decrypt needs a System CA (emulator only) or disable decryption to browse.',
  'Apps with certificate pinning stay tunnel-only - unpin separately (root + Frida / objection / LSPosed).',
] as const;

const EMULATOR_STEPS = [
  `For Chrome decrypt on this emulator: use an AVD WITHOUT Google Play, then on your Mac run: ${ANDROID_TRUST_COMMAND}`,
  'Confirm Lenswire CA appears under Trusted credentials -> System (not only User).',
  'User CA install alone is NOT enough for Chrome on Android 7+.',
] as const;

export function androidInstallSteps(showEmulatorTrustCa: boolean): readonly string[] {
  return showEmulatorTrustCa ? [...BASE_ANDROID_STEPS, ...EMULATOR_STEPS] : BASE_ANDROID_STEPS;
}

export function androidStoppedSummary(showEmulatorTrustCa: boolean): string {
  if (showEmulatorTrustCa) {
    return 'Generate CA, install as System CA (npm run android:trust-ca), then Start and allow VPN.';
  }
  return 'Generate CA, install as CA certificate, then Start and allow VPN.';
}

export function androidStoppedSetupLines(showEmulatorTrustCa: boolean): string[] {
  const secondLine = showEmulatorTrustCa
    ? '2. Mac: npm run android:trust-ca (System CA, rooted AVD)'
    : '2. Choose CA certificate - not VPN and app user certificate';
  const browserLine = showEmulatorTrustCa
    ? 'User CA alone breaks Chrome while decryption is on - use System CA or disable decrypt.'
    : 'Chrome ignores User CAs on Android 7+ - disable decrypt to browse, or use apps that trust the user store.';
  return [
    '1. Certificate -> Generate CA -> Install (CA certificate)',
    secondLine,
    '3. Start -> allow VPN -> open https://example.com',
    browserLine,
    'Pinned apps: CA trust is not enough - unpin with root + Frida / objection / LSPosed separately.',
  ];
}

export function androidWaitingSummary(recording: boolean, showEmulatorTrustCa: boolean): string {
  if (showEmulatorTrustCa) {
    return `Recording is ${recording ? 'on' : 'paused'}. Open https://example.com after System CA (npm run android:trust-ca). Expect GET/decrypted - not only CONNECT.`;
  }
  return `Recording is ${recording ? 'on' : 'paused'}. Open an app that trusts User CAs, or turn decryption off for Chrome. Expect GET/decrypted - not only CONNECT.`;
}

export function androidChromeWarning(showEmulatorTrustCa: boolean): string {
  if (showEmulatorTrustCa) {
    return 'With only a User CA, Android 7+ browsers show certificate warnings and pages stop loading. Run `npm run android:trust-ca` on a rooted AVD (no Google Play), or turn decryption off to restore browsing.';
  }
  return 'With only a User CA, Android 7+ browsers show certificate warnings and pages stop loading. Turn decryption off to browse with Chrome, or use apps that trust the user store.';
}
