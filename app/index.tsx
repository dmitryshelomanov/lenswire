import { CircleHelp, Search } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DomainGroup } from '@/features/proxy/lib/domain-group';
import { groupByDomain } from '@/features/proxy/lib/domain-group';
import { resolveTrafficEmptyKind } from '@/features/proxy/lib/traffic-empty-kind';
import { useProxyEntries, useProxyPins, useProxyStatus } from '@/features/proxy/store';
import { AppHeader } from '@/features/proxy/ui/app-header';
import {
  CaptureStatusesIntro,
  loadCaptureStatusesIntroSeen,
} from '@/features/proxy/ui/capture-statuses-intro';
import { DomainRow } from '@/features/proxy/ui/domain-row';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { FilterChip } from '@/features/proxy/ui/traffic-toolbar/filter-chip';
import { FilterSelect } from '@/features/proxy/ui/traffic-toolbar/filter-select';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

type CaptureFilter = 'ALL' | 'decrypted' | 'tunnel' | 'bypassed' | 'skipped';

const CAPTURE_FILTERS: { value: CaptureFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'decrypted', label: 'Decrypted' },
  { value: 'tunnel', label: 'Tunnel' },
  { value: 'bypassed', label: 'Bypassed' },
  { value: 'skipped', label: 'Skipped' },
];

function matchesCaptureFilter(group: DomainGroup, filter: CaptureFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'decrypted':
      return !group.tunnelOnly;
    case 'tunnel':
      return group.tunnelOnly;
    case 'bypassed':
      return group.hasBypass;
    case 'skipped':
      return group.hasSkipped;
  }
}

export default function HomeScreen() {
  const { status } = useProxyStatus();
  const { entries } = useProxyEntries();
  const { pinnedHosts, togglePin } = useProxyPins();
  const [domainQuery, setDomainQuery] = React.useState('');
  const [clientNameFilter, setClientNameFilter] = React.useState<string>('ALL');
  const [captureFilter, setCaptureFilter] = React.useState<CaptureFilter>('ALL');
  const [introOpen, setIntroOpen] = React.useState(false);
  const groups = React.useMemo(() => groupByDomain(entries), [entries]);

  React.useEffect(() => {
    let mounted = true;
    loadCaptureStatusesIntroSeen()
      .then((seen) => {
        if (mounted && !seen) setIntroOpen(true);
      })
      .catch(() => {
        // Ignore storage errors; skip auto-show.
      });
    return () => {
      mounted = false;
    };
  }, []);
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
    const byCapture = byClient.filter((g) => matchesCaptureFilter(g, captureFilter));
    return [...byCapture].sort((a, b) => {
      const ai = pinnedHosts.indexOf(a.host);
      const bi = pinnedHosts.indexOf(b.host);
      if (ai === -1 && bi === -1) return b.lastSeenAt - a.lastSeenAt;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [groups, normalizedDomainQuery, clientNameFilter, captureFilter, pinnedHosts]);

  const emptyKind = resolveTrafficEmptyKind({
    visibleCount: filteredGroups.length,
    hasTraffic: entries.length > 0,
    status,
    hasActiveFilters:
      (Boolean(normalizedDomainQuery) || clientNameFilter !== 'ALL' || captureFilter !== 'ALL') &&
      groups.length > 0,
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <AppHeader />
      <TrafficToolbar showControls showFilters={false} />
      <View className="border-border border-b px-4 py-3 sm:px-6">
        <View className="flex-row flex-wrap items-center gap-2">
          <View className="min-w-[12rem] flex-1 flex-row items-center gap-2 rounded-md border border-input bg-background px-3 min-h-10 shadow-sm shadow-black/5">
            <Icon as={Search} className="shrink-0 text-muted-foreground" size={16} />
            <Input
              value={domainQuery}
              onChangeText={setDomainQuery}
              placeholder="Filter domains..."
              className="min-h-0 w-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 shadow-none"
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
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {CAPTURE_FILTERS.map((item) => (
            <FilterChip
              key={item.value}
              label={item.label}
              active={captureFilter === item.value}
              onPress={() => setCaptureFilter(item.value)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="What capture statuses mean"
            onPress={() => setIntroOpen(true)}
            className="border-border h-8 w-8 items-center justify-center rounded-md border"
            hitSlop={8}
          >
            <Icon as={CircleHelp} className="text-muted-foreground" size={16} />
          </Pressable>
        </View>
      </View>
      <CaptureStatusesIntro open={introOpen} onClose={() => setIntroOpen(false)} />
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
          initialNumToRender={16}
          windowSize={8}
          maxToRenderPerBatch={12}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}
