import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, Download, ShieldCheck, Smartphone } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAndroidCaContext } from '@/features/proxy/hooks/use-android-ca-context';
import { useCertificateActions } from '@/features/proxy/hooks/use-certificate-actions';
import {
  ANDROID_PINNING_NOTE,
  androidInstallSteps,
  IOS_PINNING_NOTE,
} from '@/features/proxy/lib/android-ca-guidance';
import { useProxyCertificate, useProxySettings } from '@/features/proxy/store';
import { AndroidChromeCallout } from '@/features/proxy/ui/certificate/android-chrome-callout';
import { CertificateFingerprintCard } from '@/features/proxy/ui/certificate/certificate-fingerprint-card';
import { InstallStepsList } from '@/features/proxy/ui/certificate/install-steps-list';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ScreenHeader } from '@/shared/ui/screen-header';
import { Separator } from '@/shared/ui/separator';
import { Text } from '@/shared/ui/text';

const IOS_DEVICE_STEPS = [
  'Tap Generate CA, then Install.',
  'Settings → General → VPN & Device Management → Install profile.',
  'Settings → General → About → Certificate Trust Settings → enable full trust.',
  'Optional: Save certificate to export the PEM file.',
  'Tap Start on the home screen and allow VPN.',
];

export default function CertificateScreen() {
  const router = useRouter();
  const { certificate, busy, generateCertificate } = useProxyCertificate();
  const { settings, updateSettings } = useProxySettings();
  const { isAndroid, showEmulatorTrustCa } = useAndroidCaContext();
  const ready = certificate.status === 'ready';
  const installSteps = isAndroid ? androidInstallSteps(showEmulatorTrustCa) : IOS_DEVICE_STEPS;
  const platformLabel = isAndroid ? 'Android' : 'iOS';
  const { copied, copyFingerprint, onGenerate, onInstall, onSave } = useCertificateActions({
    certificate,
    isAndroid,
    showEmulatorTrustCa,
    onGenerate: () => void generateCertificate(),
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenHeader
        title="Certificate"
        onBack={() => router.back()}
        backIcon={<Icon as={ArrowLeft} className="text-foreground" size={18} />}
      />

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
            <AndroidChromeCallout
              showEmulatorTrustCa={showEmulatorTrustCa}
              decryptEnabled={settings.httpsDecrypt}
              onDisableDecrypt={() => updateSettings({ httpsDecrypt: false })}
            />
          ) : null}
          <View className="border-border bg-muted/40 gap-2 rounded-md border p-3">
            <Text className="font-medium">Pinned apps need Frida</Text>
            <Text variant="muted">{isAndroid ? ANDROID_PINNING_NOTE : IOS_PINNING_NOTE}</Text>
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            <Button disabled={busy} onPress={onGenerate}>
              <Text>{ready ? 'Regenerate CA' : 'Generate CA'}</Text>
            </Button>
            <Button variant="outline" disabled={!ready} onPress={() => void onInstall()}>
              <Icon as={Smartphone} className="text-foreground" size={14} />
              <Text>Install</Text>
            </Button>
            <Button variant="outline" disabled={!ready} onPress={() => void onSave()}>
              <Icon as={Download} className="text-foreground" size={14} />
              <Text>Save certificate</Text>
            </Button>
          </View>
          <Button
            variant="ghost"
            size="sm"
            disabled={!ready}
            onPress={copyFingerprint}
            className="self-start"
          >
            <Icon as={Copy} className="text-foreground" size={14} />
            <Text>{copied ? 'Shared' : 'Share fingerprint'}</Text>
          </Button>
        </View>

        <CertificateFingerprintCard certificate={certificate} />

        <Separator />

        <InstallStepsList platformLabel={platformLabel} steps={installSteps} />
      </ScrollView>
    </SafeAreaView>
  );
}
