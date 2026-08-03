import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrafficEntry } from '@/entities/traffic/types';
import { wsFramesMissingFromEntry } from '@/features/proxy/lib/ws-session-links';
import { useProxyEntries } from '@/features/proxy/store';
import {
  type DetailTab,
  detailTabsForEntry,
  MessagesTab,
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
    entry.wsFrameCount ?? entry.wsFrames?.length ?? 0,
    entry.wsFramesOmitted ? 1 : 0,
    entry.wsCompressed ? 1 : 0,
    entry.wsClosed ? 1 : 0,
    entry.endedAt ?? 0,
    entry.wsEndReason ?? '',
    entry.wsCloseCode ?? 0,
    entry.reasonCode,
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
    setTab('overview');
  }

  const listEntry = id ? getEntry(id) : null;
  const listFingerprint = listEntry ? summaryFingerprint(listEntry) : '';

  const applyLoaded = React.useCallback(
    (full: TrafficEntry | null, fallbackId: string) => {
      if (full) {
        setEntry(full);
        setRefreshKey(summaryFingerprint(full));
        return;
      }
      // List summaries omit wsFrames — keep them only as a fallback shell for retry UI.
      const summary = getEntry(fallbackId) ?? null;
      setEntry(summary);
      setRefreshKey(summary ? summaryFingerprint(summary) : '');
    },
    [getEntry],
  );

  const reloadFull = React.useCallback(() => {
    if (!id) return;
    void loadFullEntry(id).then((full) => {
      applyLoaded(full, id);
    });
  }, [id, loadFullEntry, applyLoaded]);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void loadFullEntry(id).then((full) => {
      if (cancelled) return;
      applyLoaded(full, id);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, loadFullEntry, applyLoaded]);

  // Reload full entry when the capture list summary for this id changes.
  React.useEffect(() => {
    if (!id || loading || !listFingerprint || listFingerprint === refreshKey) return;
    let cancelled = false;
    void loadFullEntry(id).then((full) => {
      if (cancelled) return;
      if (full) {
        setEntry(full);
        setRefreshKey(summaryFingerprint(full));
        return;
      }
      // getCapture failed: keep previously loaded frames; otherwise show summary for retry.
      setEntry((prev) => {
        if (prev?.wsFrames?.length && listEntry) {
          return { ...listEntry, wsFrames: prev.wsFrames };
        }
        return listEntry ?? null;
      });
      setRefreshKey(listFingerprint);
    });
    return () => {
      cancelled = true;
    };
  }, [id, entries, listFingerprint, refreshKey, loadFullEntry, loading, listEntry]);

  const tabs = entry ? detailTabsForEntry(entry) : [];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'overview';
  const showMessagesRetry = entry ? wsFramesMissingFromEntry(entry) : false;

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
      <Tabs tabs={tabs} value={activeTab} onChange={(key) => setTab(key as DetailTab)} />
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 sm:px-6">
        {activeTab === 'overview' ? <OverviewTab entry={entry} /> : null}
        {activeTab === 'request' ? <RequestTab entry={entry} /> : null}
        {activeTab === 'response' ? <ResponseTab entry={entry} /> : null}
        {activeTab === 'messages' ? (
          <MessagesTab entry={entry} onRetryLoad={showMessagesRetry ? reloadFull : undefined} />
        ) : null}
        {activeTab === 'timing' ? <TimingTab entry={entry} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
