import { Activity, Radio, SearchX } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { useProxyStore } from '@/features/proxy/store';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Separator } from '@/shared/ui/separator';
import { Text } from '@/shared/ui/text';

type Props = {
  kind: 'stopped' | 'empty' | 'filtered';
};

export function TrafficEmptyState({ kind }: Props) {
  const { start, recording, simulator, probe, probing, status } = useProxyStore();
  const listening = status === 'listening';
  const isAndroid = Platform.OS === 'android';
  const showProbe = listening && (simulator || isAndroid);

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
                ? 'Generate/install CA, then Start and allow VPN. Use Send test request to verify.'
                : simulator
                  ? 'Simulator Dev Mode: Start the in-process proxy, then send a test request.'
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
                <Text variant="muted">1. Certificate → Generate CA → Install CA</Text>
                <Text variant="muted">2. Start → allow VPN</Text>
                <Text variant="muted">3. Send test request (or emulator http-proxy)</Text>
              </>
            ) : simulator ? (
              <>
                <Text variant="muted">1. Certificate → Generate CA</Text>
                <Text variant="muted">2. On Mac: npm run sim:trust-ca</Text>
                <Text variant="muted">3. Start → Send test request</Text>
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
        <Text className="text-center text-xl font-semibold">No matching requests</Text>
        <Text variant="muted" className="mt-2 text-center">
          Try clearing the search or resetting method / status filters.
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
          ? `Recording is ${recording ? 'on' : 'paused'}. Tap Send test request, or set emulator -http-proxy 127.0.0.1:9090 and open http://example.com.`
          : simulator
            ? `Recording is ${recording ? 'on' : 'paused'}. Tap Send test request, or point Mac HTTP proxy at 127.0.0.1:9090 and open http://example.com in Safari.`
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
