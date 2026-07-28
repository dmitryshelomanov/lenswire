import { Pressable } from 'react-native';

import { cn } from '@/shared/lib/utils';
import { Text } from '@/shared/ui/text';

export function FilterChip({
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
      className={cn(
        'rounded-md border px-2.5 py-1.5',
        active ? 'border-foreground bg-secondary' : 'border-border bg-background',
      )}
    >
      <Text variant="small" className={active ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}
