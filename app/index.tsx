import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { filterEntries } from '@/entities/traffic/filter';
import { AppHeader } from '@/features/proxy/ui/app-header';
import { TrafficEmptyState } from '@/features/proxy/ui/traffic-empty';
import { TrafficRow } from '@/features/proxy/ui/traffic-row';
import { TrafficToolbar } from '@/features/proxy/ui/traffic-toolbar';
import { useProxyStore } from '@/features/proxy/store';

export default function HomeScreen() {
  const { status, entries, filters } = useProxyStore();
  const filtered = filterEntries(entries, filters);
  const hasActiveFilters =
    filters.query.trim().length > 0 ||
    filters.method !== 'ALL' ||
    filters.statusClass !== 'ALL';

  let emptyKind: 'stopped' | 'empty' | 'filtered' | null = null;
  if (filtered.length === 0) {
    if (status === 'stopped' && entries.length === 0) emptyKind = 'stopped';
    else if (entries.length === 0) emptyKind = 'empty';
    else if (hasActiveFilters) emptyKind = 'filtered';
    else emptyKind = 'empty';
  }

  return (
    <SafeAreaView className="dark flex-1 bg-background">
      <AppHeader />
      <TrafficToolbar />
      {emptyKind ? (
        <TrafficEmptyState kind={emptyKind} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TrafficRow entry={item} />}
          className="flex-1"
        />
      )}
    </SafeAreaView>
  );
}
