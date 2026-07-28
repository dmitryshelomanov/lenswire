export type HttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT';

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

export type HeaderMap = Record<string, string>;

export type BodyKind = 'json' | 'text' | 'empty' | 'binary' | 'image';

export type TrafficBody = {
  kind: BodyKind;
  /** Pretty or raw text when kind is json/text; omitted for empty/binary/image */
  text?: string;
  size: number;
  truncated?: boolean;
  /** Base64 preview for binary/image (capped by native). */
  previewBase64?: string;
  /** True when Content-Encoding was inflated before classify. */
  encodingDecoded?: boolean;
};

export type TrafficTiming = {
  dnsMs: number;
  connectMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
};

/** Why a flow was decrypted or left as tunnel-only (Android Path B). */
export type CaptureReasonCode =
  | 'decrypted'
  | 'http_plain'
  | 'passthrough'
  | 'decrypt_disabled'
  | 'ca_missing'
  | 'ip_no_sni'
  | 'no_client_hello'
  | 'mitm_bypassed'
  | 'mitm_fail_open'
  | 'mitm_handshake_failed'
  | 'mitm_error'
  | 'upstream_connect_failed'
  | string;

export type HostnameSource = 'sni' | 'connect' | 'host_header' | 'ip' | string;

export type HostnameConfidence = 'high' | 'medium' | 'low' | string;

export type CaptureMode = 'http' | 'mitm' | 'tunnel' | string;

export type OverrideKind = 'request' | 'response';

export type OverrideApplied = OverrideKind;

export type OverrideRule = {
  id: string;
  enabled: boolean;
  kind: OverrideKind;
  method: HttpMethod;
  scheme: 'http' | 'https';
  host: string;
  path: string;
  query: string;
  /** Response mock status; unused for request rules (default 200). */
  status: number;
  contentType: string;
  /** Extra headers to merge/set; empty value removes that header. */
  headers: HeaderMap;
  bodyText: string;
  createdAt: number;
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
  /** Set when a content override mutated this capture. */
  overrideApplied?: OverrideApplied | null;
  reasonCode?: CaptureReasonCode;
  hostnameSource?: HostnameSource;
  hostnameConfidence?: HostnameConfidence;
  sniHostname?: string | null;
  rawTarget?: string | null;
  connectTarget?: string | null;
  connectHost?: string | null;
  connectPort?: number | null;
  effectiveHost?: string | null;
  captureMode?: CaptureMode;
  httpPayloadAvailable?: boolean | null;
  captureSummary?: string | null;
  tlsClientHelloBytes?: number | null;
  tlsRecordVersion?: string | null;
  tlsClientVersion?: string | null;
  tlsAlpnProtocols?: string[] | null;
  tlsSniPresent?: boolean | null;
};

export type ProxyStatus = 'stopped' | 'listening';

export type ProxySettings = {
  host: string;
  port: number;
  httpsDecrypt: boolean;
};

export type ProbeType =
  'http_get' | 'https_get' | 'post_json' | 'post_form_urlencoded' | 'post_multipart' | 'get_image';

export type ProbeScheme = 'http' | 'https';

export type CertificateStatus = 'not_generated' | 'ready';

export type CertificateInfo = {
  status: CertificateStatus;
  fingerprint: string | null;
  generatedAt: number | null;
};

export type ResourceKind =
  'xhr' | 'doc' | 'css' | 'js' | 'font' | 'img' | 'media' | 'grpc' | 'other';

export type ResourceType = ResourceKind | 'ALL';

export type TrafficFilters = {
  query: string;
  method: HttpMethod | 'ALL';
  resourceType: ResourceType;
  statusClass: StatusClass | 'ALL';
  scheme: 'ALL' | 'http' | 'https';
  captureMode: 'ALL' | 'http' | 'mitm' | 'tunnel';
  overriddenOnly: boolean;
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

export function captureModeLabel(mode: CaptureMode | undefined): string {
  if (mode === 'mitm') return 'MITM';
  if (mode === 'tunnel') return 'TUNNEL';
  if (mode === 'http') return 'HTTP';
  if (!mode) return 'UNKNOWN';
  return mode.toUpperCase();
}
