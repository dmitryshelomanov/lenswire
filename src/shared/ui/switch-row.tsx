import { Pressable, View } from 'react-native';

import { Text } from './text';

type SwitchRowProps = {
  value: boolean;
  onToggle: () => void;
  onLabel?: string;
  offLabel?: string;
  className?: string;
};

export function SwitchRow({
  value,
  onToggle,
  onLabel = 'On',
  offLabel = 'Off',
  className,
}: SwitchRowProps) {
  return (
    <Pressable
      onPress={onToggle}
      className={`border-border bg-background flex-row items-center justify-between rounded-md border px-3 py-3 ${className ?? ''}`}
    >
      <Text>{value ? onLabel : offLabel}</Text>
      <View
        className={`h-6 w-11 justify-center rounded-full px-0.5 ${value ? 'bg-emerald-500/80' : 'bg-muted'}`}
      >
        <View
          className={`bg-background h-5 w-5 rounded-full ${value ? 'self-end' : 'self-start'}`}
        />
      </View>
    </Pressable>
  );
}
