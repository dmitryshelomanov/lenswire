import { useAndroidCaContext } from '@/features/proxy/hooks/use-android-ca-context';
import { TrafficEmptyFiltered } from '@/features/proxy/ui/traffic-empty-filtered';
import { TrafficEmptyStopped } from '@/features/proxy/ui/traffic-empty-stopped';
import { TrafficEmptyWaiting } from '@/features/proxy/ui/traffic-empty-waiting';

import { useProxyStatus } from '../store';

type Props = {
  kind: 'stopped' | 'empty' | 'filtered';
  /** When `domain`, filtered copy refers to domain/client search instead of method/status. */
  filteredHint?: 'traffic' | 'domain';
};

export function TrafficEmptyState({ kind, filteredHint = 'traffic' }: Props) {
  const { start, recording, probe, probing, status } = useProxyStatus();
  const { isAndroid, showEmulatorTrustCa } = useAndroidCaContext();
  const listening = status === 'listening';
  const showProbe = listening;

  if (kind === 'stopped') {
    return (
      <TrafficEmptyStopped
        isAndroid={isAndroid}
        showEmulatorTrustCa={showEmulatorTrustCa}
        onStart={() => void start()}
      />
    );
  }

  if (kind === 'filtered') {
    return <TrafficEmptyFiltered filteredHint={filteredHint} />;
  }

  return (
    <TrafficEmptyWaiting
      isAndroid={isAndroid}
      showEmulatorTrustCa={showEmulatorTrustCa}
      recording={recording}
      showProbe={showProbe}
      probing={probing}
      onProbe={() => void probe()}
    />
  );
}
