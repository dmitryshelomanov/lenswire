import { View } from 'react-native';

import { Text } from '@/shared/ui/text';

import type { TrafficFilterOption } from '../../lib/traffic-toolbar/types';
import { FilterChip } from './filter-chip';

export function FilterSection({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: TrafficFilterOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className="mb-3">
      <Text variant="small" className="text-muted-foreground mb-1.5">
        {title}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <FilterChip
              key={option.value}
              label={option.label}
              active={isSelected}
              onPress={() => onSelect(option.value)}
            />
          );
        })}
      </View>
    </View>
  );
}
