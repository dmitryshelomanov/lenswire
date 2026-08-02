import type { HeaderMap, OverrideKind, OverrideRule, TrafficEntry } from '@/entities/traffic/types';

const MANAGED_HEADER_NAMES = new Set(['content-type', 'content-length', 'transfer-encoding']);

export function newOverrideId(): string {
  return `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function contentTypeFromHeaders(headers: HeaderMap): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
  return entry?.[1] ?? 'application/json';
}

/** Seed override headers from a capture, excluding hop-by-hop / content-type (dedicated field). */
export function headersFromEntry(headers: HeaderMap): HeaderMap {
  const out: HeaderMap = {};
  for (const [key, value] of Object.entries(headers)) {
    if (MANAGED_HEADER_NAMES.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export function ruleFromEntry(
  entry: TrafficEntry,
  kind: OverrideKind,
  overrides?: Partial<
    Pick<OverrideRule, 'bodyText' | 'status' | 'contentType' | 'headers' | 'enabled' | 'id'>
  >,
): OverrideRule {
  const isResponse = kind === 'response';
  return {
    id: overrides?.id ?? newOverrideId(),
    enabled: overrides?.enabled ?? true,
    kind,
    method: entry.method,
    scheme: entry.scheme,
    host: entry.host,
    path: entry.path || '/',
    query: entry.query || '',
    pathMatch: 'exact',
    matchHeaders: {},
    delayMs: 0,
    bodyMode: 'body',
    status: overrides?.status ?? (isResponse ? entry.status || 200 : 200),
    contentType:
      overrides?.contentType ??
      (isResponse
        ? contentTypeFromHeaders(entry.responseHeaders)
        : contentTypeFromHeaders(entry.requestHeaders)),
    headers:
      overrides?.headers ??
      (isResponse
        ? headersFromEntry(entry.responseHeaders)
        : headersFromEntry(entry.requestHeaders)),
    bodyText:
      overrides?.bodyText ??
      (isResponse ? (entry.responseBody.text ?? '') : (entry.requestBody.text ?? '')),
    createdAt: Date.now(),
  };
}
