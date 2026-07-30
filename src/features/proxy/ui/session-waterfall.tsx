import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';

import { formatDuration, type TrafficEntry } from '@/entities/traffic/types';
import { sessionBounds, timeTicks } from '@/features/proxy/ui/timing-layout';
import { phaseDefs, phaseSumMs, statusBarColor } from '@/features/proxy/ui/timing-phases';
import { Text } from '@/shared/ui/text';

const BAR_HEIGHT = 10;
const H_PAD = 32;

export function SessionWaterfall({ entries }: { entries: TrafficEntry[] }) {
  const { width: screenWidth } = useWindowDimensions();
  const trackWidth = Math.max(screenWidth - H_PAD, 1);
  const sorted = useMemo(() => [...entries].sort((a, b) => a.startedAt - b.startedAt), [entries]);
  const bounds = useMemo(() => sessionBounds(sorted), [sorted]);
  const ticks = useMemo(() => timeTicks(bounds.span), [bounds.span]);

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => item.id}
      className="flex-1"
      ListHeaderComponent={<TimeAxis ticks={ticks} span={bounds.span} trackWidth={trackWidth} />}
      renderItem={({ item }) => (
        <WaterfallRow entry={item} t0={bounds.t0} span={bounds.span} trackWidth={trackWidth} />
      )}
    />
  );
}

function TimeAxis({
  ticks,
  span,
  trackWidth,
}: {
  ticks: number[];
  span: number;
  trackWidth: number;
}) {
  return (
    <View className="border-border border-b px-4 py-2">
      <View className="relative" style={{ width: trackWidth, height: 16 }}>
        {ticks.map((t) => {
          const left = span > 0 ? (t / span) * trackWidth : 0;
          const isEnd = t === span;
          return (
            <Text
              key={t}
              variant="muted"
              className="absolute font-mono text-[10px]"
              style={{
                left,
                transform: [{ translateX: t === 0 ? 0 : isEnd ? -28 : -12 }],
              }}
              numberOfLines={1}
            >
              {formatDuration(t)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function WaterfallRow({
  entry,
  t0,
  span,
  trackWidth,
}: {
  entry: TrafficEntry;
  t0: number;
  span: number;
  trackWidth: number;
}) {
  const offsetMs = Math.max(0, entry.startedAt - t0);
  const duration = Math.max(entry.timing.totalMs, 0);
  const left = span > 0 ? (offsetMs / span) * trackWidth : 0;
  const width = span > 0 ? Math.max((duration / span) * trackWidth, 3) : trackWidth;

  const phases = phaseDefs(entry.timing).filter((p) => p.ms > 0);
  const hasPhases = phaseSumMs(phases) > 0;

  return (
    <Pressable
      className="border-border active:bg-accent/40 border-b px-4 py-2"
      onPress={() => router.push(`/request/${entry.id}`)}
    >
      <Text numberOfLines={1} className="font-mono text-xs" style={{ width: trackWidth }}>
        <Text className="text-muted-foreground">{entry.method} </Text>
        {entry.path}
      </Text>
      <View
        className="mt-1.5 justify-center overflow-hidden"
        style={{ width: trackWidth, height: BAR_HEIGHT + 4 }}
      >
        <View
          className="overflow-hidden rounded-sm"
          style={{
            marginLeft: left,
            width,
            height: BAR_HEIGHT,
            flexDirection: 'row',
            backgroundColor: hasPhases ? undefined : statusBarColor(entry.status),
          }}
        >
          {hasPhases
            ? phases.map((phase) => (
                <View
                  key={phase.key}
                  style={{ flex: Math.max(phase.ms, 1), backgroundColor: phase.color }}
                />
              ))
            : null}
        </View>
      </View>
    </Pressable>
  );
}
