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
import { cn } from '@/shared/lib/utils';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

type DomainGroup = {
  host: string;
  totalRequests: number;
};

export default function HomeScreen() {
  const { status } = useProxyStatus();
  const { entries } = useProxyEntries();
  const { pinnedHosts, togglePin } = useProxyPins();
  const [domainQuery, setDomainQuery] = React.useState('');
  const groups = React.useMemo(() => groupByDomain(entries), [entries]);
  const normalizedDomainQuery = domainQuery.trim().toLowerCase();
  const filteredGroups = React.useMemo(() => {
    const filtered = normalizedDomainQuery
      ? groups.filter((group) => group.host.toLowerCase().includes(normalizedDomainQuery))
      : groups;
    return [...filtered].sort((a, b) => {
      const ai = pinnedHosts.indexOf(a.host);
      const bi = pinnedHosts.indexOf(b.host);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [groups, normalizedDomainQuery, pinnedHosts]);

  const emptyKind = resolveTrafficEmptyKind({
    visibleCount: filteredGroups.length,
    hasTraffic: entries.length > 0,
    status,
    hasActiveFilters: Boolean(normalizedDomainQuery) && groups.length > 0,
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <AppHeader />
      <TrafficToolbar showControls showFilters={false} />
      <View className="border-border border-b px-4 py-3 sm:px-6">
        <View className="relative">
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
                    <Text className="shrink font-mono text-sm">{item.host}</Text>
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

function groupByDomain(entries: { host: string }[]): DomainGroup[] {
  const ordered: DomainGroup[] = [];
  const byHost = new Map<string, DomainGroup>();

  for (const entry of entries) {
    const existing = byHost.get(entry.host);
    if (existing) {
      existing.totalRequests += 1;
      continue;
    }

    const next: DomainGroup = {
      host: entry.host,
      totalRequests: 1,
    };
    byHost.set(entry.host, next);
    ordered.push(next);
  }

  return ordered;
}
