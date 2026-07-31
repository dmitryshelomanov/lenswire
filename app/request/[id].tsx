import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrafficEntry } from '@/entities/traffic/types';
import { useProxyEntries } from '@/features/proxy/store';
import {
  DETAIL_TABS,
  type DetailTab,
  OverviewTab,
  RequestDetailHeader,
  RequestNotFound,
  RequestTab,
  ResponseTab,
  TimingTab,
} from '@/features/proxy/ui/request-detail';
import { Tabs } from '@/shared/ui/tabs';

function summaryFingerprint(entry: TrafficEntry): string {
  return [
    entry.status,
    entry.timing?.totalMs,
    entry.responseBody?.size,
    entry.requestBody?.size,
    entry.httpPayloadAvailable,
  ].join('|');
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, getEntry, loadFullEntry } = useProxyEntries();
  const [entry, setEntry] = React.useState<TrafficEntry | null>(null);
  const [loading, setLoading] = React.useState(Boolean(id));
  const [tab, setTab] = React.useState<DetailTab>('overview');
  const [activeId, setActiveId] = React.useState(id);
  const [refreshKey, setRefreshKey] = React.useState('');

  // Adjust local state when the route id changes (React render-time pattern).
  if (id !== activeId) {
    setActiveId(id);
    setEntry(null);
    setLoading(Boolean(id));
    setRefreshKey('');
  }

  const listEntry = id ? getEntry(id) : null;
  const listFingerprint = listEntry ? summaryFingerprint(listEntry) : '';

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadFullEntry(id).then((full) => {
      if (cancelled) return;
      const next = full ?? getEntry(id) ?? null;
      setEntry(next);
      setLoading(false);
      setRefreshKey(next ? summaryFingerprint(next) : '');
    });
    return () => {
      cancelled = true;
    };
  }, [id, getEntry, loadFullEntry]);

  // Reload full entry when the capture list summary for this id changes.
  React.useEffect(() => {
    if (!id || loading || !listFingerprint || listFingerprint === refreshKey) return;
    let cancelled = false;
    void loadFullEntry(id).then((full) => {
      if (cancelled || !full) return;
      setEntry(full);
      setRefreshKey(summaryFingerprint(full));
    });
    return () => {
      cancelled = true;
    };
  }, [id, entries, listFingerprint, refreshKey, loadFullEntry, loading]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return <RequestNotFound />;
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <RequestDetailHeader entry={entry} />
      <Tabs tabs={DETAIL_TABS} value={tab} onChange={(key) => setTab(key as DetailTab)} />
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 sm:px-6">
        {tab === 'overview' ? <OverviewTab entry={entry} /> : null}
        {tab === 'request' ? <RequestTab entry={entry} /> : null}
        {tab === 'response' ? <ResponseTab entry={entry} /> : null}
        {tab === 'timing' ? <TimingTab entry={entry} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
