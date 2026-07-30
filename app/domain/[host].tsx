import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Copy, Star } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { filterEntries } from '@/entities/traffic/filter';
import type { TrafficEntry } from '@/entities/traffic/types';
import { useCopiedFeedback } from '@/features/proxy/hooks/use-copied-feedback';
import { summarizeHost } from '@/features/proxy/lib/domain-group';
import { formatRelativeTime } from '@/features/proxy/lib/format-relative-time';
import { resolveTrafficEmptyKind } from '@/features/proxy/lib/traffic-empty-kind';
import {
  useProxyEntries,
  useProxyFilters,
  useProxyPins,
  useProxyStatus,
} from '@/features/proxy/store';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficRow } from '@/features/proxy/ui/traffic-row';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { Badge } from '@/shared/ui/badge';
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
  const { pinnedHosts, togglePin } = useProxyPins();
  const { copied, copy } = useCopiedFeedback();
  const [hideConnect, setHideConnect] = React.useState(false);
  const host = decodeHostParam(encodedHost);
  const pinned = pinnedHosts.includes(host);
  const summary = React.useMemo(() => summarizeHost(entries, host), [entries, host]);

  const filtered = filterEntries(entries, filters);
  const byHost = React.useMemo(
    () => filtered.filter((entry) => entry.host === host),
    [filtered, host],
  );
  const withoutConnect = React.useMemo(
    () => (hideConnect ? byHost.filter((entry) => entry.method !== 'CONNECT') : byHost),
    [byHost, hideConnect],
  );
  const compacted = React.useMemo(() => collapseNoisyConnect(withoutConnect), [withoutConnect]);

  const hasActiveFilters =
    filters.query.trim().length > 0 ||
    filters.method !== 'ALL' ||
    (filters.resourceType != null && filters.resourceType !== 'ALL') ||
    filters.statusClass !== 'ALL' ||
    filters.scheme !== 'ALL' ||
    filters.captureMode !== 'ALL' ||
    filters.overriddenOnly ||
    hideConnect;

  const emptyKind = resolveTrafficEmptyKind({
    visibleCount: compacted.length,
    hasTraffic: entries.some((e) => e.host === host),
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
          <Text numberOfLines={1} className="min-w-0 flex-1 font-mono text-sm font-semibold">
            {host}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => togglePin(host)}
            accessibilityLabel={pinned ? 'Unpin domain' : 'Pin domain'}
          >
            <Icon
              as={Star}
              className={pinned ? 'text-primary' : 'text-muted-foreground'}
              fill={pinned ? 'currentColor' : 'none'}
              size={18}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => void copy(host)}
            accessibilityLabel="Copy host"
          >
            <Icon
              as={copied ? Check : Copy}
              className={copied ? 'text-primary' : 'text-foreground'}
              size={18}
            />
          </Button>
        </View>

        {summary ? (
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <Badge
              label={summary.clientName}
              variant={
                summary.clientAttributionKind === 'exact'
                  ? 'success'
                  : summary.clientAttributionKind === 'heuristic'
                    ? 'outline'
                    : 'default'
              }
            />
            <Text variant="muted" className="font-mono text-xs">
              {summary.totalRequests} {summary.totalRequests === 1 ? 'request' : 'requests'}
            </Text>
            {summary.errorCount > 0 ? (
              <Badge label={`${summary.errorCount} err`} variant="danger" />
            ) : null}
            {summary.tunnelOnly ? <Badge label="tunnel" variant="outline" /> : null}
            <Text variant="muted" className="font-mono text-xs">
              {formatRelativeTime(summary.lastSeenAt)}
            </Text>
          </View>
        ) : null}

        <View className="mt-3">
          <Button
            variant={hideConnect ? 'secondary' : 'outline'}
            size="sm"
            onPress={() => setHideConnect((v) => !v)}
          >
            <Text>{hideConnect ? 'Showing without CONNECT' : 'Hide CONNECT'}</Text>
          </Button>
        </View>
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
