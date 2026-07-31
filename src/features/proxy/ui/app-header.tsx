import { router } from 'expo-router';
import { Settings, Shield } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import type { ProxyStatus } from '@/entities/traffic/types';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import { useProxyStatus } from '../store';

function statusLabel(status: ProxyStatus): string {
  switch (status) {
    case 'listening':
      return Platform.OS === 'android' ? 'VPN' : 'On';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Error';
    default:
      return 'Stopped';
  }
}

function statusDotClass(status: ProxyStatus): string {
  switch (status) {
    case 'listening':
      return 'bg-emerald-400';
    case 'connecting':
      return 'bg-amber-400';
    case 'error':
      return 'bg-red-400';
    default:
      return 'bg-muted-foreground/40';
  }
}

export function AppHeader() {
  const { status } = useProxyStatus();

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

        <View className="shrink-0 flex-row items-center gap-1">
          <View className="bg-muted max-w-28 shrink flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5">
            <View className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(status)}`} />
            <Text variant="small" className="shrink text-muted-foreground" numberOfLines={1}>
              {statusLabel(status)}
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
    </View>
  );
}
