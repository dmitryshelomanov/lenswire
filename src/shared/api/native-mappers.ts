import type {
  HeaderMap,
  OverrideApplied,
  OverrideKind,
  OverrideRule,
  TrafficBody,
  TrafficEntry,
  TrafficTiming,
} from '@/entities/traffic/types';

function asString(value: unknown, fallback = ''): string {
  return value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asNullableString(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function asHeaderMap(value: unknown): HeaderMap {
  if (!value || typeof value !== 'object') return {};
  const out: HeaderMap = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = String(entry ?? '');
  }
  return out;
}

function asBody(value: unknown): TrafficBody {
  if (!value || typeof value !== 'object') {
    return { kind: 'empty', size: 0 };
  }
  const raw = value as Record<string, unknown>;
  const kindRaw = String(raw.kind ?? 'empty');
  const kind: TrafficBody['kind'] =
    kindRaw === 'json' ||
    kindRaw === 'text' ||
    kindRaw === 'binary' ||
    kindRaw === 'image' ||
    kindRaw === 'empty'
      ? kindRaw
      : 'empty';
  const size = asNumber(raw.size, 0);
  const truncated = raw.truncated === true;
  const encodingDecoded = raw.encodingDecoded === true;
  const previewBase64 =
    typeof raw.previewBase64 === 'string' && raw.previewBase64.length > 0
      ? raw.previewBase64
      : undefined;

  if (kind === 'json' || kind === 'text') {
    return {
      kind,
      text: typeof raw.text === 'string' ? raw.text : '',
      size,
      truncated: truncated || undefined,
      encodingDecoded: encodingDecoded || undefined,
    };
  }
  if (kind === 'binary' || kind === 'image') {
    return {
      kind,
      size,
      truncated: truncated || undefined,
      previewBase64,
      encodingDecoded: encodingDecoded || undefined,
    };
  }
  return { kind: 'empty', size };
}

function asTiming(value: unknown): TrafficTiming {
  const empty: TrafficTiming = {
    dnsMs: 0,
    connectMs: 0,
    tlsMs: 0,
    ttfbMs: 0,
    downloadMs: 0,
    totalMs: 0,
  };
  if (!value || typeof value !== 'object') return empty;
  const raw = value as Record<string, unknown>;
  return {
    dnsMs: asNumber(raw.dnsMs),
    connectMs: asNumber(raw.connectMs),
    tlsMs: asNumber(raw.tlsMs),
    ttfbMs: asNumber(raw.ttfbMs),
    downloadMs: asNumber(raw.downloadMs),
    totalMs: asNumber(raw.totalMs),
  };
}

function asOverrideApplied(value: unknown): OverrideApplied | null | undefined {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (raw === 'request' || raw === 'response') return raw;
  return null;
}

function asOverrideHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') continue;
    const name = key.trim();
    if (!name) continue;
    out[name] = raw;
  }
  return out;
}

export function asOverrideRule(value: unknown): OverrideRule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kindRaw = String(raw.kind ?? '');
  const kind: OverrideKind | null =
    kindRaw === 'request' || kindRaw === 'response' ? kindRaw : null;
  if (!kind) return null;
  const schemeRaw = String(raw.scheme ?? 'https');
  const scheme = schemeRaw === 'http' ? 'http' : 'https';
  const method = String(raw.method ?? 'GET').toUpperCase() as OverrideRule['method'];
  const pathMatchRaw = String(raw.pathMatch ?? 'exact');
  const pathMatch = pathMatchRaw === 'regex' ? 'regex' : 'exact';
  const bodyModeRaw = String(raw.bodyMode ?? 'body');
  const bodyMode = bodyModeRaw === 'statusOnly' ? 'statusOnly' : 'body';
  const delayMs = Math.max(0, Math.min(30_000, asNumber(raw.delayMs, 0) || 0));
  return {
    id: asString(raw.id),
    enabled: raw.enabled !== false,
    kind,
    method,
    scheme,
    host: asString(raw.host),
    path: asString(raw.path, '/') || '/',
    query: asString(raw.query),
    pathMatch,
    matchHeaders: asOverrideHeaders(raw.matchHeaders),
    delayMs,
    bodyMode,
    status: asNumber(raw.status, 200) || 200,
    contentType: asString(raw.contentType),
    headers: asOverrideHeaders(raw.headers),
    bodyText: asString(raw.bodyText),
    createdAt: asNumber(raw.createdAt, Date.now()) || Date.now(),
  };
}

export function mapNativeCapture(raw: Record<string, unknown>): TrafficEntry {
  return {
    id: asString(raw.id),
    startedAt: asNumber(raw.startedAt, Date.now()),
    method: asString(raw.method, 'GET').toUpperCase() as TrafficEntry['method'],
    scheme: raw.scheme === 'https' ? 'https' : 'http',
    host: asString(raw.host, 'unknown'),
    path: asString(raw.path, '/'),
    query: asString(raw.query),
    status: asNumber(raw.status),
    requestHeaders: asHeaderMap(raw.requestHeaders),
    responseHeaders: asHeaderMap(raw.responseHeaders),
    requestBody: asBody(raw.requestBody),
    responseBody: asBody(raw.responseBody),
    timing: asTiming(raw.timing),
    overrideApplied: asOverrideApplied(raw.overrideApplied),
    clientLabel: asNullableString(raw.clientLabel),
    clientPackage: asNullableString(raw.clientPackage),
    clientUid: asNullableNumber(raw.clientUid),
    clientAttributionKind: asNullableString(raw.clientAttributionKind),
    reasonCode: raw.reasonCode != null ? String(raw.reasonCode) : undefined,
    hostnameSource: raw.hostnameSource != null ? String(raw.hostnameSource) : undefined,
    hostnameConfidence: raw.hostnameConfidence != null ? String(raw.hostnameConfidence) : undefined,
    sniHostname: asNullableString(raw.sniHostname),
    rawTarget: asNullableString(raw.rawTarget),
    connectTarget: asNullableString(raw.connectTarget),
    connectHost: asNullableString(raw.connectHost),
    connectPort: asNullableNumber(raw.connectPort),
    effectiveHost: asNullableString(raw.effectiveHost),
    captureMode: raw.captureMode != null ? String(raw.captureMode) : undefined,
    httpPayloadAvailable: asNullableBoolean(raw.httpPayloadAvailable),
    captureSummary: asNullableString(raw.captureSummary),
    tlsClientHelloBytes: asNullableNumber(raw.tlsClientHelloBytes),
    tlsRecordVersion: asNullableString(raw.tlsRecordVersion),
    tlsClientVersion: asNullableString(raw.tlsClientVersion),
    tlsAlpnProtocols: Array.isArray(raw.tlsAlpnProtocols)
      ? raw.tlsAlpnProtocols.map((item) => String(item))
      : null,
    tlsSniPresent: asNullableBoolean(raw.tlsSniPresent),
    tlsNegotiatedAlpn: asNullableString(raw.tlsNegotiatedAlpn),
    upstreamHttpVersion: asNullableString(raw.upstreamHttpVersion),
    bypassCause: asNullableString(raw.bypassCause),
  };
}
