import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from './button';
import { Text } from './text';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  backIcon: ReactNode;
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, backIcon, right }: ScreenHeaderProps) {
  return (
    <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
      <Button variant="ghost" size="icon" onPress={onBack}>
        {backIcon}
      </Button>
      <Text className="flex-1 text-lg font-semibold">{title}</Text>
      {right}
    </View>
  );
}
