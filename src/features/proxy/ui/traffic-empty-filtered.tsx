import { SearchX } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export function TrafficEmptyFiltered({ filteredHint }: { filteredHint: 'traffic' | 'domain' }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 48,
        paddingBottom: Math.max(insets.bottom, 16) + 24,
      }}
    >
      <View className="bg-muted mb-6 rounded-full p-4">
        <Icon as={SearchX} className="text-muted-foreground" size={28} />
      </View>
      <Text className="text-center text-xl font-semibold">
        {filteredHint === 'domain' ? 'No matching domains' : 'No matching requests'}
      </Text>
      <Text variant="muted" className="mt-2 text-center">
        {filteredHint === 'domain'
          ? 'Try clearing the domain search or resetting the client filter.'
          : 'Try clearing the search or resetting method / status filters.'}
      </Text>
    </ScrollView>
  );
}
