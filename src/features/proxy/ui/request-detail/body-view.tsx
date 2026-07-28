import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react-native';
import * as React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { isGrpcEntry } from '@/entities/traffic/grpc';
import { formatBytes, type TrafficBody, type TrafficEntry } from '@/entities/traffic/types';
import { Icon } from '@/shared/ui/icon';
import { JsonTree } from '@/shared/ui/json-tree';
import { Text } from '@/shared/ui/text';

import { useBodyView } from '../../hooks/use-body-view';
import { useCopiedFeedback } from '../../hooks/use-copied-feedback';
import {
  base64ToUint8Array,
  type GrpcFrame,
  harvestProtobufStrings,
  parseGrpcFrames,
  parseGrpcTrailers,
} from '../../lib/grpc-body';

const HEX_PREVIEW_BYTES = 512;

export function BodyView({ body, entry }: { body: TrafficBody; entry?: TrafficEntry }) {
  if (body.kind === 'empty') {
    return <Text variant="muted">(empty)</Text>;
  }
  if (body.kind === 'image') {
    return <ImageBodyView body={body} />;
  }
  if (body.kind === 'binary') {
    if (entry && isGrpcEntry(entry)) {
      return <GrpcBinaryBodyView body={body} />;
    }
    return <BinaryBodyView body={body} />;
  }

  return <TextBodyView body={body} />;
}

function BodyMeta({ body }: { body: TrafficBody }) {
  return (
    <View className="mb-2 flex-row flex-wrap items-center gap-2">
      <Text variant="muted" className="text-xs">
        {formatBytes(body.size)}
      </Text>
      {body.truncated ? (
        <View className="border-border rounded-md border px-1.5 py-0.5">
          <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">truncated</Text>
        </View>
      ) : null}
      {body.encodingDecoded ? (
        <View className="border-border rounded-md border px-1.5 py-0.5">
          <Text variant="muted" className="text-xs">
            decoded
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ImageBodyView({ body }: { body: TrafficBody }) {
  const uri = body.previewBase64 ? `data:image/*;base64,${body.previewBase64}` : null;
  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      {uri ? (
        <View className="bg-muted/50 border-border items-center rounded-md border p-3">
          <Image
            source={{ uri }}
            style={{ width: '100%', height: 220 }}
            resizeMode="contain"
            accessibilityLabel="Response image preview"
          />
        </View>
      ) : (
        <Text variant="muted">
          Image payload · {formatBytes(body.size)} (preview not available)
        </Text>
      )}
      {body.previewBase64 ? <HexBlock base64={body.previewBase64} /> : null}
    </View>
  );
}

function BinaryBodyView({ body }: { body: TrafficBody }) {
  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      {body.previewBase64 ? (
        <HexBlock base64={body.previewBase64} />
      ) : (
        <Text variant="muted">
          Binary payload · {formatBytes(body.size)} (preview not available)
        </Text>
      )}
    </View>
  );
}

function GrpcBinaryBodyView({ body }: { body: TrafficBody }) {
  const [hexOpen, setHexOpen] = React.useState(false);
  const parsed = React.useMemo(() => {
    if (!body.previewBase64) return null;
    const bytes = base64ToUint8Array(body.previewBase64);
    const frames = parseGrpcFrames(bytes);
    return { bytes, frames };
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

function HexBlock({ base64 }: { base64: string }) {
  const { copied, copy } = useCopiedFeedback();
  const hex = React.useMemo(() => formatHexPreview(base64, HEX_PREVIEW_BYTES), [base64]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center">
        <Text variant="muted" className="text-xs">
          Hex preview (first {HEX_PREVIEW_BYTES} bytes)
        </Text>
        <Pressable
          onPress={() => void copy(hex)}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy hex'}
          className="ml-auto flex-row items-center gap-1.5 rounded-md px-2.5 py-1 active:opacity-70"
        >
          <Icon
            as={copied ? Check : Copy}
            size={14}
            className={copied ? 'text-emerald-500' : 'text-muted-foreground'}
          />
          <Text
            className={
              copied
                ? 'text-xs font-medium text-emerald-500'
                : 'text-muted-foreground text-xs font-medium'
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        className="bg-muted/50 border-border max-h-48 rounded-md border"
        contentContainerClassName="p-3"
      >
        <Text className="font-mono text-xs leading-5" selectable>
          {hex}
        </Text>
      </ScrollView>
    </View>
  );
}

function TextBodyView({ body }: { body: TrafficBody }) {
  const { mode, setMode, copied, copyBody, parsed, showTree, displayText } = useBodyView(body);

  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      <View className="flex-row items-center gap-1">
        {showTree ? (
          <>
            <BodyModeChip label="Tree" active={mode === 'tree'} onPress={() => setMode('tree')} />
            <BodyModeChip label="Raw" active={mode === 'raw'} onPress={() => setMode('raw')} />
          </>
        ) : null}
        <Pressable
          onPress={copyBody}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy body'}
          className="ml-auto flex-row items-center gap-1.5 rounded-md px-2.5 py-1 active:opacity-70"
        >
          <Icon
            as={copied ? Check : Copy}
            size={14}
            className={copied ? 'text-emerald-500' : 'text-muted-foreground'}
          />
          <Text
            className={
              copied
                ? 'text-xs font-medium text-emerald-500'
                : 'text-muted-foreground text-xs font-medium'
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <View className="bg-muted/50 border-border rounded-md border p-3">
        {showTree && mode === 'tree' ? (
          <JsonTree value={parsed} />
        ) : (
          <Text className="font-mono text-xs leading-5" selectable>
            {displayText}
          </Text>
        )}
      </View>
    </View>
  );
}

function BodyModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? 'bg-secondary border-border rounded-md border px-2.5 py-1'
          : 'border-border/0 rounded-md border px-2.5 py-1'
      }
    >
      <Text
        className={
          active
            ? 'text-secondary-foreground text-xs font-medium'
            : 'text-muted-foreground text-xs font-medium'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatHexPreview(base64: string, maxBytes: number): string {
  const bytes = Array.from(base64ToUint8Array(base64).slice(0, maxBytes));
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = chunk.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return lines.join('\n');
}
