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
  'Host is on the session MITM bypass list after an earlier trust failure or unsupported protocol. Stop VPN (or force-stop Lenswire) to clear, then Start again.';

const MITM_ERROR_HINT =
  'After TLS handshake the client sent non-HTTP/1.1 (or an unsupported method). Check Capture summary and Request for protocol guess + byte preview (e.g. HTTP/2 PRI, binary).';

const MITM_UNSUPPORTED_HINT =
  'Unsupported protocol after MITM; this connection was closed and the host was added to the session bypass list. Later connects go tunnel-only until you Stop VPN.';

const MITM_WEBSOCKET_HINT =
  'WebSocket upgrade is not supported by Lenswire MITM; this connection was closed and the host was bypassed. Later connects go tunnel-only until you Stop VPN.';

const WEBSOCKET_RELAY_HINT =
  'WebSocket upgrade was relayed to upstream without inspecting frames. HTTP payload for the socket stream is unavailable.';

const ALPN_NO_HTTP11_HINT =
  'ClientHello ALPN did not offer http/1.1, so Lenswire skipped MITM and used a transparent tunnel for this connection.';

const HTTP_UPSTREAM_FAILED_HINT =
  'Plain HTTP request reached Lenswire but upstream fetch failed before any response. Check Capture summary for transport error details (DNS, timeout, connect).';

const HTTP_CLEAR_BLOCKED_HINT =
  'Android blocked cleartext HTTP while Lenswire was forwarding upstream. Enable cleartext traffic for the app build and retry.';

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
    if (entry.reasonCode === 'mitm_unsupported') {
      return `${summary}\n\n${MITM_UNSUPPORTED_HINT}`;
    }
    if (entry.reasonCode === 'mitm_websocket') {
      return `${summary}\n\n${MITM_WEBSOCKET_HINT}`;
    }
    if (entry.reasonCode === 'websocket_relay') {
      return `${summary}\n\n${WEBSOCKET_RELAY_HINT}`;
    }
    if (entry.reasonCode === 'alpn_no_http11') {
      return `${summary}\n\n${ALPN_NO_HTTP11_HINT}`;
    }
    if (entry.reasonCode === 'mitm_error') {
      return `${summary}\n\n${MITM_ERROR_HINT}`;
    }
    if (entry.reasonCode === 'http_upstream_failed' || entry.reasonCode === 'http_upstream_timeout' || entry.reasonCode === 'http_dns_failed') {
      return `${summary}\n\n${HTTP_UPSTREAM_FAILED_HINT}`;
    }
    if (entry.reasonCode === 'http_cleartext_blocked') {
      return `${summary}\n\n${HTTP_CLEAR_BLOCKED_HINT}`;
    }
    return summary;
  }
  return null;
}

export function decryptHelpHint(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return BYPASS_HINT;
  if (entry.reasonCode === 'mitm_handshake_failed') return TRUST_HINT;
  if (entry.reasonCode === 'mitm_unsupported') return MITM_UNSUPPORTED_HINT;
  if (entry.reasonCode === 'mitm_websocket') return MITM_WEBSOCKET_HINT;
  if (entry.reasonCode === 'websocket_relay') return WEBSOCKET_RELAY_HINT;
  if (entry.reasonCode === 'alpn_no_http11') return ALPN_NO_HTTP11_HINT;
  if (entry.reasonCode === 'mitm_error') return MITM_ERROR_HINT;
  if (entry.reasonCode === 'http_upstream_failed' || entry.reasonCode === 'http_upstream_timeout' || entry.reasonCode === 'http_dns_failed') return HTTP_UPSTREAM_FAILED_HINT;
  if (entry.reasonCode === 'http_cleartext_blocked') return HTTP_CLEAR_BLOCKED_HINT;
  return null;
}

export function decryptHelpTitle(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return 'MITM bypassed';
  if (entry.reasonCode === 'mitm_handshake_failed') return 'TLS trust / handshake';
  if (entry.reasonCode === 'mitm_unsupported') return 'Unsupported protocol (bypassed)';
  if (entry.reasonCode === 'mitm_websocket') return 'WebSocket (bypassed)';
  if (entry.reasonCode === 'websocket_relay') return 'WebSocket relay';
  if (entry.reasonCode === 'alpn_no_http11') return 'ALPN without HTTP/1.1';
  if (entry.reasonCode === 'mitm_error') return 'MITM protocol mismatch';
  if (entry.reasonCode === 'http_upstream_failed') return 'HTTP upstream failed';
  if (entry.reasonCode === 'http_upstream_timeout') return 'HTTP upstream timeout';
  if (entry.reasonCode === 'http_dns_failed') return 'HTTP upstream DNS';
  if (entry.reasonCode === 'http_cleartext_blocked') return 'HTTP cleartext blocked';
  return null;
}

export function httpPayloadLabel(entry: TrafficEntry): string {
  if (entry.httpPayloadAvailable == null) return 'unknown';
  return entry.httpPayloadAvailable ? 'available' : 'unavailable';
}
