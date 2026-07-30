import { useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { formatDuration, type TrafficTiming } from '@/entities/traffic/types';
import { hasTimingScale as hasRenderableTimingScale } from '@/features/proxy/ui/timing-layout';
import {
  layoutPhaseSegments,
  phaseDefs,
  scaleMs,
  TOTAL_BAR_COLOR,
} from '@/features/proxy/ui/timing-phases';
import { cn } from '@/shared/lib/utils';
import { Text } from '@/shared/ui/text';

const BAR_HEIGHT = 14;

export function TimingWaterfall({ timing }: { timing: TrafficTiming }) {
  const [width, setWidth] = useState(0);
  const allPhases = phaseDefs(timing);
  const activePhases = allPhases.filter((p) => p.ms > 0);
  const scale = scaleMs(timing, allPhases);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  if (!hasRenderableTimingScale(scale)) {
    return (
      <Text variant="small" className="text-muted-foreground">
        No timing data
      </Text>
    );
  }

  const hasPhases = activePhases.length > 0;
  const segments = hasPhases
    ? layoutPhaseSegments(activePhases, scale, width)
    : [{ key: 'total', color: TOTAL_BAR_COLOR, x: 0, w: width }];

  return (
    <View className="gap-3">
      <View onLayout={onLayout} className="bg-muted w-full overflow-hidden rounded-sm">
        {width > 0 ? (
          <Svg width={width} height={BAR_HEIGHT}>
            {segments.map((seg) => (
              <Rect
                key={seg.key}
                x={seg.x}
                y={0}
                width={Math.max(seg.w, 0)}
                height={BAR_HEIGHT}
                fill={seg.color}
              />
            ))}
          </Svg>
        ) : (
          <View style={{ height: BAR_HEIGHT }} />
        )}
      </View>

      <View className="gap-2.5">
        {(hasPhases ? activePhases : []).map((phase) => (
          <PhaseRow key={phase.key} color={phase.color} label={phase.label} ms={phase.ms} />
        ))}
        {!hasPhases ? (
          <Text variant="small" className="text-muted-foreground">
            No phase timing — total only
          </Text>
        ) : null}
        <PhaseRow color={TOTAL_BAR_COLOR} label="Total" ms={timing.totalMs} bold />
      </View>
    </View>
  );
}

function PhaseRow({
  color,
  label,
  ms,
  bold,
}: {
  color: string;
  label: string;
  ms: number;
  bold?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Text variant="small" className="text-muted-foreground flex-1">
        {label}
      </Text>
      <Text className={cn('text-sm', bold && 'font-medium')}>{formatDuration(ms)}</Text>
    </View>
  );
}
