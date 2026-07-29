import { router } from 'expo-router';
import { ChevronRight, Search, Star } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveTrafficEmptyKind } from '@/features/proxy/lib/traffic-empty-kind';
import { useProxyEntries, useProxyPins, useProxyStatus } from '@/features/proxy/store';
import { AppHeader } from '@/features/proxy/ui/app-header';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { FilterSelect } from '@/features/proxy/ui/traffic-toolbar/filter-select';
import type { TrafficEntry } from '@/entities/traffic/types';
import { clientNameOfEntry } from '@/entities/traffic/client-name';
import { cn } from '@/shared/lib/utils';
import { Icon } from '@/shared/ui/icon';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

type DomainGroup = {
  host: string;
  totalRequests: number;
  clientName: string;
};

export default function HomeScreen() {
  const { status } = useProxyStatus();
  const { entries } = useProxyEntries();
  const { pinnedHosts, togglePin } = useProxyPins();
  const [domainQuery, setDomainQuery] = React.useState('');
  const [clientNameFilter, setClientNameFilter] = React.useState<string>('ALL');
  const groups = React.useMemo(() => groupByDomain(entries), [entries]);
  const normalizedDomainQuery = domainQuery.trim().toLowerCase();
  const clientNameOptions = React.useMemo(() => {
    const set = new Set(groups.map((g) => g.clientName).filter(Boolean));
    const values = Array.from(set).sort();
    return [
      { value: 'ALL', label: 'All' },
      ...values.map((v) => ({ value: v, label: v })),
    ];
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    const byQuery = normalizedDomainQuery
      ? groups.filter((group) => group.host.toLowerCase().includes(normalizedDomainQuery))
      : groups;
    const byClient = clientNameFilter === 'ALL' ? byQuery : byQuery.filter((g) => g.clientName === clientNameFilter);
    return [...byClient].sort((a, b) => {
      const ai = pinnedHosts.indexOf(a.host);
      const bi = pinnedHosts.indexOf(b.host);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [groups, normalizedDomainQuery, clientNameFilter, pinnedHosts]);

  const emptyKind = resolveTrafficEmptyKind({
    visibleCount: filteredGroups.length,
    hasTraffic: entries.length > 0,
    status,
    hasActiveFilters:
      (Boolean(normalizedDomainQuery) || clientNameFilter !== 'ALL') && groups.length > 0,
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <AppHeader />
      <TrafficToolbar showControls showFilters={false} />
      <View className="border-border border-b px-4 py-3 sm:px-6">
        <View className="flex-row items-center gap-2">
          <View className="relative flex-1">
            <View className="pointer-events-none absolute top-0 bottom-0 left-3 z-10 justify-center">
              <Icon as={Search} className="text-muted-foreground" size={16} />
            </View>
            <Input
              value={domainQuery}
              onChangeText={setDomainQuery}
              placeholder="Filter domains..."
              className="pl-9"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <FilterSelect
            title="Client"
            valueLabel={clientNameFilter === 'ALL' ? 'All' : clientNameFilter}
            active={clientNameFilter !== 'ALL'}
            options={clientNameOptions}
            selected={clientNameFilter}
            onSelect={setClientNameFilter}
          />
        </View>
      </View>
      {emptyKind ? (
        <TrafficEmptyState kind={emptyKind} />
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.host}
          renderItem={({ item }) => {
            const pinned = pinnedHosts.includes(item.host);
            return (
              <Pressable
                className={cn('border-border active:bg-accent/40 border-b px-4 py-3 sm:px-6')}
                onPress={() => router.push(`/domain/${encodeURIComponent(item.host)}`)}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <Pressable
                      onPress={() => togglePin(item.host)}
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
                      {item.host}
                    </Text>
                    <Badge label={item.clientName} variant="outline" className="shrink-0" />
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Text variant="muted" className="font-mono text-xs">
                      {item.totalRequests}
                    </Text>
                    <Icon as={ChevronRight} className="text-muted-foreground" size={16} />
                  </View>
                </View>
              </Pressable>
            );
          }}
          className="flex-1"
        />
      )}
    </SafeAreaView>
  );
}

function groupByDomain(entries: TrafficEntry[]): DomainGroup[] {
  const ordered: DomainGroup[] = [];
  const byHost = new Map<string, { group: DomainGroup; counts: Map<string, number>; bestCount: number }>();

  for (const entry of entries) {
    const existing = byHost.get(entry.host);
    if (existing) {
      existing.group.totalRequests += 1;
      const name = clientNameOfEntry(entry);
      const prev = existing.counts.get(name) ?? 0;
      const nextCount = prev + 1;
      existing.counts.set(name, nextCount);
      if (nextCount > existing.bestCount) {
        existing.bestCount = nextCount;
        existing.group.clientName = name;
      }
      continue;
    }

    const next: DomainGroup = {
      host: entry.host,
      totalRequests: 1,
      clientName: clientNameOfEntry(entry),
    };
    const counts = new Map<string, number>();
    const initialName = next.clientName;
    counts.set(initialName, 1);
    byHost.set(entry.host, { group: next, counts, bestCount: 1 });
    ordered.push(next);
  }

  return ordered;
}
