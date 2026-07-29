import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import type { TrafficFilterOption } from './types';

export function FilterSelect({
  title,
  valueLabel,
  active,
  options,
  selected,
  onSelect,
}: {
  title: string;
  valueLabel: string;
  active: boolean;
  options: TrafficFilterOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          // Match `Input` height (`h-10`) on the home toolbar row.
          'flex-row items-center gap-1.5 rounded-md border px-3 h-10',
          active ? 'border-foreground bg-secondary' : 'border-border bg-background',
        )}
      >
        <Text variant="small" className="text-muted-foreground">
          {title}
        </Text>
        <Text variant="small" className="text-foreground">
          {valueLabel}
        </Text>
        <Icon as={ChevronDown} size={12} className="text-muted-foreground" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/55" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-background border-border rounded-t-xl border-t px-4 pt-4 pb-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="mb-3 text-base font-semibold">{title}</Text>
            <View className="gap-1.5">
              {options.map((option) => {
                const isSelected = option.value === selected;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-md border px-3 py-2.5',
                      isSelected
                        ? 'border-foreground bg-secondary'
                        : 'border-border active:bg-accent/40',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm',
                        isSelected ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button className="mt-3" variant="outline" size="sm" onPress={() => setOpen(false)}>
              <Text>Cancel</Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
