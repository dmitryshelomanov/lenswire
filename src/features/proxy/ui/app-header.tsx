import { Link } from 'expo-router';
import { Settings, Shield } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { useProxyStore } from '@/features/proxy/store';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export function AppHeader() {
  const { status, simulator } = useProxyStore();
  const listening = status === 'listening';
  const isAndroid = Platform.OS === 'android';

  let statusLabel = 'Stopped';
  if (listening) {
    if (isAndroid) statusLabel = 'VPN + proxy';
    else if (simulator) statusLabel = 'Dev proxy';
    else statusLabel = 'Capturing';
  }

  return (
    <View className="border-border border-b">
      <View className="flex-row items-center justify-between px-4 py-3 sm:px-6">
        <View className="flex-row items-center gap-3">
          <View>
            <Text className="text-lg font-semibold tracking-tight">Lenswire</Text>
            <Text variant="muted">Local HTTP(S) inspector</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="bg-muted flex-row items-center gap-2 rounded-full px-3 py-1.5">
            <View
              className={`h-2 w-2 rounded-full ${listening ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`}
            />
            <Text variant="small" className="text-muted-foreground">
              {statusLabel}
            </Text>
          </View>

          <Link href="/certificate" asChild>
            <Button variant="ghost" size="icon" accessibilityLabel="Certificate">
              <Icon as={Shield} className="text-foreground" size={18} />
            </Button>
          </Link>
          <Link href="/settings" asChild>
            <Button variant="ghost" size="icon" accessibilityLabel="Settings">
              <Icon as={Settings} className="text-foreground" size={18} />
            </Button>
          </Link>
        </View>
      </View>
      {simulator && !isAndroid ? (
        <View className="bg-amber-500/15 border-border border-t px-4 py-2 sm:px-6">
          <Text variant="small" className="text-amber-200">
            Simulator Dev Mode — in-process proxy on :9090 (not Packet Tunnel).
          </Text>
        </View>
      ) : null}
      {isAndroid ? (
        <View className="bg-amber-500/15 border-border border-t px-4 py-2 sm:px-6">
          <Text variant="small" className="text-amber-200">
            Android MVP — VpnService + local proxy :9090 (HTTP forward; HTTPS MITM later).
          </Text>
        </View>
      ) : null}
    </View>
  );
}
