import { ChevronDown, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { formatBytes, type TrafficBody } from '@/entities/traffic/types';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import {
  base64ToUint8Array,
  type GrpcFrame,
  harvestProtobufStrings,
  parseGrpcFrames,
  parseGrpcTrailers,
} from '../../../lib/grpc-body';
import { BodyMeta, HexBlock } from './common';

export function GrpcBinaryBodyView({ body }: { body: TrafficBody }) {
  const [hexOpen, setHexOpen] = React.useState(false);
  const parsed = React.useMemo(() => {
    if (!body.previewBase64) return null;
    const bytes = base64ToUint8Array(body.previewBase64);
    const frames = parseGrpcFrames(bytes);
    return { frames };
  }, [body.previewBase64]);

  return (
    <View className="gap-3">
      <BodyMeta body={body} />
      {!parsed || parsed.frames.length === 0 ? (
        <Text variant="muted">
          gRPC payload · {formatBytes(body.size)}
          {body.previewBase64 ? ' (could not parse frames)' : ' (preview not available)'}
        </Text>
      ) : (
        <View className="gap-2">
          <Text variant="muted" className="text-xs">
            {parsed.frames.length} frame{parsed.frames.length === 1 ? '' : 's'}
            {body.truncated ? ' · from truncated preview' : ''}
          </Text>
          {parsed.frames.map((frame, index) => (
            <GrpcFrameCard key={`${frame.kind}-${index}`} frame={frame} index={index} />
          ))}
        </View>
      )}
      {body.previewBase64 ? (
        <View className="gap-2">
          <Pressable
            onPress={() => setHexOpen((v) => !v)}
            className="flex-row items-center gap-1.5 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={hexOpen ? 'Hide raw hex' : 'Show raw hex'}
          >
            <Icon
              as={hexOpen ? ChevronDown : ChevronRight}
              size={14}
              className="text-muted-foreground"
            />
            <Text variant="muted" className="text-xs font-medium">
              Raw hex
            </Text>
          </Pressable>
          {hexOpen ? <HexBlock base64={body.previewBase64} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function GrpcFrameCard({ frame, index }: { frame: GrpcFrame; index: number }) {
  const trailers = React.useMemo(
    () => (frame.kind === 'trailer' && !frame.compressed ? parseGrpcTrailers(frame.payload) : null),
    [frame],
  );
  const strings = React.useMemo(() => {
    if (frame.kind !== 'data' || frame.compressed) return [];
    return harvestProtobufStrings(frame.payload);
  }, [frame]);

  return (
    <View className="border-border bg-muted/30 gap-2 rounded-md border p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="border-border rounded-md border px-1.5 py-0.5">
          <Text className="text-xs font-medium">
            #{index + 1} {frame.kind}
          </Text>
        </View>
        <Text variant="muted" className="font-mono text-xs">
          {formatBytes(frame.length)}
        </Text>
        {frame.compressed ? (
          <View className="border-border rounded-md border px-1.5 py-0.5">
            <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
              compressed
            </Text>
          </View>
        ) : null}
        {frame.truncated ? (
          <View className="border-border rounded-md border px-1.5 py-0.5">
            <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
              truncated
            </Text>
          </View>
        ) : null}
      </View>

      {trailers && Object.keys(trailers).length > 0 ? (
        <View className="gap-1">
          {Object.entries(trailers).map(([key, value]) => (
            <Text key={key} className="font-mono text-xs" selectable>
              <Text className="text-muted-foreground">{key}: </Text>
              {value}
            </Text>
          ))}
        </View>
      ) : null}

      {strings.length > 0 ? (
        <View className="gap-1">
          <Text variant="muted" className="text-xs">
            Strings ({strings.length})
          </Text>
          {strings.slice(0, 40).map((s) => (
            <Text key={s} className="font-mono text-xs leading-5" selectable>
              {s}
            </Text>
          ))}
          {strings.length > 40 ? (
            <Text variant="muted" className="text-xs">
              …and {strings.length - 40} more
            </Text>
          ) : null}
        </View>
      ) : null}

      {frame.kind === 'data' && !frame.compressed && strings.length === 0 ? (
        <Text variant="muted" className="text-xs">
          No printable strings in this frame
        </Text>
      ) : null}
    </View>
  );
}
