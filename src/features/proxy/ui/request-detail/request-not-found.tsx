import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export function RequestNotFound() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="text-foreground" size={18} />
        </Button>
        <Text className="font-semibold">Request not found</Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text variant="muted" className="text-center">
          This request is no longer in the capture buffer. Go back to the traffic list.
        </Text>
      </View>
    </SafeAreaView>
  );
}
