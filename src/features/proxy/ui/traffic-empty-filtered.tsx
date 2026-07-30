import { SearchX } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export function TrafficEmptyFiltered({ filteredHint }: { filteredHint: 'traffic' | 'domain' }) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
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
    </View>
  );
}
