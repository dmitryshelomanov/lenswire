import { Image, View } from 'react-native';

import { formatBytes, type TrafficBody } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

import { BodyMeta, HexBlock } from './common';

export function ImageBodyView({ body }: { body: TrafficBody }) {
  const uri = body.previewBase64 ? `data:image/*;base64,${body.previewBase64}` : null;
  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      {uri ? (
        <View className="bg-muted/50 border-border items-center rounded-md border p-3">
          <Image
            source={{ uri }}
            style={{ width: '100%', height: 220 }}
            resizeMode="contain"
            accessibilityLabel="Response image preview"
          />
        </View>
      ) : (
        <Text variant="muted">
          Image payload · {formatBytes(body.size)} (preview not available)
        </Text>
      )}
      {body.previewBase64 ? <HexBlock base64={body.previewBase64} /> : null}
    </View>
  );
}
