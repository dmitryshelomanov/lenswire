import { type TrafficEntry } from '@/entities/traffic/types';

/** True when the capture is (or was) a WebSocket session. */
export function isWsTrafficEntry(entry: TrafficEntry): boolean {
  return (
    entry.status === 101 ||
    entry.reasonCode === 'websocket_frames' ||
    entry.reasonCode === 'websocket_relay' ||
    entry.reasonCode === 'mitm_websocket' ||
    (entry.wsFrameCount ?? 0) > 0 ||
    (entry.wsFrames?.length ?? 0) > 0
  );
}

/** Match key for reconnect siblings: secure flag + host + path (query ignored). */
export function wsSessionMatchKey(entry: TrafficEntry): string {
  const secure = entry.scheme === 'https';
  return `${secure ? 'wss' : 'ws'}|${entry.host}|${entry.path}`;
}

/** Newest same-URL WS capture started after [current] (prefer open). */
export function findNewerWsReconnect(
  current: TrafficEntry,
  entries: TrafficEntry[],
): TrafficEntry | null {
  const key = wsSessionMatchKey(current);
  const newer = entries
    .filter(
      (e) =>
        e.id !== current.id &&
        isWsTrafficEntry(e) &&
        wsSessionMatchKey(e) === key &&
        e.startedAt > current.startedAt,
    )
    .sort((a, b) => b.startedAt - a.startedAt);
  return newer.find((e) => !e.wsClosed) ?? newer[0] ?? null;
}

/** Prior same-URL WS capture (prefer closed with messages). */
export function findPreviousWsSession(
  current: TrafficEntry,
  entries: TrafficEntry[],
): TrafficEntry | null {
  const key = wsSessionMatchKey(current);
  const older = entries
    .filter(
      (e) =>
        e.id !== current.id &&
        isWsTrafficEntry(e) &&
        wsSessionMatchKey(e) === key &&
        e.startedAt < current.startedAt,
    )
    .sort((a, b) => b.startedAt - a.startedAt);
  return (
    older.find((e) => e.wsClosed && (e.wsFrameCount ?? e.wsFrames?.length ?? 0) > 0) ??
    older.find((e) => e.wsClosed) ??
    older[0] ??
    null
  );
}

/** Summary claims frames but full payload was not loaded. */
export function wsFramesMissingFromEntry(entry: TrafficEntry): boolean {
  const count = entry.wsFrameCount ?? 0;
  if (count <= 0) return false;
  return (entry.wsFrames?.length ?? 0) === 0;
}

export type WsCaptureBlocker = {
  entry: TrafficEntry;
  reasonCode: string;
};

/**
 * When a closed WS has no newer WS sibling but the same host has a recent
 * real session-bypass or ALPN skip, reconnects are likely invisible to frame MITM.
 */
export function findWsCaptureBlocker(
  current: TrafficEntry,
  entries: TrafficEntry[],
): WsCaptureBlocker | null {
  if (!isWsTrafficEntry(current) || !current.wsClosed) return null;
  if (findNewerWsReconnect(current, entries)) return null;

  const host = current.host.toLowerCase();
  const blockers = entries
    .filter((e) => {
      if (e.id === current.id) return false;
      if (e.host.toLowerCase() !== host) return false;
      if (e.startedAt < current.startedAt) return false;
      const reason = e.reasonCode ?? '';
      if (reason === 'alpn_no_http11') return true;
      if (reason === 'mitm_bypassed') return true;
      if (e.bypassCause) return true;
      return false;
    })
    .sort((a, b) => b.startedAt - a.startedAt);

  const hit = blockers[0];
  if (!hit) return null;
  return {
    entry: hit,
    reasonCode: hit.reasonCode || hit.bypassCause || 'mitm_bypassed',
  };
}

export function wsCaptureBlockerMessage(blocker: WsCaptureBlocker): {
  title: string;
  body: string;
} {
  const reason = blocker.reasonCode;
  if (reason === 'alpn_no_http11') {
    return {
      title: 'Reconnect not MITM’d (ALPN)',
      body: 'Later connects for this host only offered HTTP/2/3 in ClientHello. Classic WebSocket Upgrade needs HTTP/1.1, so frame capture stays off while the browser still works via tunnel.',
    };
  }
  return {
    title: 'Reconnect not MITM’d (session bypass)',
    body: `This host is tunnel-only after ${reason}. New WebSocket upgrades will not appear as websocket_frames until you Stop VPN (clears session bypass) and start again.`,
  };
}
