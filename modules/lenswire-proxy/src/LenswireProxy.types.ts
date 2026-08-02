export type NativeProxyStatus = 'stopped' | 'listening' | 'connecting' | 'error';

export type NativeProbeType =
  'http_get' | 'https_get' | 'post_json' | 'post_form_urlencoded' | 'post_multipart' | 'get_image';

export type NativeCertificateInfo = {
  status: 'not_generated' | 'ready';
  fingerprint: string | null;
  generatedAt: number | null;
};

export type NativeBody = {
  kind: 'json' | 'text' | 'empty' | 'binary' | 'image';
  text?: string;
  size: number;
  truncated?: boolean;
  previewBase64?: string;
  encodingDecoded?: boolean;
};

export type NativeTiming = {
  dnsMs: number;
  connectMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
};

export type NativeOverrideKind = 'request' | 'response';

export type NativeTrafficEntry = {
  id: string;
  startedAt: number;
  method: string;
  scheme: string;
  host: string;
  path: string;
  query: string;
  status: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: NativeBody;
  responseBody?: NativeBody;
  timing?: NativeTiming;
  overrideApplied?: NativeOverrideKind | null;
  reasonCode?: string;
  hostnameSource?: string;
  hostnameConfidence?: string;
  sniHostname?: string | null;
  rawTarget?: string | null;
  connectTarget?: string | null;
  connectHost?: string | null;
  connectPort?: number | null;
  effectiveHost?: string | null;
  captureMode?: string | null;
  httpPayloadAvailable?: boolean | null;
  captureSummary?: string | null;
  tlsClientHelloBytes?: number | null;
  tlsRecordVersion?: string | null;
  tlsClientVersion?: string | null;
  tlsAlpnProtocols?: string[] | null;
  tlsSniPresent?: boolean | null;
  tlsNegotiatedAlpn?: string | null;
  upstreamHttpVersion?: string | null;
  bypassCause?: string | null;
};

export type NativeDiagnostics = {
  status: string;
  lastError?: string | null;
  runtime?: Record<string, unknown>;
};
