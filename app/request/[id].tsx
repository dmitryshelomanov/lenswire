import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { methodBadgeVariant, statusBadgeVariant } from '@/entities/traffic/badges';
import {
  entryUrl,
  formatBytes,
  formatDuration,
  type HeaderMap,
  type TrafficBody,
  type TrafficEntry,
} from '@/entities/traffic/types';
import { useProxyStore } from '@/features/proxy/store';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Tabs } from '@/shared/ui/tabs';
import { Text } from '@/shared/ui/text';

type DetailTab = 'overview' | 'request' | 'response' | 'timing';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'request', label: 'Request' },
  { key: 'response', label: 'Response' },
  { key: 'timing', label: 'Timing' },
];

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getEntry } = useProxyStore();
  const entry = getEntry(id);
  const [tab, setTab] = React.useState<DetailTab>('overview');

  if (!entry) {
    return (
      <SafeAreaView className="dark flex-1 bg-background">
        <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
          <Button variant="ghost" size="icon" onPress={() => router.back()}>
            <Icon as={ArrowLeft} className="text-foreground" size={18} />
          </Button>
          <Text className="font-semibold">Request not found</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="muted" className="text-center">
            This request is no longer in the capture buffer. Go back to the traffic list.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="dark flex-1 bg-background">
      <View className="border-border border-b px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Button variant="ghost" size="icon" onPress={() => router.back()}>
            <Icon as={ArrowLeft} className="text-foreground" size={18} />
          </Button>
          <Badge label={entry.method} variant={methodBadgeVariant(entry.method)} />
          <Badge label={String(entry.status)} variant={statusBadgeVariant(entry.status)} />
          <Text variant="muted" className="ml-auto font-mono text-xs">
            {formatDuration(entry.timing.totalMs)}
          </Text>
        </View>
        <Text className="mt-2 font-mono text-sm" numberOfLines={2}>
          {entryUrl(entry)}
        </Text>
      </View>

      <Tabs tabs={TABS} value={tab} onChange={(key) => setTab(key as DetailTab)} />

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 sm:px-6">
        {tab === 'overview' ? <OverviewTab entry={entry} /> : null}
        {tab === 'request' ? <RequestTab entry={entry} /> : null}
        {tab === 'response' ? <ResponseTab entry={entry} /> : null}
        {tab === 'timing' ? <TimingTab entry={entry} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function OverviewTab({ entry }: { entry: TrafficEntry }) {
  return (
    <View className="gap-4">
      <MetaRow label="URL" value={entryUrl(entry)} mono />
      <MetaRow label="Method" value={entry.method} />
      <MetaRow label="Status" value={String(entry.status)} />
      <MetaRow label="Duration" value={formatDuration(entry.timing.totalMs)} />
      <MetaRow label="Request size" value={formatBytes(entry.requestBody.size)} />
      <MetaRow label="Response size" value={formatBytes(entry.responseBody.size)} />
      <MetaRow
        label="Started"
        value={new Date(entry.startedAt).toLocaleString()}
      />
    </View>
  );
}

function RequestTab({ entry }: { entry: TrafficEntry }) {
  return (
    <View className="gap-6">
      <Section title="Query">
        <Text className="font-mono text-sm">{entry.query || '(empty)'}</Text>
      </Section>
      <Section title="Headers">
        <HeaderList headers={entry.requestHeaders} />
      </Section>
      <Section title="Body">
        <BodyView body={entry.requestBody} />
      </Section>
    </View>
  );
}

function ResponseTab({ entry }: { entry: TrafficEntry }) {
  return (
    <View className="gap-6">
      <Section title="Headers">
        <HeaderList headers={entry.responseHeaders} />
      </Section>
      <Section title="Body">
        <BodyView body={entry.responseBody} />
      </Section>
    </View>
  );
}

function TimingTab({ entry }: { entry: TrafficEntry }) {
  const { timing } = entry;
  return (
    <View className="gap-3">
      <MetaRow label="DNS" value={formatDuration(timing.dnsMs)} />
      <MetaRow label="Connect" value={formatDuration(timing.connectMs)} />
      <MetaRow label="TLS" value={formatDuration(timing.tlsMs)} />
      <MetaRow label="TTFB" value={formatDuration(timing.ttfbMs)} />
      <MetaRow label="Download" value={formatDuration(timing.downloadMs)} />
      <MetaRow label="Total" value={formatDuration(timing.totalMs)} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="small" className="text-muted-foreground uppercase tracking-wide">
        {title}
      </Text>
      {children}
    </View>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="gap-1">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      <Text className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</Text>
    </View>
  );
}

function HeaderList({ headers }: { headers: HeaderMap }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <Text variant="muted">(none)</Text>;
  }
  return (
    <View className="gap-2">
      {entries.map(([key, value]) => (
        <View key={key} className="gap-0.5">
          <Text className="font-mono text-xs text-sky-400">{key}</Text>
          <Text className="font-mono text-sm">{value}</Text>
        </View>
      ))}
    </View>
  );
}

function BodyView({ body }: { body: TrafficBody }) {
  if (body.kind === 'empty') {
    return <Text variant="muted">(empty)</Text>;
  }
  if (body.kind === 'binary') {
    return (
      <Text variant="muted">
        Binary payload · {formatBytes(body.size)} (preview not available)
      </Text>
    );
  }
  return (
    <View className="bg-muted/50 border-border rounded-md border p-3">
      <Text className="font-mono text-xs leading-5">{body.text}</Text>
    </View>
  );
}
