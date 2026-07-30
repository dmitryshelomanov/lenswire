import { View } from 'react-native';

import type { TrafficEntry } from '@/entities/traffic/types';

import { TimingWaterfall } from './timing-waterfall';

export function TimingTab({ entry }: { entry: TrafficEntry }) {
  return (
    <View className="gap-3">
      <TimingWaterfall timing={entry.timing} />
    </View>
  );
}
