import { LenswireProxy } from 'lenswire-proxy';

import type {
  CertificateInfo,
  OverrideRule,
  ProbeScheme,
  ProbeType,
  ProxySettings,
  ProxyStatus,
  TrafficEntry,
} from '@/entities/traffic/types';

import { asOverrideRule, mapNativeCapture } from './native-mappers';

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

export function getCapturesRevision(): number | null {
  try {
    const value = LenswireProxy.getCapturesRevision();
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getCaptures(): Promise<TrafficEntry[]> {
  const items = await LenswireProxy.getCaptures();
  return items.map((item) => mapNativeCapture(item as Record<string, unknown>));
}

export async function getCapture(id: string): Promise<TrafficEntry | null> {
  const item = await LenswireProxy.getCapture(id);
  if (!item) return null;
  return mapNativeCapture(item as Record<string, unknown>);
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

function mapCertificateInfo(info: {
  status?: unknown;
  fingerprint?: string | null;
  generatedAt?: number | null;
}): CertificateInfo {
  return {
    status: info.status === 'ready' ? 'ready' : 'not_generated',
    fingerprint: info.fingerprint ?? null,
    generatedAt: info.generatedAt ?? null,
  };
}

export async function generateCertificate(): Promise<CertificateInfo> {
  const info = await LenswireProxy.generateCertificate();
  return mapCertificateInfo(info);
}

export function getCertificateInfo(): CertificateInfo {
  const info = LenswireProxy.getCertificateInfo();
  return mapCertificateInfo(info);
}

export function getCertificateInstallUrl(): string | null {
  return LenswireProxy.getCertificateInstallUrl();
}

export function getCertificatePemPath(): string | null {
  return LenswireProxy.getCertificatePemPath();
}

/** Android: DER `.cer`; iOS: Documents PEM — for share / manual install. */
export function getCertificateExportPath(): string | null {
  return LenswireProxy.getCertificateExportPath();
}

export async function installCertificate(): Promise<void> {
  await LenswireProxy.installCertificate();
}
