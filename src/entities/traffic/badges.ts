import { contentTypeMime } from '@/entities/traffic/headers';
import type { HttpMethod, TrafficEntry } from '@/entities/traffic/types';

type BadgeVariant = 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'info';

export type HttpVersionLabel = 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';

/** True when request/response HTTP bodies were captured (MITM or cleartext). */
export function isInspectable(entry: TrafficEntry): boolean {
  return entry.httpPayloadAvailable === true;
}

export function clientOfferedAlpn(entry: TrafficEntry, name: string): boolean {
  const protocols = entry.tlsAlpnProtocols;
  if (!protocols?.length) return false;
  const target = name.toLowerCase();
  return protocols.some((p) => p.toLowerCase() === target);
}

function offeredH2(entry: TrafficEntry): boolean {
  return clientOfferedAlpn(entry, 'h2');
}

function offeredH3(entry: TrafficEntry): boolean {
  return clientOfferedAlpn(entry, 'h3');
}

export function methodBadgeVariant(method: HttpMethod): BadgeVariant {
  switch (method) {
    case 'GET':
      return 'info';
    case 'POST':
      return 'success';
    case 'PUT':
    case 'PATCH':
      return 'warning';
    case 'DELETE':
      return 'danger';
    case 'CONNECT':
      return 'default';
    default:
      return 'default';
  }
}

/**
 * Short reason badge. For `alpn_no_http11`, pass ALPN to pick h2/h3-only.
 * Optional `captureSummary` specializes mitm_unsupported / mitm_no_request labels.
 * Optional `bypassCause` specializes mitm_bypassed.
 * Omits redundant `decrypted` / `passthrough` (mode badge already covers those).
 */
export function reasonLabel(
  reasonCode: string | undefined,
  alpnProtocols?: string[] | null,
  captureSummary?: string | null,
  bypassCause?: string | null,
): string | null {
  if (!reasonCode) return null;
  switch (reasonCode) {
    case 'decrypted':
      return null;
    case 'http_plain':
      return 'http';
    case 'decrypt_disabled':
      return 'tls off';
    case 'ca_missing':
      return 'no ca';
    case 'ip_no_sni':
      return 'no sni';
    case 'mitm_bypassed':
      return bypassedReasonBadge(bypassCause);
    case 'mitm_fail_open':
      return 'fail-open';
    case 'mitm_handshake_failed':
      return 'trust?';
    case 'mitm_unsupported':
      return unsupportedReasonBadge(captureSummary);
    case 'mitm_no_request':
      return noRequestReasonBadge(captureSummary);
    case 'mitm_websocket':
      return 'websocket';
    case 'websocket_relay':
      return 'ws relay';
    case 'alpn_no_http11':
      return alpnOnlyReasonLabel(alpnProtocols);
    case 'http_upstream_failed':
      return 'http fail';
    case 'http_upstream_timeout':
      return 'http timeout';
    case 'http_dns_failed':
      return 'dns fail';
    case 'upstream_connect_failed':
      return 'upstream fail';
    case 'http_cleartext_blocked':
      return 'cleartext';
    case 'passthrough':
      return null;
    default:
      return reasonCode.replace(/_/g, ' ');
  }
}

function bypassedReasonBadge(cause: string | null | undefined): string {
  switch (cause) {
    case 'mitm_handshake_failed':
      return 'bypassed:trust';
    case 'mitm_unsupported':
      return 'bypassed:proto';
    case 'mitm_no_request':
      return 'bypassed:no req';
    case 'mitm_websocket':
      return 'bypassed:ws';
    default:
      return 'bypassed';
  }
}

function unsupportedReasonBadge(summary: string | null | undefined): string {
  const s = summary ?? '';
  if (/guess=http2/i.test(s)) return 'http2';
  if (/guess=non_http/i.test(s)) return 'binary';
  if (/guess=http11/i.test(s)) return 'bad method';
  return 'unsupported';
}

function noRequestReasonBadge(summary: string | null | undefined): string {
  const s = summary ?? '';
  if (/cause=timeout/i.test(s)) return 'no request';
  if (/cause=eof|guess=empty/i.test(s)) return 'client closed';
  return 'no request';
}

function alpnOnlyReasonLabel(alpnProtocols: string[] | null | undefined): string {
  const hasH2 = alpnProtocols?.some((p) => p.toLowerCase() === 'h2') ?? false;
  const hasH3 = alpnProtocols?.some((p) => p.toLowerCase() === 'h3') ?? false;
  if (hasH2) return 'h2-only';
  if (hasH3) return 'h3-only';
  return 'no h1.1';
}

export function statusBadgeVariant(status: number): BadgeVariant {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  return 'success';
}

/** True when request or response Content-Type MIME contains `+protobuf`. */
export function hasProtobufContentType(entry: TrafficEntry): boolean {
  const req = contentTypeMime(entry.requestHeaders);
  const res = contentTypeMime(entry.responseHeaders);
  return req.includes('+protobuf') || res.includes('+protobuf');
}

/**
 * Wire HTTP version when known:
 * - decrypted payload → HTTP/1.1
 * - tunnel + alpn_no_http11 → HTTP/2 or HTTP/3 from ClientHello ALPN
 * Post-MITM sniff failures use reason badge `http2` only (no version badge).
 */
export function httpVersionLabel(entry: TrafficEntry): HttpVersionLabel | null {
  if (entry.httpPayloadAvailable === true) return 'HTTP/1.1';
  if (entry.captureMode !== 'tunnel') return null;
  if (entry.reasonCode === 'alpn_no_http11') {
    if (offeredH2(entry)) return 'HTTP/2';
    if (offeredH3(entry)) return 'HTTP/3';
  }
  return null;
}
