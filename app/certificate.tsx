import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, ShieldCheck, Smartphone, Terminal } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as React from 'react';
import { Alert, Linking, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProxyStore } from '@/features/proxy/store';
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

const IOS_SIM_STEPS = [
  'Tap Generate CA (writes Dev CA PEM into the app container).',
  'On your Mac run: npm run sim:trust-ca',
  'Start capture, then Send test request (or Mac proxy + Safari http://example.com).',
  'Packet Tunnel VPN still requires a physical iPhone + paid Developer team.',
];

const ANDROID_STEPS = [
  'Tap Generate CA, then Install CA (system install dialog).',
  'Name the credential “Lenswire CA” and confirm.',
  'Note: Android 7+ user CAs are ignored by many apps (same as Proxyman).',
  'Start → allow VPN → Send test request (or emulator http-proxy for browser traffic).',
];

const SIM_TRUST_COMMAND = 'npm run sim:trust-ca';

export default function CertificateScreen() {
  const router = useRouter();
  const { certificate, generateCertificate, simulator } = useProxyStore();
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ready = certificate.status === 'ready';
  const isAndroid = Platform.OS === 'android';

  const installSteps = isAndroid
    ? ANDROID_STEPS
    : simulator
      ? IOS_SIM_STEPS
      : IOS_DEVICE_STEPS;

  const platformLabel = isAndroid ? 'Android' : simulator ? 'Simulator' : 'iOS';

  const copyFingerprint = React.useCallback(async () => {
    if (!certificate.fingerprint) return;
    await Clipboard.setStringAsync(certificate.fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [certificate.fingerprint]);

  const onGenerate = React.useCallback(async () => {
    setBusy(true);
    try {
      await generateCertificate();
    } finally {
      setBusy(false);
    }
  }, [generateCertificate]);

  const onInstall = React.useCallback(async () => {
    if (isAndroid) {
      try {
        await installCertificate();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert('Unable to install CA', message);
      }
      return;
    }

    if (simulator) {
      Alert.alert(
        'Trust CA on Simulator',
        `file:// .mobileconfig cannot be opened here.\n\nFrom the project root on your Mac:\n\n${SIM_TRUST_COMMAND}\n\nThis runs: xcrun simctl keychain booted add-root-cert`,
        [
          {
            text: 'Copy command',
            onPress: () => {
              void Clipboard.setStringAsync(SIM_TRUST_COMMAND);
            },
          },
          { text: 'OK', style: 'cancel' },
        ],
      );
      return;
    }

    const url = getCertificateInstallUrl();
    if (!url) {
      Alert.alert('Certificate not ready', 'Generate the CA first, then try Install profile again.');
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
  }, [isAndroid, simulator]);

  const installLabel = isAndroid
    ? 'Install CA'
    : simulator
      ? 'Trust via CLI'
      : 'Install profile';

  return (
    <SafeAreaView className="dark flex-1 bg-background">
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
              label={ready ? 'Ready' : 'Not generated'}
              variant={ready ? 'success' : 'warning'}
            />
          </View>
          <Text variant="muted">
            Generate a local root certificate on this device to decrypt HTTPS traffic.
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Button disabled={busy} onPress={onGenerate}>
            <Text>{ready ? 'Regenerate CA' : 'Generate CA'}</Text>
          </Button>
          <Button variant="outline" disabled={!ready} onPress={() => void onInstall()}>
            <Icon
              as={simulator && !isAndroid ? Terminal : Smartphone}
              className="text-foreground"
              size={14}
            />
            <Text>{installLabel}</Text>
          </Button>
          <Button variant="outline" disabled={!ready} onPress={copyFingerprint}>
            <Icon as={Copy} className="text-foreground" size={14} />
            <Text>{copied ? 'Copied' : 'Copy fingerprint'}</Text>
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
