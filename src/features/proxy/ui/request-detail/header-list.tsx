import { View } from 'react-native';

import type { HeaderMap } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

export function HeaderList({ headers }: { headers: HeaderMap }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <Text variant="muted">(none)</Text>;
  }
  return (
    <View className="gap-2">
      {entries.map(([key, value]) => (
        <View key={key} className="gap-0.5">
          <Text className="font-mono text-xs text-sky-400">{key}</Text>
          <Text className="font-mono text-sm">{value}</Text>
        </View>
      ))}
    </View>
  );
}
