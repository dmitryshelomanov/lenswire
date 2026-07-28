import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import type { StatusClass } from '@/entities/traffic/types';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import { CAPTURE_MODES, SCHEMES, STATUS_CLASSES } from './constants';
import { FilterChip } from './filter-chip';
import { FilterSection } from './filter-section';

export function MoreFilters({
  active,
  statusClass,
  scheme,
  captureMode,
  overriddenOnly,
  onChange,
}: {
  active: boolean;
  statusClass: StatusClass | 'ALL';
  scheme: 'ALL' | 'http' | 'https';
  captureMode: 'ALL' | 'http' | 'mitm' | 'tunnel';
  overriddenOnly: boolean;
  onChange: (patch: {
    statusClass?: StatusClass | 'ALL';
    scheme?: 'ALL' | 'http' | 'https';
    captureMode?: 'ALL' | 'http' | 'mitm' | 'tunnel';
    overriddenOnly?: boolean;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'flex-row items-center gap-1.5 rounded-md border px-2.5 py-1.5',
          active ? 'border-foreground bg-secondary' : 'border-border bg-background',
        )}
      >
        <Text variant="small" className={active ? 'text-foreground' : 'text-muted-foreground'}>
          More
        </Text>
        <Icon
          as={ChevronDown}
          size={12}
          className={active ? 'text-foreground' : 'text-muted-foreground'}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/55" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-background border-border max-h-[80%] rounded-t-xl border-t px-4 pt-4 pb-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="mb-3 text-base font-semibold">More filters</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <FilterSection
                title="Status"
                options={STATUS_CLASSES}
                selected={statusClass}
                onSelect={(value) => onChange({ statusClass: value as StatusClass | 'ALL' })}
              />
              <FilterSection
                title="Scheme"
                options={SCHEMES}
                selected={scheme}
                onSelect={(value) => onChange({ scheme: value as 'ALL' | 'http' | 'https' })}
              />
              <FilterSection
                title="Mode"
                options={CAPTURE_MODES}
                selected={captureMode}
                onSelect={(value) =>
                  onChange({ captureMode: value as 'ALL' | 'http' | 'mitm' | 'tunnel' })
                }
              />
              <View className="mt-2">
                <Text variant="small" className="text-muted-foreground mb-1.5">
                  Other
                </Text>
                <FilterChip
                  label="Overridden only"
                  active={overriddenOnly}
                  onPress={() => onChange({ overriddenOnly: !overriddenOnly })}
                />
              </View>
            </ScrollView>
            <Button className="mt-3" variant="outline" size="sm" onPress={() => setOpen(false)}>
              <Text>Done</Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
