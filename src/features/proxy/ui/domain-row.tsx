import { router } from 'expo-router';
import { ChevronRight, Star } from 'lucide-react-native';
import * as React from 'react';
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

function DomainRowImpl({ group, pinned, onTogglePin }: Props) {
  return (
    <View className={cn('border-border border-b px-4 py-3 sm:px-6')}>
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
          <Pressable
            className="min-w-0 flex-1 flex-row items-center gap-2 active:opacity-80"
            onPress={() => router.push(`/domain/${encodeURIComponent(group.host)}`)}
          >
            <Text numberOfLines={1} className="shrink font-mono text-sm">
              {group.host}
            </Text>
            <Icon as={ChevronRight} className="ml-auto text-muted-foreground" size={16} />
          </Pressable>
        </View>
      </View>

      <Pressable
        className="mt-1.5 flex-row items-center gap-2 pl-6 active:opacity-80"
        onPress={() => router.push(`/domain/${encodeURIComponent(group.host)}`)}
      >
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
        {group.hasBypass ? (
          <Badge label="bypassed" variant="outline" className="shrink-0" />
        ) : group.hasSkipped ? (
          <Badge label="skipped" variant="outline" className="shrink-0" />
        ) : group.tunnelOnly ? (
          <Badge label="tunnel" variant="outline" className="shrink-0" />
        ) : null}
        <Text variant="muted" className="ml-auto font-mono text-xs">
          {formatRelativeTime(group.lastSeenAt)}
        </Text>
        <Text variant="muted" className="font-mono text-xs">
          {group.totalRequests}
        </Text>
      </Pressable>
    </View>
  );
}

export const DomainRow = React.memo(DomainRowImpl);
