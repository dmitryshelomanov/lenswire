import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const { getEntry } = useProxyEntries();
  const entry = getEntry(id);
  const [tab, setTab] = React.useState<DetailTab>('overview');

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
