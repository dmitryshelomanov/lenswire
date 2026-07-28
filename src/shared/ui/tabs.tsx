import * as React from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/shared/lib/utils';
import { Text } from '@/shared/ui/text';

type TabItem = {
  key: string;
  label: string;
};

type TabsProps = {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
};

function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <View className={cn('border-border flex-row gap-1 border-b px-4', className)}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className={cn(
              'border-b-2 px-3 py-2.5',
              active ? 'border-foreground' : 'border-transparent',
            )}
          >
            <Text variant="small" className={active ? 'text-foreground' : 'text-muted-foreground'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export { Tabs };
export type { TabItem };
