import { router } from 'expo-router';
import { ChevronRight, Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { DomainGroup } from '@/features/proxy/lib/domain-group';
import { formatRelativeTime } from '@/features/proxy/lib/format-relative-time';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

type Props = {
  group: DomainGroup;
  pinned: boolean;
  onTogglePin: () => void;
};

export function DomainRow({ group, pinned, onTogglePin }: Props) {
  return (
    <Pressable
      className={cn('border-border active:bg-accent/40 border-b px-4 py-3 sm:px-6')}
      onPress={() => router.push(`/domain/${encodeURIComponent(group.host)}`)}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Pressable
            onPress={onTogglePin}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={pinned ? 'Unpin domain' : 'Pin domain'}
          >
            <Icon
              as={Star}
              className={pinned ? 'text-primary' : 'text-muted-foreground'}
              fill={pinned ? 'currentColor' : 'none'}
              size={16}
            />
          </Pressable>
          <Text numberOfLines={1} className="shrink font-mono text-sm">
            {group.host}
          </Text>
        </View>
        <Icon as={ChevronRight} className="text-muted-foreground" size={16} />
      </View>

      <View className="mt-1.5 flex-row items-center gap-2 pl-6">
        <Badge
          label={group.clientName}
          variant={
            group.clientAttributionKind === 'exact'
              ? 'success'
              : group.clientAttributionKind === 'heuristic'
                ? 'outline'
                : 'default'
          }
          className="shrink-0"
        />
        {group.errorCount > 0 ? (
          <Badge label={`${group.errorCount} err`} variant="danger" className="shrink-0" />
        ) : null}
        {group.tunnelOnly ? <Badge label="tunnel" variant="outline" className="shrink-0" /> : null}
        <Text variant="muted" className="ml-auto font-mono text-xs">
          {formatRelativeTime(group.lastSeenAt)}
        </Text>
        <Text variant="muted" className="font-mono text-xs">
          {group.totalRequests}
        </Text>
      </View>
    </Pressable>
  );
}
