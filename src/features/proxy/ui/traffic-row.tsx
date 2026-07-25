import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { methodBadgeVariant, statusBadgeVariant } from '@/entities/traffic/badges';
import {
  formatBytes,
  formatDuration,
  type TrafficEntry,
} from '@/entities/traffic/types';
import { Badge } from '@/shared/ui/badge';
import { Text } from '@/shared/ui/text';

type Props = {
  entry: TrafficEntry;
};

export function TrafficRow({ entry }: Props) {
  const time = new Date(entry.startedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <Link href={`/request/${entry.id}`} asChild>
      <Pressable className="border-border active:bg-accent/40 border-b px-4 py-3 sm:px-6">
        <View className="flex-row items-center gap-2">
          <Badge label={entry.method} variant={methodBadgeVariant(entry.method)} />
          <Badge label={String(entry.status)} variant={statusBadgeVariant(entry.status)} />
          <Text variant="muted" className="ml-auto font-mono text-xs">
            {time}
          </Text>
        </View>
        <Text className="mt-2 font-mono text-sm" numberOfLines={1}>
          <Text className="text-muted-foreground">{entry.host}</Text>
          <Text>{entry.path}</Text>
          {entry.query ? <Text className="text-muted-foreground">?{entry.query}</Text> : null}
        </Text>
        <View className="mt-1.5 flex-row gap-3">
          <Text variant="muted" className="font-mono text-xs">
            {formatDuration(entry.timing.totalMs)}
          </Text>
          <Text variant="muted" className="font-mono text-xs">
            {formatBytes(entry.responseBody.size)}
          </Text>
          <Text variant="muted" className="font-mono text-xs uppercase">
            {entry.scheme}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
