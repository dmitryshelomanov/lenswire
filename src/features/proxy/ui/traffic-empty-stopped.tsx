import { Radio } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  androidStoppedSetupLines,
  androidStoppedSummary,
} from '@/features/proxy/lib/android-ca-guidance';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Separator } from '@/shared/ui/separator';
import { Text } from '@/shared/ui/text';

export function TrafficEmptyStopped({
  isAndroid,
  showEmulatorTrustCa,
  onStart,
}: {
  isAndroid: boolean;
  showEmulatorTrustCa: boolean;
  onStart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const setupLines = isAndroid ? androidStoppedSetupLines(showEmulatorTrustCa) : IOS_SETUP_LINES;
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 48,
        paddingBottom: Math.max(insets.bottom, 16) + 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-lg self-center">
        <View className="items-center">
          <View className="bg-muted mb-6 rounded-full p-4">
            <Icon as={Radio} className="text-muted-foreground" size={28} />
          </View>
          <Text className="text-center text-xl font-semibold">Capture is stopped</Text>
          <Text variant="muted" className="mt-2 text-center">
            {isAndroid
              ? androidStoppedSummary(showEmulatorTrustCa)
              : 'Install the CA certificate first, then tap Start. iOS will ask to allow VPN.'}
          </Text>
        </View>
        <Separator className="my-8 w-full" />
        <View className="w-full gap-3">
          <Text variant="small" className="text-muted-foreground">
            Setup
          </Text>
          {setupLines.map((line) => (
            <Text key={line} variant="muted">
              {line}
            </Text>
          ))}
          <Button className="mt-4 w-full" onPress={onStart}>
            <Text>Start capture</Text>
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const IOS_SETUP_LINES = [
  '1. Certificate -> Generate CA -> Install profile',
  '2. Trust CA in Settings -> About -> Certificate Trust',
  '3. Tap Start and allow VPN',
];
