import { Activity, Radio, SearchX } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Separator } from '@/shared/ui/separator';
import { Text } from '@/shared/ui/text';

import { useProxyStatus } from '../store';

type Props = {
  kind: 'stopped' | 'empty' | 'filtered';
  /** When `domain`, filtered copy refers to domain/client search instead of method/status. */
  filteredHint?: 'traffic' | 'domain';
};

export function TrafficEmptyState({ kind, filteredHint = 'traffic' }: Props) {
  const { start, recording, probe, probing, status } = useProxyStatus();
  const listening = status === 'listening';
  const isAndroid = Platform.OS === 'android';
  const showProbe = listening;

  if (kind === 'stopped') {
    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <View className="w-full max-w-lg">
          <View className="items-center">
            <View className="bg-muted mb-6 rounded-full p-4">
              <Icon as={Radio} className="text-muted-foreground" size={28} />
            </View>
            <Text className="text-center text-xl font-semibold">Capture is stopped</Text>
            <Text variant="muted" className="mt-2 text-center">
              {isAndroid
                ? 'Generate CA, install as System CA (npm run android:trust-ca), then Start and allow VPN.'
                : 'Install the CA certificate first, then tap Start. iOS will ask to allow VPN.'}
            </Text>
          </View>
          <Separator className="my-8 w-full" />
          <View className="w-full gap-3">
            <Text variant="small" className="text-muted-foreground">
              Setup
            </Text>
            {isAndroid ? (
              <>
                <Text variant="muted">1. Certificate → Generate CA</Text>
                <Text variant="muted">
                  2. Mac: npm run android:trust-ca (System CA, rooted AVD)
                </Text>
                <Text variant="muted">3. Start → allow VPN → open https://example.com</Text>
                <Text variant="muted">
                  User CA alone breaks Chrome while decryption is on — use System CA or disable
                  decrypt.
                </Text>
                <Text variant="muted">
                  Pinned apps: System CA is not enough — unpin with root + Frida / objection /
                  LSPosed separately.
                </Text>
              </>
            ) : (
              <>
                <Text variant="muted">1. Certificate → Generate CA → Install profile</Text>
                <Text variant="muted">2. Trust CA in Settings → About → Certificate Trust</Text>
                <Text variant="muted">3. Tap Start and allow VPN</Text>
              </>
            )}
            <Button className="mt-4 w-full" onPress={() => void start()}>
              <Text>Start capture</Text>
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (kind === 'filtered') {
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

  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <View className="bg-muted mb-6 rounded-full p-4">
        <Icon as={Activity} className="text-muted-foreground" size={28} />
      </View>
      <Text className="text-center text-xl font-semibold">No traffic yet</Text>
      <Text variant="muted" className="mt-2 max-w-md text-center">
        {isAndroid
          ? `Recording is ${recording ? 'on' : 'paused'}. Open https://example.com after System CA (npm run android:trust-ca). Expect GET/decrypted — not only CONNECT.`
          : `Waiting for requests. Recording is ${recording ? 'on' : 'paused'}. Open Safari or any app.`}
      </Text>
      {showProbe ? (
        <Button className="mt-6" disabled={probing} onPress={() => void probe()}>
          <Text>{probing ? 'Sending…' : 'Send test request'}</Text>
        </Button>
      ) : null}
    </View>
  );
}
