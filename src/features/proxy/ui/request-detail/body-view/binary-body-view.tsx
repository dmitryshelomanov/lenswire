import { View } from 'react-native';

import { formatBytes, type TrafficBody } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

import { BodyMeta, HexBlock } from './common';

export function BinaryBodyView({ body }: { body: TrafficBody }) {
  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      {body.previewBase64 ? (
        <HexBlock base64={body.previewBase64} />
      ) : (
        <Text variant="muted">
          Binary payload · {formatBytes(body.size)} (preview not available)
        </Text>
      )}
    </View>
  );
}
