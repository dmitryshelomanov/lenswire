import { LenswireProxy } from 'lenswire-proxy';

import type {
  CertificateInfo,
  HeaderMap,
  OverrideApplied,
  OverrideKind,
  OverrideRule,
  ProbeScheme,
  ProbeType,
  ProxySettings,
  ProxyStatus,
  TrafficBody,
  TrafficEntry,
  TrafficTiming,
} from '@/entities/traffic/types';

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
  const size = Number(raw.size ?? 0);
  const truncated = raw.truncated === true;
  const encodingDecoded = raw.encodingDecoded === true;
  const previewBase64 =
    typeof raw.previewBase64 === 'string' && raw.previewBase64.length > 0
      ? raw.previewBase64
      : undefined;

  if (kind === 'json' || kind === 'text') {
    return {
      kind,
      text: String(raw.text ?? ''),
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
    dnsMs: Number(raw.dnsMs ?? 0),
    connectMs: Number(raw.connectMs ?? 0),
    tlsMs: Number(raw.tlsMs ?? 0),
    ttfbMs: Number(raw.ttfbMs ?? 0),
    downloadMs: Number(raw.downloadMs ?? 0),
    totalMs: Number(raw.totalMs ?? 0),
  };
}

function mapNativeCapture(raw: Record<string, unknown>): TrafficEntry {
  const sniRaw = raw.sniHostname;
  const alpnRaw = raw.tlsAlpnProtocols;
  const payloadFlag =
    raw.httpPayloadAvailable == null
      ? null
      : typeof raw.httpPayloadAvailable === 'boolean'
        ? raw.httpPayloadAvailable
        : String(raw.httpPayloadAvailable).toLowerCase() === 'true';
  return {
    id: String(raw.id ?? ''),
    startedAt: Number(raw.startedAt ?? Date.now()),
    method: String(raw.method ?? 'GET').toUpperCase() as TrafficEntry['method'],
    scheme: raw.scheme === 'https' ? 'https' : 'http',
    host: String(raw.host ?? 'unknown'),
    path: String(raw.path ?? '/'),
    query: String(raw.query ?? ''),
    status: Number(raw.status ?? 0),
    requestHeaders: asHeaderMap(raw.requestHeaders),
    responseHeaders: asHeaderMap(raw.responseHeaders),
    requestBody: asBody(raw.requestBody),
    responseBody: asBody(raw.responseBody),
    timing: asTiming(raw.timing),
    overrideApplied: asOverrideApplied(raw.overrideApplied),
    clientLabel: raw.clientLabel == null || raw.clientLabel === '' ? null : String(raw.clientLabel),
    clientPackage:
      raw.clientPackage == null || raw.clientPackage === '' ? null : String(raw.clientPackage),
    clientUid:
      raw.clientUid == null || Number.isNaN(Number(raw.clientUid)) ? null : Number(raw.clientUid),
    clientAttributionKind:
      raw.clientAttributionKind == null || raw.clientAttributionKind === ''
        ? null
        : String(raw.clientAttributionKind),
    reasonCode: raw.reasonCode != null ? String(raw.reasonCode) : undefined,
    hostnameSource: raw.hostnameSource != null ? String(raw.hostnameSource) : undefined,
    hostnameConfidence: raw.hostnameConfidence != null ? String(raw.hostnameConfidence) : undefined,
    sniHostname: sniRaw == null || sniRaw === '' ? null : String(sniRaw),
    rawTarget: raw.rawTarget == null || raw.rawTarget === '' ? null : String(raw.rawTarget),
    connectTarget:
      raw.connectTarget == null || raw.connectTarget === '' ? null : String(raw.connectTarget),
    connectHost: raw.connectHost == null || raw.connectHost === '' ? null : String(raw.connectHost),
    connectPort:
      raw.connectPort == null || Number.isNaN(Number(raw.connectPort))
        ? null
        : Number(raw.connectPort),
    effectiveHost:
      raw.effectiveHost == null || raw.effectiveHost === '' ? null : String(raw.effectiveHost),
    captureMode: raw.captureMode != null ? String(raw.captureMode) : undefined,
    httpPayloadAvailable: payloadFlag,
    captureSummary:
      raw.captureSummary == null || raw.captureSummary === '' ? null : String(raw.captureSummary),
    tlsClientHelloBytes:
      raw.tlsClientHelloBytes == null || Number.isNaN(Number(raw.tlsClientHelloBytes))
        ? null
        : Number(raw.tlsClientHelloBytes),
    tlsRecordVersion:
      raw.tlsRecordVersion == null || raw.tlsRecordVersion === ''
        ? null
        : String(raw.tlsRecordVersion),
    tlsClientVersion:
      raw.tlsClientVersion == null || raw.tlsClientVersion === ''
        ? null
        : String(raw.tlsClientVersion),
    tlsAlpnProtocols: Array.isArray(alpnRaw) ? alpnRaw.map((item) => String(item)) : null,
    tlsSniPresent:
      raw.tlsSniPresent == null
        ? null
        : typeof raw.tlsSniPresent === 'boolean'
          ? raw.tlsSniPresent
          : String(raw.tlsSniPresent).toLowerCase() === 'true',
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

function asOverrideRule(value: unknown): OverrideRule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kindRaw = String(raw.kind ?? '');
  const kind: OverrideKind | null =
    kindRaw === 'request' || kindRaw === 'response' ? kindRaw : null;
  if (!kind) return null;
  const schemeRaw = String(raw.scheme ?? 'https');
  const scheme = schemeRaw === 'http' ? 'http' : 'https';
  const method = String(raw.method ?? 'GET').toUpperCase() as OverrideRule['method'];
  return {
    id: String(raw.id ?? ''),
    enabled: raw.enabled !== false,
    kind,
    method,
    scheme,
    host: String(raw.host ?? ''),
    path: String(raw.path ?? '/') || '/',
    query: String(raw.query ?? ''),
    status: Number(raw.status ?? 200) || 200,
    contentType: String(raw.contentType ?? ''),
    headers: asOverrideHeaders(raw.headers),
    bodyText: String(raw.bodyText ?? ''),
    createdAt: Number(raw.createdAt ?? Date.now()) || Date.now(),
  };
}

export function getOverrides(): OverrideRule[] {
  try {
    const raw = LenswireProxy.getOverrides();
    const parsed = JSON.parse(raw || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => asOverrideRule(item))
      .filter((item): item is OverrideRule => item != null && item.id.length > 0);
  } catch {
    return [];
  }
}

export function setOverrides(rules: OverrideRule[]): void {
  LenswireProxy.setOverrides(JSON.stringify(rules));
}

export function getProxyPort(): number {
  return LenswireProxy.getProxyPort();
}

export function getCaptures(): TrafficEntry[] {
  return LenswireProxy.getCaptures().map((item) =>
    mapNativeCapture(item as Record<string, unknown>),
  );
}

export function getProxyStatus(): ProxyStatus {
  return LenswireProxy.getStatus() === 'listening' ? 'listening' : 'stopped';
}

export function setHttpsDecrypt(enabled: boolean): void {
  LenswireProxy.setHttpsDecrypt(enabled);
}

export function getHttpsDecrypt(): boolean {
  return LenswireProxy.getHttpsDecrypt();
}

export type ProxyDiagnostics = {
  status: string;
  lastError: string | null;
  runtime: Record<string, unknown> | null;
};

export function getDiagnostics(): ProxyDiagnostics {
  const value = LenswireProxy.getDiagnostics();
  return {
    status: String(value.status ?? 'stopped'),
    lastError: value.lastError ? String(value.lastError) : null,
    runtime:
      value.runtime && typeof value.runtime === 'object'
        ? (value.runtime as Record<string, unknown>)
        : null,
  };
}

export async function startCapture(settings: ProxySettings): Promise<ProxyStatus> {
  setHttpsDecrypt(settings.httpsDecrypt);
  await LenswireProxy.startCapture();
  return getProxyStatus();
}

export async function stopCapture(): Promise<ProxyStatus> {
  await LenswireProxy.stopCapture();
  return 'stopped';
}

export async function sendProbe(
  type: ProbeType = 'http_get',
  scheme: ProbeScheme = 'http',
): Promise<void> {
  await LenswireProxy.sendProbe(type, scheme === 'https');
}

export function clearCapture(): void {
  LenswireProxy.clearCaptures();
}

export async function generateCertificate(): Promise<CertificateInfo> {
  const info = await LenswireProxy.generateCertificate();
  return {
    status: info.status === 'ready' ? 'ready' : 'not_generated',
    fingerprint: info.fingerprint,
    generatedAt: info.generatedAt,
  };
}

export function getCertificateInfo(): CertificateInfo {
  const info = LenswireProxy.getCertificateInfo();
  return {
    status: info.status === 'ready' ? 'ready' : 'not_generated',
    fingerprint: info.fingerprint,
    generatedAt: info.generatedAt,
  };
}

export function getCertificateInstallUrl(): string | null {
  return LenswireProxy.getCertificateInstallUrl();
}

export function getCertificatePemPath(): string | null {
  return LenswireProxy.getCertificatePemPath();
}

export async function installCertificate(): Promise<void> {
  await LenswireProxy.installCertificate();
}
