import { View } from 'react-native';

import { Text } from '@/shared/ui/text';

export function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="gap-1">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      <Text className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</Text>
    </View>
  );
}
