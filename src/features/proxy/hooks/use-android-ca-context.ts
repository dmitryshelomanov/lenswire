import { Platform } from 'react-native';

import { isAndroidEmulator } from '@/shared/lib/android-emulator';

import { ANDROID_TRUST_COMMAND } from '../lib/android-ca-guidance';

export function useAndroidCaContext() {
  const isAndroid = Platform.OS === 'android';
  const showEmulatorTrustCa = isAndroid && isAndroidEmulator();
  return {
    isAndroid,
    showEmulatorTrustCa,
    trustCommand: ANDROID_TRUST_COMMAND,
  };
}
