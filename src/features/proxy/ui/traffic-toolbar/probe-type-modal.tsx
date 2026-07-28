import * as React from 'react';
import { Modal, Pressable, View } from 'react-native';

import type { ProbeScheme, ProbeType } from '@/entities/traffic/types';
import { Button } from '@/shared/ui/button';
import { Text } from '@/shared/ui/text';

import { PROBE_OPTIONS } from './constants';
import { FilterChip } from './filter-chip';

export function ProbeTypeModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (type: ProbeType, scheme: ProbeScheme) => void;
}) {
  const [scheme, setScheme] = React.useState<ProbeScheme>('http');

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/55 px-6">
        <View className="bg-background border-border w-full max-w-lg rounded-lg border p-4">
          <Text className="mb-1 text-base font-semibold">Choose probe type</Text>
          <Text variant="muted" className="mb-3 text-sm">
            Send a synthetic request through the local proxy.
          </Text>
          <View className="mb-3 flex-row gap-2">
            <FilterChip label="HTTP" active={scheme === 'http'} onPress={() => setScheme('http')} />
            <FilterChip
              label="HTTPS"
              active={scheme === 'https'}
              onPress={() => setScheme('https')}
            />
          </View>
          <View className="gap-2">
            {PROBE_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => onSelect(option.type, scheme)}
                className="border-border active:bg-accent/40 rounded-md border px-3 py-2.5"
              >
                <Text className="text-sm font-medium">{option.label}</Text>
                <Text variant="muted" className="mt-0.5 text-xs">
                  {`${scheme}://${option.pathHint}`}
                </Text>
                {option.bodyHint ? (
                  <Text variant="muted" className="text-xs">
                    {option.bodyHint}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
          <Button className="mt-3" variant="outline" size="sm" onPress={onClose}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
