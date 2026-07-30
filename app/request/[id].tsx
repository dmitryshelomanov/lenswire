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

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEntry, loadFullEntry } = useProxyEntries();
  const [entry, setEntry] = React.useState<TrafficEntry | null>(null);
  const [loading, setLoading] = React.useState(Boolean(id));
  const [tab, setTab] = React.useState<DetailTab>('overview');

  React.useEffect(() => {
    let cancelled = false;
    if (!id) {
      setEntry(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadFullEntry(id).then((full) => {
      if (cancelled) return;
      setEntry(full ?? getEntry(id) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, getEntry, loadFullEntry]);

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
