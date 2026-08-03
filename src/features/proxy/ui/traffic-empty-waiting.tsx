import { Activity } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { androidWaitingSummary } from '@/features/proxy/lib/android-ca-guidance';
import { CAPTURE_LIMITS_LINE } from '@/features/proxy/lib/capture-status-copy';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export function TrafficEmptyWaiting({
  isAndroid,
  showEmulatorTrustCa,
  recording,
}: {
  isAndroid: boolean;
  showEmulatorTrustCa: boolean;
  recording: boolean;
}) {
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
        <Icon as={Activity} className="text-muted-foreground" size={28} />
      </View>
      <Text className="text-center text-xl font-semibold">No traffic yet</Text>
      <Text variant="muted" className="mt-2 max-w-md text-center">
        {isAndroid
          ? androidWaitingSummary(recording, showEmulatorTrustCa)
          : `Waiting for requests. Recording is ${recording ? 'on' : 'paused'}. Open Safari or any app.`}
      </Text>
      <Text variant="muted" className="mt-2 max-w-md text-center text-sm">
        {CAPTURE_LIMITS_LINE}
      </Text>
    </ScrollView>
  );
}
