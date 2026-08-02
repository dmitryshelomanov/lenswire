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
  'Host is on the session MITM bypass list after an earlier failure. Stop VPN (or force-stop Lenswire) to clear, then Start again.';

const BYPASS_TRUST_HINT =
  'Session bypass after TLS trust / handshake failure (client rejected Lenswire CA or pinning). Host stays tunnel-only until you Stop VPN.';

const BYPASS_PROTO_HINT =
  'Session bypass after unsupported protocol after MITM (e.g. HTTP/2 or binary). Host stays tunnel-only until you Stop VPN.';

const BYPASS_NO_REQUEST_HINT =
  'Session bypass after no HTTP request following MITM handshake. Host stays tunnel-only until you Stop VPN.';

const BYPASS_WS_HINT =
  'Session bypass after WebSocket was not supported on MITM. Host stays tunnel-only until you Stop VPN.';

const MITM_ERROR_HINT =
  'After TLS handshake the client sent non-HTTP/1.1 (or an unsupported method). Check Capture summary and Request for protocol guess + byte preview (e.g. HTTP/2 PRI, binary).';

const MITM_UNSUPPORTED_HTTP2_HINT =
  'Client sent HTTP/2 after MITM handshake (PRI preface). Lenswire only terminates HTTP/1.1; this connection was closed and the host was bypassed. Later connects go tunnel-only until you Stop VPN.';

const MITM_UNSUPPORTED_BINARY_HINT =
  'Client sent non-HTTP/binary data after MITM handshake. This connection was closed and the host was bypassed; later connects go tunnel-only until you Stop VPN.';

const MITM_UNSUPPORTED_METHOD_HINT =
  'Unsupported HTTP method after MITM. This connection was closed and the host was bypassed; later connects go tunnel-only until you Stop VPN.';

const MITM_UNSUPPORTED_HINT =
  'Unsupported protocol after MITM. This connection was closed and the host was added to the session bypass list. Later connects go tunnel-only until you Stop VPN. Check Capture summary for guess=… details.';

const MITM_NO_REQUEST_TIMEOUT_HINT =
  'No HTTP request after MITM handshake (read timeout). This connection was closed and the host was bypassed; later connects go tunnel-only until you Stop VPN.';

const MITM_NO_REQUEST_EOF_HINT =
  'Client closed the connection after MITM handshake without sending an HTTP request (0 bytes). This connection was closed; the host was not added to session bypass, so later connects can still be MITM’d.';

const MITM_NO_REQUEST_HINT =
  'No HTTP request after MITM handshake. This connection was closed and the host was bypassed; later connects go tunnel-only until you Stop VPN.';

const MITM_WEBSOCKET_HINT =
  'Legacy WebSocket MITM path. Current builds relay upgrades (`websocket_relay`) without inspecting frames and without session bypass.';

const WEBSOCKET_RELAY_HINT =
  'WebSocket upgrade was relayed to upstream without inspecting frames. HTTP payload for the socket stream is unavailable.';

const ALPN_NO_HTTP11_HINT =
  'ClientHello ALPN did not offer http/1.1, so Lenswire skipped MITM and used a transparent tunnel for this connection.';

const HTTP_UPSTREAM_FAILED_HINT =
  'Plain HTTP request reached Lenswire but upstream fetch failed before any response. Check Capture summary for transport error details (DNS, timeout, connect).';

const UPSTREAM_CONNECT_FAILED_HINT =
  'Lenswire could not open a TCP connection to the upstream host (routing/protect/bind or network error). Check Capture summary for the Java exception detail.';

const UPSTREAM_DNS_FAILED_HINT =
  'DNS resolution for the upstream host failed on the device network path. Check Capture summary; without VPN the same host should resolve.';

const HTTP_CLEAR_BLOCKED_HINT =
  'Android blocked cleartext HTTP while Lenswire was forwarding upstream. Enable cleartext traffic for the app build and retry.';

function mitmBypassedHint(entry: TrafficEntry): string {
  switch (entry.bypassCause) {
    case 'mitm_handshake_failed':
      return BYPASS_TRUST_HINT;
    case 'mitm_unsupported':
      return BYPASS_PROTO_HINT;
    case 'mitm_no_request':
      return BYPASS_NO_REQUEST_HINT;
    case 'mitm_websocket':
      return BYPASS_WS_HINT;
    default:
      return BYPASS_HINT;
  }
}

function mitmBypassedTitle(entry: TrafficEntry): string {
  switch (entry.bypassCause) {
    case 'mitm_handshake_failed':
      return 'Session bypass (trust fail)';
    case 'mitm_unsupported':
      return 'Session bypass (unsupported protocol)';
    case 'mitm_no_request':
      return 'Session bypass (no request)';
    case 'mitm_websocket':
      return 'Session bypass (websocket)';
    default:
      return 'MITM bypassed';
  }
}

function summaryHas(entry: TrafficEntry, pattern: RegExp): boolean {
  return pattern.test(entry.captureSummary ?? '');
}

function mitmUnsupportedHint(entry: TrafficEntry): string {
  if (summaryHas(entry, /guess=http2/i)) return MITM_UNSUPPORTED_HTTP2_HINT;
  if (summaryHas(entry, /guess=non_http/i)) return MITM_UNSUPPORTED_BINARY_HINT;
  if (summaryHas(entry, /guess=http11/i)) return MITM_UNSUPPORTED_METHOD_HINT;
  return MITM_UNSUPPORTED_HINT;
}

