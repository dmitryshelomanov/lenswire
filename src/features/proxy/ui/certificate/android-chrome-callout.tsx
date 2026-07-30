import { Share, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Text } from '@/shared/ui/text';

import { ANDROID_TRUST_COMMAND } from '../../lib/android-ca-guidance';

type AndroidChromeCalloutProps = {
  showEmulatorTrustCa: boolean;
  decryptEnabled: boolean;
  onDisableDecrypt: () => void;
};

export function AndroidChromeCallout({
  showEmulatorTrustCa,
  decryptEnabled,
  onDisableDecrypt,
}: AndroidChromeCalloutProps) {
  if (showEmulatorTrustCa) {
    return (
      <View className="border-border bg-amber-500/10 gap-2 rounded-md border p-3">
        <Text className="font-medium text-amber-700 dark:text-amber-300">
          Chrome needs System CA
        </Text>
        <Text variant="muted">
          On Android 7+, Chrome ignores User CAs. Install alone causes browser warnings (certificate
          is not trusted...) and pages fail while decryption is on.
        </Text>
        <Text className="font-mono text-xs">{ANDROID_TRUST_COMMAND}</Text>
        <Text variant="muted">
          Emulator only: rooted AVD without Google Play. After reboot, check Trusted credentials →
          System.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => void Share.share({ message: ANDROID_TRUST_COMMAND })}
          >
            <Text>Share command</Text>
          </Button>
          {decryptEnabled ? (
            <Button variant="outline" size="sm" onPress={onDisableDecrypt}>
              <Text>Disable decryption</Text>
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="border-border bg-amber-500/10 gap-2 rounded-md border p-3">
      <Text className="font-medium text-amber-700 dark:text-amber-300">
        Chrome ignores User CAs
      </Text>
      <Text variant="muted">
        On Android 7+, browsers ignore User CAs. Install as CA certificate for apps that trust the
        user store. Turn decryption off if you need to browse with Chrome.
      </Text>
      {decryptEnabled ? (
        <Button variant="outline" size="sm" onPress={onDisableDecrypt}>
          <Text>Disable decryption</Text>
        </Button>
      ) : null}
    </View>
  );
}
