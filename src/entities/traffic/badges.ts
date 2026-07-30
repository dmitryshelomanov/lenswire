import { contentTypeMime } from '@/entities/traffic/headers';
import type { HttpMethod, TrafficEntry } from '@/entities/traffic/types';

type BadgeVariant = 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'info';

export type HttpVersionLabel = 'HTTP/1.1' | 'HTTP/2';

const HTTP2_SNIFF_RE = /(?:^|[\s;])guess=http2(?:[\s;]|$)/i;
const HTTP2_PRI_RE = /(?:^|[\s;])method=PRI(?:[\s;]|$)/i;

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

export function reasonLabel(reasonCode: string | undefined): string | null {
  if (!reasonCode) return null;
  switch (reasonCode) {
    case 'decrypted':
      return 'decrypted';
    case 'http_plain':
      return 'http';
    case 'decrypt_disabled':
      return 'tls off';
    case 'ca_missing':
      return 'no ca';
    case 'ip_no_sni':
      return 'no sni';
    case 'mitm_bypassed':
      return 'bypassed';
    case 'mitm_fail_open':
      return 'fail-open';
    case 'mitm_handshake_failed':
      return 'trust?';
    case 'passthrough':
      return 'tunnel';
    default:
      return reasonCode.replace(/_/g, ' ');
  }
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
 * Wire HTTP version when known: decrypted payload → HTTP/1.1;
 * tunnel with MITM sniff `guess=http2` / `method=PRI` → HTTP/2; otherwise unknown.
 */
export function httpVersionLabel(entry: TrafficEntry): HttpVersionLabel | null {
  if (entry.httpPayloadAvailable === true) return 'HTTP/1.1';
  if (entry.captureMode !== 'tunnel') return null;
  const summary = entry.captureSummary;
  if (!summary) return null;
  if (HTTP2_SNIFF_RE.test(summary) || HTTP2_PRI_RE.test(summary)) return 'HTTP/2';
  return null;
}
