import type { TrafficEntry } from '@/entities/traffic/types';

export type DetailTab = 'overview' | 'request' | 'response' | 'messages' | 'timing';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'request', label: 'Request' },
  { key: 'response', label: 'Response' },
  { key: 'messages', label: 'Messages' },
  { key: 'timing', label: 'Timing' },
];

export function detailTabsForEntry(entry: TrafficEntry): { key: DetailTab; label: string }[] {
  const showMessages =
    entry.reasonCode === 'websocket_frames' ||
    entry.reasonCode === 'websocket_relay' ||
    entry.reasonCode === 'mitm_websocket' ||
    entry.status === 101 ||
    (entry.wsFrameCount ?? 0) > 0 ||
    (entry.wsFrames?.length ?? 0) > 0;
  if (showMessages) return DETAIL_TABS;
  return DETAIL_TABS.filter((tab) => tab.key !== 'messages');
}
