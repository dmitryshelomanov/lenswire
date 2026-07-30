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

const MITM_ERROR_HINT =
  'After TLS handshake the client sent non-HTTP/1.1 (or an unsupported method). Check Capture summary and Request for protocol guess + byte preview (e.g. HTTP/2 PRI, binary).';

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
    if (entry.reasonCode === 'mitm_error') {
      return `${summary}\n\n${MITM_ERROR_HINT}`;
    }
    return summary;
  }
  return null;
}

export function decryptHelpHint(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return BYPASS_HINT;
  if (entry.reasonCode === 'mitm_handshake_failed') return TRUST_HINT;
  if (entry.reasonCode === 'mitm_error') return MITM_ERROR_HINT;
  return null;
}

export function decryptHelpTitle(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return 'MITM bypassed';
  if (entry.reasonCode === 'mitm_handshake_failed') return 'TLS trust / handshake';
  if (entry.reasonCode === 'mitm_error') return 'MITM protocol mismatch';
  return null;
}

export function httpPayloadLabel(entry: TrafficEntry): string {
  if (entry.httpPayloadAvailable == null) return 'unknown';
  return entry.httpPayloadAvailable ? 'available' : 'unavailable';
}
