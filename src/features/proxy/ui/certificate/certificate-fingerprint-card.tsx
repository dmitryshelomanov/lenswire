import { View } from 'react-native';

import type { CertificateInfo } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

export function CertificateFingerprintCard({ certificate }: { certificate: CertificateInfo }) {
  if (certificate.status !== 'ready') return null;
  return (
    <View className="bg-muted/40 border-border gap-2 rounded-md border p-4">
      <Text variant="small" className="text-muted-foreground">
        SHA-256 fingerprint
      </Text>
      <Text className="font-mono text-xs leading-5">{certificate.fingerprint}</Text>
      {certificate.generatedAt ? (
        <Text variant="muted">Generated {new Date(certificate.generatedAt).toLocaleString()}</Text>
      ) : null}
    </View>
  );
}
