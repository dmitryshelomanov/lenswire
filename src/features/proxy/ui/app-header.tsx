import { router } from 'expo-router';
import { Settings, Shield } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import { useProxyStatus } from '../store';

export function AppHeader() {
  const { status } = useProxyStatus();
  const listening = status === 'listening';
  const statusLabel = status === 'stopped' ? 'Stopped' : Platform.OS === 'android' ? 'VPN' : 'On';

  return (
    <View className="border-border border-b">
      <View className="flex-row items-center gap-2 px-4 py-3 sm:px-6">
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-semibold tracking-tight" numberOfLines={1}>
            Lenswire
          </Text>
          <Text variant="muted" numberOfLines={1}>
            Local HTTP(S) inspector
          </Text>
        </View>

        <View className="bg-muted flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5">
          <View
            className={`h-2 w-2 rounded-full ${listening ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`}
          />
          <Text variant="small" className="text-muted-foreground">
            {statusLabel}
          </Text>
        </View>

        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Certificate"
          onPress={() => router.push('/certificate')}
        >
          <Icon as={Shield} className="text-foreground" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
        >
          <Icon as={Settings} className="text-foreground" size={18} />
        </Button>
      </View>
    </View>
  );
}
