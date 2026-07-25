export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

export type HeaderMap = Record<string, string>;

export type BodyKind = 'json' | 'text' | 'empty' | 'binary';

export type TrafficBody = {
  kind: BodyKind;
  /** Pretty or raw text when kind is json/text; omitted for empty/binary */
  text?: string;
  size: number;
};

export type TrafficTiming = {
  dnsMs: number;
  connectMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
};

export type TrafficEntry = {
  id: string;
  startedAt: number;
  method: HttpMethod;
  scheme: 'http' | 'https';
  host: string;
  path: string;
  query: string;
  status: number;
  requestHeaders: HeaderMap;
  responseHeaders: HeaderMap;
  requestBody: TrafficBody;
  responseBody: TrafficBody;
  timing: TrafficTiming;
};

export type ProxyStatus = 'stopped' | 'listening';

export type ProxySettings = {
  host: string;
  port: number;
  httpsDecrypt: boolean;
};

export type CertificateStatus = 'not_generated' | 'ready';

export type CertificateInfo = {
  status: CertificateStatus;
  fingerprint: string | null;
  generatedAt: number | null;
};

export type TrafficFilters = {
  query: string;
  method: HttpMethod | 'ALL';
  statusClass: StatusClass | 'ALL';
};

export function statusClassOf(status: number): StatusClass {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function entryUrl(entry: TrafficEntry): string {
  const q = entry.query ? `?${entry.query}` : '';
  return `${entry.scheme}://${entry.host}${entry.path}${q}`;
}
