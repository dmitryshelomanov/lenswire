export type NativeProxyStatus = 'stopped' | 'listening' | 'connecting';

export type NativeCertificateInfo = {
  status: 'not_generated' | 'ready';
  fingerprint: string | null;
  generatedAt: number | null;
};

export type NativeTrafficEntry = {
  id: string;
  startedAt: number;
  method: string;
  scheme: string;
  host: string;
  path: string;
  query: string;
  status: number;
};
