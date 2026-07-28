import { View } from 'react-native';

import { formatDuration, type TrafficEntry } from '@/entities/traffic/types';

import { MetaRow } from './meta-row';

export function TimingTab({ entry }: { entry: TrafficEntry }) {
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
