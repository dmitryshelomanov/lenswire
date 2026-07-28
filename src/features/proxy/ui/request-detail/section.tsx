import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@/shared/ui/text';

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <View className="min-h-7 flex-row items-center gap-2">
        <Text variant="small" className="text-muted-foreground flex-1 uppercase tracking-wide">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
