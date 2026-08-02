import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';

import type { TrafficBody } from '@/entities/traffic/types';
import { useProxyEntries } from '@/features/proxy/store';
import {
  BodyViewerScreen,
  type BodyViewerSide,
} from '@/features/proxy/ui/body-viewer/body-viewer-screen';

function parseSide(value: string | undefined): BodyViewerSide {
  return value === 'request' ? 'request' : 'response';
}

export default function BodyViewerRoute() {
  const router = useRouter();
  const { entryId, side: sideParam } = useLocalSearchParams<{
    entryId?: string;
    side?: string;
  }>();
  const side = parseSide(sideParam);
  const { loadFullEntry } = useProxyEntries();
  const [body, setBody] = React.useState<TrafficBody | null>(null);
  const [loading, setLoading] = React.useState(Boolean(entryId));

  React.useEffect(() => {
    if (!entryId) {
      queueMicrotask(() => {
        setBody(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    void loadFullEntry(entryId).then((full) => {
      if (cancelled) return;
      if (!full) {
        setBody(null);
        setLoading(false);
        return;
      }
      setBody(side === 'request' ? full.requestBody : full.responseBody);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, side, loadFullEntry]);

  const title = side === 'request' ? 'Request Body' : 'Response Body';

  return (
    <BodyViewerScreen title={title} body={body} loading={loading} onClose={() => router.back()} />
  );
}