function mitmNoRequestHint(entry: TrafficEntry): string {
  if (summaryHas(entry, /cause=timeout/i)) return MITM_NO_REQUEST_TIMEOUT_HINT;
  if (summaryHas(entry, /cause=eof|guess=empty/i)) return MITM_NO_REQUEST_EOF_HINT;
  return MITM_NO_REQUEST_HINT;
}

export function payloadUnavailableHint(entry: TrafficEntry): string | null {
  if (entry.httpPayloadAvailable === false) {
    const summary =
      entry.captureSummary ??
      'TLS tunnel passthrough: HTTP payload is unavailable without HTTPS decrypt.';
    if (entry.reasonCode === 'mitm_bypassed') {
      return `${summary}\n\n${mitmBypassedHint(entry)}`;
    }
    if (entry.reasonCode === 'mitm_handshake_failed') {
      return `${summary}\n\n${TRUST_HINT}`;
    }
    if (entry.reasonCode === 'mitm_unsupported') {
      return `${summary}\n\n${mitmUnsupportedHint(entry)}`;
    }
    if (entry.reasonCode === 'mitm_no_request') {
      return `${summary}\n\n${mitmNoRequestHint(entry)}`;
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
    if (
      entry.reasonCode === 'http_upstream_failed' ||
      entry.reasonCode === 'http_upstream_timeout'
    ) {
      return `${summary}\n\n${HTTP_UPSTREAM_FAILED_HINT}`;
    }
    if (entry.reasonCode === 'http_dns_failed') {
      return `${summary}\n\n${UPSTREAM_DNS_FAILED_HINT}`;
    }
    if (entry.reasonCode === 'upstream_connect_failed') {
      return `${summary}\n\n${UPSTREAM_CONNECT_FAILED_HINT}`;
    }
    if (entry.reasonCode === 'http_cleartext_blocked') {
      return `${summary}\n\n${HTTP_CLEAR_BLOCKED_HINT}`;
    }
    return summary;
  }
  return null;
}

export function decryptHelpHint(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return mitmBypassedHint(entry);
  if (entry.reasonCode === 'mitm_handshake_failed') return TRUST_HINT;
  if (entry.reasonCode === 'mitm_unsupported') return mitmUnsupportedHint(entry);
  if (entry.reasonCode === 'mitm_no_request') return mitmNoRequestHint(entry);
  if (entry.reasonCode === 'mitm_websocket') return MITM_WEBSOCKET_HINT;
  if (entry.reasonCode === 'websocket_relay') return WEBSOCKET_RELAY_HINT;
  if (entry.reasonCode === 'alpn_no_http11') return ALPN_NO_HTTP11_HINT;
  if (entry.reasonCode === 'mitm_error') return MITM_ERROR_HINT;
  if (entry.reasonCode === 'http_upstream_failed' || entry.reasonCode === 'http_upstream_timeout')
    return HTTP_UPSTREAM_FAILED_HINT;
  if (entry.reasonCode === 'http_dns_failed') return UPSTREAM_DNS_FAILED_HINT;
  if (entry.reasonCode === 'upstream_connect_failed') return UPSTREAM_CONNECT_FAILED_HINT;
  if (entry.reasonCode === 'http_cleartext_blocked') return HTTP_CLEAR_BLOCKED_HINT;
  return null;
}

export function decryptHelpTitle(entry: TrafficEntry): string | null {
  if (entry.reasonCode === 'mitm_bypassed') return mitmBypassedTitle(entry);
  if (entry.reasonCode === 'mitm_handshake_failed') return 'TLS trust / handshake';
  if (entry.reasonCode === 'mitm_unsupported') {
    if (summaryHas(entry, /guess=http2/i)) return 'HTTP/2 after MITM (bypassed)';
    if (summaryHas(entry, /guess=non_http/i)) return 'Non-HTTP after MITM (bypassed)';
    if (summaryHas(entry, /guess=http11/i)) return 'Unsupported method (bypassed)';
    return 'Unsupported protocol (bypassed)';
  }
  if (entry.reasonCode === 'mitm_no_request') {
    if (summaryHas(entry, /cause=timeout/i)) return 'No HTTP after MITM (timeout)';
    if (summaryHas(entry, /cause=eof|guess=empty/i)) return 'Client closed after MITM';
    return 'No HTTP after MITM (bypassed)';
  }
  if (entry.reasonCode === 'mitm_websocket') return 'WebSocket (legacy)';
  if (entry.reasonCode === 'websocket_relay') return 'WebSocket relay';
  if (entry.reasonCode === 'alpn_no_http11') return 'ALPN without HTTP/1.1';
  if (entry.reasonCode === 'mitm_error') return 'MITM protocol mismatch';
  if (entry.reasonCode === 'http_upstream_failed') return 'HTTP upstream failed';
  if (entry.reasonCode === 'http_upstream_timeout') return 'HTTP upstream timeout';
  if (entry.reasonCode === 'http_dns_failed') return 'Upstream DNS failed';
  if (entry.reasonCode === 'upstream_connect_failed') return 'Upstream connect failed';
  if (entry.reasonCode === 'http_cleartext_blocked') return 'HTTP cleartext blocked';
  return null;
}

export function httpPayloadLabel(entry: TrafficEntry): string {
  if (entry.httpPayloadAvailable == null) return 'unknown';
  return entry.httpPayloadAvailable ? 'available' : 'unavailable';
}
