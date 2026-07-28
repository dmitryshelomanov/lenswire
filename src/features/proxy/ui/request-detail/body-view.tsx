import { Check, Copy } from 'lucide-react-native';
import * as React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { formatBytes, type TrafficBody } from '@/entities/traffic/types';
import { Icon } from '@/shared/ui/icon';
import { JsonTree } from '@/shared/ui/json-tree';
import { Text } from '@/shared/ui/text';

import { useBodyView } from '../../hooks/use-body-view';
import { useCopiedFeedback } from '../../hooks/use-copied-feedback';

const HEX_PREVIEW_BYTES = 512;

export function BodyView({ body }: { body: TrafficBody }) {
  if (body.kind === 'empty') {
    return <Text variant="muted">(empty)</Text>;
  }
  if (body.kind === 'image') {
    return <ImageBodyView body={body} />;
  }
  if (body.kind === 'binary') {
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
        <Text variant="muted">Image payload · {formatBytes(body.size)} (preview not available)</Text>
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
        <Text variant="muted">Binary payload · {formatBytes(body.size)} (preview not available)</Text>
      )}
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
  const bytes = base64ToBytes(base64).slice(0, maxBytes);
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(chunk)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return lines.join('\n');
}

function base64ToBytes(base64: string): number[] {
  const normalized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  // Prefer atob when available (Hermes / modern RN).
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const out: number[] = new Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  // Fallback decode without Buffer.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of normalized) {
    if (ch === '=') break;
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}
