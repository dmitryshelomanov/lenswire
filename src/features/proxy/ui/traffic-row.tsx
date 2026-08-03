import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { methodBadgeVariant, statusBadgeVariant } from '@/entities/traffic/badges';
import { getEntryBadgeMeta } from '@/entities/traffic/entry-badges';
import { grpcBadgeLabel } from '@/entities/traffic/grpc';
import {
  captureModeLabel,
  entryDisplayScheme,
  formatBytes,
  formatDuration,
  type TrafficEntry,
} from '@/entities/traffic/types';
import { Badge } from '@/shared/ui/badge';
import { Text } from '@/shared/ui/text';

type Props = {
  entry: TrafficEntry;
  collapsedCount?: number;
  selected?: boolean;
  selecting?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
};

function TrafficRowImpl({
  entry,
  collapsedCount = 1,
  selected = false,
  selecting = false,
  onToggleSelect,
  onLongPress,
}: Props) {
  const time = new Date(entry.startedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const mode = captureModeLabel(entry.captureMode);
  const { httpVersion, reason, resourceLabel, grpcVariant, protobuf, grpcPath } =
    getEntryBadgeMeta(entry);

  return (
    <Pressable
      className={`border-border active:bg-accent/40 border-b px-4 py-3 sm:px-6 ${
        selected ? 'bg-sky-500/10' : ''
      }`}
      onPress={() => {
        if (selecting && onToggleSelect) {
          onToggleSelect();
          return;
        }
        router.push(`/request/${entry.id}`);
      }}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View className="flex-row items-start gap-2">
        {selecting ? (
          <View
            className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
              selected ? 'border-sky-500 bg-sky-500' : 'border-border bg-background'
            }`}
          >
            {selected ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
          </View>
        ) : null}
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
          <Badge label={entry.method} variant={methodBadgeVariant(entry.method)} />
          <Badge label={String(entry.status)} variant={statusBadgeVariant(entry.status)} />
          {resourceLabel ? <Badge label={resourceLabel} variant="outline" /> : null}
          <Badge label={mode} variant="default" />
          {httpVersion ? <Badge label={httpVersion} variant="outline" /> : null}
          {grpcVariant ? <Badge label={grpcBadgeLabel(grpcVariant)} variant="info" /> : null}
          {protobuf ? <Badge label="+protobuf" variant="info" /> : null}
          {entry.overrideApplied === 'response' ? <Badge label="MOCK" variant="warning" /> : null}
          {entry.overrideApplied === 'request' ? <Badge label="REQ↓" variant="info" /> : null}
          {reason ? <Badge label={reason} variant="default" /> : null}
          {collapsedCount > 1 ? <Badge label={`x${collapsedCount}`} variant="outline" /> : null}
        </View>
        <Text variant="muted" className="font-mono text-xs">
          {time}
        </Text>
      </View>
      {grpcPath ? (
        <>
          <Text className="mt-2 font-mono text-sm" numberOfLines={1}>
            {grpcPath.shortLabel}
          </Text>
          <Text variant="muted" className="mt-0.5 font-mono text-xs" numberOfLines={1}>
            {entry.path}
          </Text>
        </>
      ) : (
        <Text className="mt-2 font-mono text-sm" numberOfLines={1}>
          <Text>{entry.path}</Text>
          {entry.query ? <Text className="text-muted-foreground">?{entry.query}</Text> : null}
        </Text>
      )}
      <View className="mt-1.5 flex-row gap-3">
        <Text variant="muted" className="font-mono text-xs">
          {formatDuration(entry.timing.totalMs)}
        </Text>
        <Text variant="muted" className="font-mono text-xs">
          {formatBytes(entry.responseBody.size)}
        </Text>
        {(entry.wsFrameCount ?? 0) > 0 ||
        entry.reasonCode === 'websocket_frames' ||
        entry.status === 101 ? (
          <Text variant="muted" className="font-mono text-xs">
            ws:{entry.wsFrameCount ?? 0}
            {entry.wsClosed ? ' closed' : ' open'}
          </Text>
        ) : null}
        <Text variant="muted" className="font-mono text-xs uppercase">
          {entryDisplayScheme(entry)}
        </Text>
        {entry.hostnameSource ? (
          <Text variant="muted" className="font-mono text-xs">
            src:{entry.hostnameSource}
          </Text>
        ) : null}
        {entry.hostnameConfidence ? (
          <Text variant="muted" className="font-mono text-xs">
            host:{entry.hostnameConfidence}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const TrafficRow = React.memo(TrafficRowImpl);
