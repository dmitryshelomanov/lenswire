import { captureModeLabel, type TrafficEntry } from '@/entities/traffic/types';

export function requestPath(entry: TrafficEntry): string {
  return entry.query ? `${entry.path}?${entry.query}` : entry.path;
}

export function connectionRoute(entry: TrafficEntry): string {
  const source = entry.connectTarget ?? entry.rawTarget ?? `${entry.host}${requestPath(entry)}`;
  const resolved = entry.effectiveHost ?? entry.host;
  return `${source} -> ${resolved} (${captureModeLabel(entry.captureMode)})`;
}

const TRUST_HINT =
  'Client rejected Lenswire MITM cert (CA not trusted by the app), or TLS/HTTP mismatch. For sandbox: Install CA (User store), Stop VPN (clears bypass), then retry. Real pinned apps need Frida/LSPosed unpin.';

const BYPASS_HINT =
  'Host is on the session MITM bypass list after an earlier trust failure. Stop VPN (or force-stop Lenswire) to clear, then Start again.';

export function isLikelyPinningOrTrustReject(entry: TrafficEntry): boolean {
  return (
    entry.reasonCode === 'mitm_handshake_failed' ||
    entry.reasonCode === 'mitm_bypassed' ||
    (entry.captureSummary?.toLowerCase().includes('pinning') ?? false)
  );
}

export function payloadUnavailableHint(entry: TrafficEntry): string | null {
  if (entry.httpPayloadAvailable === false) {
    const summary =
      entry.captureSummary ??
      'TLS tunnel passthrough: HTTP payload is unavailable without HTTPS decrypt.';
    if (entry.reasonCode === 'mitm_bypassed') {
      return `${summary}\n\n${BYPASS_HINT}`;
    }
    if (entry.reasonCode === 'mitm_handshake_failed') {
      return `${summary}\n\n${TRUST_HINT}`;
    }
    return summary;
  }
  return null;
}

export function decryptHelpHint(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return BYPASS_HINT;
  if (entry.reasonCode === 'mitm_handshake_failed') return TRUST_HINT;
  return null;
}

export function decryptHelpTitle(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return 'MITM bypassed';
  if (entry.reasonCode === 'mitm_handshake_failed') return 'TLS trust / handshake';
  return null;
}

export function httpPayloadLabel(entry: TrafficEntry): string {
  if (entry.httpPayloadAvailable == null) return 'unknown';
  return entry.httpPayloadAvailable ? 'available' : 'unavailable';
}
