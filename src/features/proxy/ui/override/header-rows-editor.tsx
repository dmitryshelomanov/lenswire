import { Trash2 } from 'lucide-react-native';
import { TextInput, View } from 'react-native';

import type { HeaderRow } from '@/features/proxy/lib/override-editor';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

type Props = {
  rows: HeaderRow[];
  onChange: (rows: HeaderRow[]) => void;
};

export function HeaderRowsEditor({ rows, onChange }: Props) {
  if (rows.length === 0) {
    return (
      <Text variant="muted" className="mt-2">
        (none)
      </Text>
    );
  }

  return (
    <View className="mt-2">
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1;
        return (
          <View
            key={row.id}
            className={`flex-row items-start gap-1 py-2 ${isLast ? '' : 'border-border border-b'}`}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <TextInput
                value={row.name}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Header-Name"
                placeholderTextColor="hsl(0 0% 63.9%)"
                onChangeText={(name) =>
                  onChange(rows.map((item) => (item.id === row.id ? { ...item, name } : item)))
                }
                className="text-sky-400 p-0 font-mono text-xs"
              />
              <TextInput
                value={row.value}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="value (empty = remove)"
                placeholderTextColor="hsl(0 0% 63.9%)"
                onChangeText={(value) =>
                  onChange(rows.map((item) => (item.id === row.id ? { ...item, value } : item)))
                }
                className="text-foreground p-0 font-mono text-sm"
              />
            </View>
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Remove header"
              onPress={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              <Icon as={Trash2} className="text-muted-foreground" size={14} />
            </Button>
          </View>
        );
      })}
    </View>
  );
}
