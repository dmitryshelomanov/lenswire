import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as React from 'react';
import { Alert, Linking, Share } from 'react-native';

import type { CertificateInfo } from '@/entities/traffic/types';
import {
  getCertificateExportPath,
  getCertificateInstallUrl,
  installCertificate,
} from '@/shared/api/native-proxy';

import {
  ANDROID_CA_INSTALL_PATH,
  ANDROID_CA_TYPE_WARNING,
  ANDROID_TRUST_COMMAND,
} from '../lib/android-ca-guidance';

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

type UseCertificateActionsArgs = {
  certificate: CertificateInfo;
  isAndroid: boolean;
  showEmulatorTrustCa: boolean;
  onGenerate: () => void;
};

export function useCertificateActions({
  certificate,
  isAndroid,
  showEmulatorTrustCa,
  onGenerate,
}: UseCertificateActionsArgs) {
  const [copied, setCopied] = React.useState(false);

  const copyFingerprint = React.useCallback(async () => {
    if (!certificate.fingerprint) return;
    await Share.share({ message: certificate.fingerprint });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [certificate.fingerprint]);

  const handleGenerate = React.useCallback(() => {
    onGenerate();
  }, [onGenerate]);

  const onInstall = React.useCallback(async () => {
    if (isAndroid) {
      try {
        await installCertificate();
        const emulatorHint = showEmulatorTrustCa
          ? '\n\nFor Chrome decrypt on this emulator, run on your Mac:\n\n' +
            ANDROID_TRUST_COMMAND +
            '\n\nThen verify Trusted credentials -> System.'
          : '\n\nChrome ignores User CAs on Android 7+. Use apps that trust user CAs, or disable decryption to browse.';
        Alert.alert(
          'User CA install',
          'This installs into the User trust store.' +
            emulatorHint +
            '\n\nIf nothing opened: Save certificate -> ' +
            ANDROID_CA_INSTALL_PATH +
            '.\n\n' +
            ANDROID_CA_TYPE_WARNING,
          showEmulatorTrustCa
            ? [
                {
                  text: 'Share command',
                  onPress: () => {
                    void Share.share({ message: ANDROID_TRUST_COMMAND });
                  },
                },
                { text: 'OK', style: 'cancel' },
              ]
            : [{ text: 'OK', style: 'cancel' }],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert(
          'Unable to install CA',
          `${message}\n\nUse Save certificate, then ${ANDROID_CA_INSTALL_PATH}.\n\n${ANDROID_CA_TYPE_WARNING}`,
        );
      }
      return;
    }

    const url = getCertificateInstallUrl();
    if (!url) {
      Alert.alert('Certificate not ready', 'Generate the CA first, then try Install again.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          'Unable to open profile',
          'This device cannot open the configuration profile URL. Try Save certificate, or retry on a physical iPhone.',
        );
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Unable to open profile', message);
    }
  }, [isAndroid, showEmulatorTrustCa]);

  const onSave = React.useCallback(async () => {
    const exportPath = getCertificateExportPath();
    if (!exportPath) {
      Alert.alert(
        'Certificate not ready',
        'Generate the CA first, then try Save certificate again.',
      );
      return;
    }

    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'This device cannot share files.');
        return;
      }

      const source = new File(toFileUri(exportPath));
      if (!source.exists) {
        Alert.alert('Certificate file missing', 'Generate the CA again, then retry Save.');
        return;
      }

      const shareFile = new File(Paths.cache, source.name);
      await source.copy(shareFile, { overwrite: true });
      await Sharing.shareAsync(shareFile.uri, {
        mimeType: isAndroid ? 'application/x-x509-ca-cert' : 'application/x-pem-file',
        UTI: isAndroid ? 'public.x509-certificate' : 'public.pem',
        dialogTitle: 'Lenswire CA',
      });

      if (isAndroid) {
        Alert.alert(
          'Install as CA certificate',
          `After saving, open Settings and install via:\n\n${ANDROID_CA_INSTALL_PATH}\n\n${ANDROID_CA_TYPE_WARNING}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Unable to save certificate', message);
    }
  }, [isAndroid]);

  return {
    copied,
    copyFingerprint,
    onGenerate: handleGenerate,
    onInstall,
    onSave,
  };
}
