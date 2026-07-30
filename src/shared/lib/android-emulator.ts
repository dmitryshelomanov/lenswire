import { Platform } from 'react-native';

type AndroidPlatformConstants = {
  Fingerprint?: string;
  Model?: string;
  Brand?: string;
  Manufacturer?: string;
};

/**
 * Best-effort AVD/emulator detection from RN Platform.constants.
 * Gates emulator-only System CA guidance (`npm run android:trust-ca`).
 */
export function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') return false;

  const {
    Fingerprint = '',
    Model = '',
    Brand = '',
    Manufacturer = '',
  } = Platform.constants as AndroidPlatformConstants;

  const fingerprint = Fingerprint.toLowerCase();
  const model = Model.toLowerCase();
  const manufacturer = Manufacturer.toLowerCase();

  return (
    Fingerprint.startsWith('generic') ||
    Fingerprint.startsWith('unknown') ||
    fingerprint.includes('emulator') ||
    fingerprint.includes('sdk_gphone') ||
    model.includes('google_sdk') ||
    model.includes('emulator') ||
    model.includes('android sdk built for x86') ||
    model.includes('sdk_gphone') ||
    manufacturer.includes('genymotion') ||
    (Brand.startsWith('generic') && model.includes('sdk'))
  );
}
