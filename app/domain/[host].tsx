import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { filterEntries } from '@/entities/traffic/filter';
import type { TrafficEntry } from '@/entities/traffic/types';
import { resolveTrafficEmptyKind } from '@/features/proxy/lib/traffic-empty-kind';
import { useProxyEntries, useProxyFilters, useProxyStatus } from '@/features/proxy/store';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficRow } from '@/features/proxy/ui/traffic-row';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

type TrafficListItem = {
  entry: TrafficEntry;
  collapsedCount: number;
};

export default function DomainScreen() {
  const { host: encodedHost } = useLocalSearchParams<{ host: string }>();
  const router = useRouter();
  const { status } = useProxyStatus();
  const { entries } = useProxyEntries();
  const { filters } = useProxyFilters();
  const host = decodeHostParam(encodedHost);
  const filtered = filterEntries(entries, filters);
  const byHost = React.useMemo(
    () => filtered.filter((entry) => entry.host === host),
    [filtered, host],
  );
  const compacted = React.useMemo(() => collapseNoisyConnect(byHost), [byHost]);

  const hasActiveFilters =
    filters.query.trim().length > 0 || filters.method !== 'ALL' || filters.statusClass !== 'ALL';

  const emptyKind = resolveTrafficEmptyKind({
    visibleCount: compacted.length,
    hasTraffic: entries.length > 0,
    status,
    hasActiveFilters,
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-border border-b px-4 py-3 sm:px-6">
        <View className="flex-row items-center gap-2">
          <Button variant="ghost" size="icon" onPress={() => router.back()}>
            <Icon as={ArrowLeft} className="text-foreground" size={18} />
          </Button>
          <Text className="font-semibold">Domain</Text>
        </View>
        <Text className="mt-2 font-mono text-sm">{host}</Text>
      </View>

      <TrafficToolbar showControls={false} showFilters />

      {emptyKind ? (
        <TrafficEmptyState kind={emptyKind} />
      ) : (
        <FlatList
          data={compacted}
          keyExtractor={(item) => item.entry.id}
          renderItem={({ item }) => (
            <TrafficRow entry={item.entry} collapsedCount={item.collapsedCount} />
          )}
          className="flex-1"
        />
      )}
    </SafeAreaView>
  );
}

function decodeHostParam(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collapseNoisyConnect(entries: TrafficEntry[]): TrafficListItem[] {
  const grouped: TrafficListItem[] = [];
  const groupByKey = new Map<string, { index: number; oldestStartedAt: number }>();
  const windowMs = 2000;

  for (const entry of entries) {
    if (!isCollapsibleTunnel(entry)) {
      grouped.push({ entry, collapsedCount: 1 });
      continue;
    }

    const key = [entry.host, entry.captureMode, entry.reasonCode, entry.status].join('|');
    const existing = groupByKey.get(key);
    if (existing && existing.oldestStartedAt - entry.startedAt <= windowMs) {
      grouped[existing.index] = {
        ...grouped[existing.index],
        collapsedCount: grouped[existing.index].collapsedCount + 1,
      };
      existing.oldestStartedAt = entry.startedAt;
      continue;
    }

    const index = grouped.length;
    grouped.push({ entry, collapsedCount: 1 });
    groupByKey.set(key, { index, oldestStartedAt: entry.startedAt });
  }

  return grouped;
}

function isCollapsibleTunnel(entry: TrafficEntry): boolean {
  return entry.method === 'CONNECT' && entry.captureMode === 'tunnel';
}
