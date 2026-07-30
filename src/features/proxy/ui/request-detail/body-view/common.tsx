import { Check, Copy } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { formatBytes, type TrafficBody } from '@/entities/traffic/types';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import { useCopiedFeedback } from '../../../hooks/use-copied-feedback';
import { formatHexPreview } from '../../../lib/hex-preview';

export const HEX_PREVIEW_BYTES = 512;

export function BodyMeta({ body }: { body: TrafficBody }) {
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

export function HexBlock({ base64 }: { base64: string }) {
  const { copied, copy } = useCopiedFeedback();
  const hex = React.useMemo(() => formatHexPreview(base64, HEX_PREVIEW_BYTES), [base64]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center">
        <Text variant="muted" className="text-xs">
          Hex preview (first {HEX_PREVIEW_BYTES} bytes)
        </Text>
        <CopyActionButton copied={copied} label="Copy hex" onPress={() => void copy(hex)} />
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

export function BodyModeChip({
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

export function CopyActionButton({
  copied,
  label,
  onPress,
}: {
  copied: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Copied' : label}
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
  );
}
