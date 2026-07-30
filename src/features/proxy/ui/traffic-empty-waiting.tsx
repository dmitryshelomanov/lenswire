import { Activity } from 'lucide-react-native';
import { View } from 'react-native';

import { androidWaitingSummary } from '@/features/proxy/lib/android-ca-guidance';
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
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <View className="bg-muted mb-6 rounded-full p-4">
        <Icon as={Activity} className="text-muted-foreground" size={28} />
      </View>
      <Text className="text-center text-xl font-semibold">No traffic yet</Text>
      <Text variant="muted" className="mt-2 max-w-md text-center">
        {isAndroid
          ? androidWaitingSummary(recording, showEmulatorTrustCa)
          : `Waiting for requests. Recording is ${recording ? 'on' : 'paused'}. Open Safari or any app.`}
      </Text>
    </View>
  );
}
