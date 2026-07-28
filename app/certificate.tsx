import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, ShieldCheck, Smartphone } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Linking, Platform, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProxyCertificate, useProxySettings } from '@/features/proxy/store';
import { getCertificateInstallUrl, installCertificate } from '@/shared/api/native-proxy';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Separator } from '@/shared/ui/separator';
import { Text } from '@/shared/ui/text';

const IOS_DEVICE_STEPS = [
  'Tap Generate CA, then Install profile.',
  'Settings → General → VPN & Device Management → Install profile.',
  'Settings → General → About → Certificate Trust Settings → enable full trust.',
  'Tap Start on the home screen and allow VPN.',
];

const ANDROID_STEPS = [
  'Tap Generate CA.',
  'For Chrome decrypt on emulator: use an AVD WITHOUT Google Play, then on your Mac run: npm run android:trust-ca',
  'Confirm Lenswire CA appears under Trusted credentials → System (not only User).',
  'Settings → HTTPS decryption Enabled → Start → open https://example.com',
  'Install CA (User store) alone is NOT enough on Android 7+ — Chrome will show certificate warnings.',
  'Apps with certificate pinning stay tunnel-only even with System CA — unpin separately (root + Frida / objection / LSPosed).',
];

const IOS_PINNING_NOTE =
  'Apps with certificate pinning reject MITM even after full CA trust. Unpinning requires a jailbreak + Frida / SSL Kill Switch — Lenswire cannot bypass pinning itself.';

const ANDROID_PINNING_NOTE =
  'System CA fixes Chrome/browser trust. It does not disable certificate pinning. Pinned apps need a separate root + Frida / objection / LSPosed unpin step; Lenswire will keep those flows tunnel-only.';

const ANDROID_TRUST_COMMAND = 'npm run android:trust-ca';

export default function CertificateScreen() {
  const router = useRouter();
  const { certificate, busy, generateCertificate } = useProxyCertificate();
  const { settings, updateSettings } = useProxySettings();
  const [copied, setCopied] = React.useState(false);
  const ready = certificate.status === 'ready';
  const isAndroid = Platform.OS === 'android';

  const installSteps = isAndroid ? ANDROID_STEPS : IOS_DEVICE_STEPS;
  const platformLabel = isAndroid ? 'Android' : 'iOS';

  const copyFingerprint = React.useCallback(async () => {
    if (!certificate.fingerprint) return;
    await Share.share({ message: certificate.fingerprint });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [certificate.fingerprint]);

  const onGenerate = React.useCallback(() => {
    void generateCertificate();
  }, [generateCertificate]);

  const onInstall = React.useCallback(async () => {
    if (isAndroid) {
      try {
        await installCertificate();
        Alert.alert(
          'User CA install',
          'This installs into the User trust store. Chrome on Android 7+ ignores User CAs.\n\nFor emulator decrypt, run on your Mac:\n\n' +
            ANDROID_TRUST_COMMAND +
            '\n\nThen verify Trusted credentials → System.',
          [
            {
              text: 'Share command',
              onPress: () => {
                void Share.share({ message: ANDROID_TRUST_COMMAND });
              },
            },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Unable to install CA', message);
      }
      return;
    }

    const url = getCertificateInstallUrl();
    if (!url) {
      Alert.alert(
        'Certificate not ready',
        'Generate the CA first, then try Install profile again.',
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          'Unable to open profile',
          'This device cannot open the configuration profile URL. Try again on a physical iPhone.',
        );
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Unable to open profile', message);
    }
  }, [isAndroid]);

  const installLabel = isAndroid ? 'Install CA (User)' : 'Install profile';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="text-foreground" size={18} />
        </Button>
        <Text className="text-lg font-semibold">Certificate</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 py-6 sm:px-6">
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <Icon as={ShieldCheck} className="text-foreground" size={20} />
            <Text className="font-semibold">Lenswire CA</Text>
            <Badge
              label={ready ? 'Generated' : 'Not generated'}
              variant={ready ? 'success' : 'warning'}
            />
          </View>
          <Text variant="muted">
            Generate a local root certificate on this device to decrypt HTTPS traffic.
          </Text>
          {isAndroid ? (
            <View className="border-border bg-amber-500/10 gap-2 rounded-md border p-3">
              <Text className="font-medium text-amber-700 dark:text-amber-300">
                Chrome needs System CA
              </Text>
              <Text variant="muted">
                On Android 7+, Chrome ignores User CAs. Install CA (User) alone causes browser
                warnings (“certificate is not trusted…”) and pages fail while decryption is on.
              </Text>
              <Text className="font-mono text-xs">{ANDROID_TRUST_COMMAND}</Text>
              <Text variant="muted">
                Requires a rooted AVD without Google Play. After reboot, check Trusted credentials →
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
                {settings.httpsDecrypt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => updateSettings({ httpsDecrypt: false })}
                  >
                    <Text>Disable decryption</Text>
                  </Button>
                ) : null}
              </View>
            </View>
          ) : null}
          <View className="border-border bg-muted/40 gap-2 rounded-md border p-3">
            <Text className="font-medium">Pinned apps need Frida</Text>
            <Text variant="muted">{isAndroid ? ANDROID_PINNING_NOTE : IOS_PINNING_NOTE}</Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Button disabled={busy} onPress={onGenerate}>
            <Text>{ready ? 'Regenerate CA' : 'Generate CA'}</Text>
          </Button>
          <Button variant="outline" disabled={!ready} onPress={() => void onInstall()}>
            <Icon as={Smartphone} className="text-foreground" size={14} />
            <Text>{installLabel}</Text>
          </Button>
          <Button variant="outline" disabled={!ready} onPress={copyFingerprint}>
            <Icon as={Copy} className="text-foreground" size={14} />
            <Text>{copied ? 'Shared' : 'Share fingerprint'}</Text>
          </Button>
        </View>

        {ready ? (
          <View className="bg-muted/40 border-border gap-2 rounded-md border p-4">
            <Text variant="small" className="text-muted-foreground">
              SHA-256 fingerprint
            </Text>
            <Text className="font-mono text-xs leading-5">{certificate.fingerprint}</Text>
            {certificate.generatedAt ? (
              <Text variant="muted">
                Generated {new Date(certificate.generatedAt).toLocaleString()}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Separator />

        <View className="gap-6">
          <Text className="font-semibold">Install instructions</Text>
          <View className="gap-2">
            <Text variant="small" className="text-muted-foreground uppercase tracking-wide">
              {platformLabel}
            </Text>
            {installSteps.map((step, index) => (
              <Text key={step} variant="muted">
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
