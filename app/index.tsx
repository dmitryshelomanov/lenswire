import { Search } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { groupByDomain } from '@/features/proxy/lib/domain-group';
import { resolveTrafficEmptyKind } from '@/features/proxy/lib/traffic-empty-kind';
import { useProxyEntries, useProxyPins, useProxyStatus } from '@/features/proxy/store';
import { AppHeader } from '@/features/proxy/ui/app-header';
import { DomainRow } from '@/features/proxy/ui/domain-row';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { FilterSelect } from '@/features/proxy/ui/traffic-toolbar/filter-select';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

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
    return [{ value: 'ALL', label: 'All' }, ...values.map((v) => ({ value: v, label: v }))];
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    const byQuery = normalizedDomainQuery
      ? groups.filter((group) => group.host.toLowerCase().includes(normalizedDomainQuery))
      : groups;
    const byClient =
      clientNameFilter === 'ALL'
        ? byQuery
        : byQuery.filter((g) => g.clientName === clientNameFilter);
    return [...byClient].sort((a, b) => {
      const ai = pinnedHosts.indexOf(a.host);
      const bi = pinnedHosts.indexOf(b.host);
      if (ai === -1 && bi === -1) return b.lastSeenAt - a.lastSeenAt;
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
        <TrafficEmptyState kind={emptyKind} filteredHint="domain" />
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.host}
          renderItem={({ item }) => (
            <DomainRow
              group={item}
              pinned={pinnedHosts.includes(item.host)}
              onTogglePin={() => togglePin(item.host)}
            />
          )}
          className="flex-1"
        />
      )}
    </SafeAreaView>
  );
}
