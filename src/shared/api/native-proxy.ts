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

const DEFAULT_CERTIFICATE: CertificateInfo = {
  status: 'not_generated',
  fingerprint: null,
  generatedAt: null,
};

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
  try {
    LenswireProxy.setOverrides(JSON.stringify(rules));
  } catch {
    // Native module may be unavailable.
  }
}

export function getProxyPort(): number {
  try {
    const port = Number(LenswireProxy.getProxyPort());
    return Number.isFinite(port) && port > 0 ? port : 9090;
  } catch {
    return 9090;
  }
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
  try {
    const items = await LenswireProxy.getCaptures();
    return items.map((item) => mapNativeCapture(item as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function getCapture(id: string): Promise<TrafficEntry | null> {
  try {
    const item = await LenswireProxy.getCapture(id);
    if (!item) return null;
    return mapNativeCapture(item as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function getProxyStatus(): ProxyStatus {
  try {
    const status = LenswireProxy.getStatus();
    if (status === 'listening' || status === 'connecting' || status === 'error') {
      return status;
    }
    return 'stopped';
  } catch {
    return 'stopped';
  }
}

export function setRecordingPaused(paused: boolean): void {
  try {
    LenswireProxy.setRecordingPaused(paused);
  } catch {
    // Native module may be unavailable or method missing on older binaries.
  }
}

export function getRecordingPaused(): boolean {
  try {
    return Boolean(LenswireProxy.getRecordingPaused());
  } catch {
    return false;
  }
}

export function setHttpsDecrypt(enabled: boolean): void {
  try {
    LenswireProxy.setHttpsDecrypt(enabled);
  } catch {
    // Native module may be unavailable.
  }
}

export function getHttpsDecrypt(): boolean {
  try {
    return Boolean(LenswireProxy.getHttpsDecrypt());
  } catch {
    return true;
  }
}

export type ProxyDiagnostics = {
  status: string;
  lastError: string | null;
  runtime: Record<string, unknown> | null;
};

export function getDiagnostics(): ProxyDiagnostics {
  try {
    const value = LenswireProxy.getDiagnostics();
    return {
      status: String(value.status ?? 'stopped'),
      lastError: value.lastError ? String(value.lastError) : null,
      runtime:
        value.runtime && typeof value.runtime === 'object'
          ? (value.runtime as Record<string, unknown>)
          : null,
    };
  } catch {
    return { status: 'stopped', lastError: null, runtime: null };
  }
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
  try {
    LenswireProxy.clearCaptures();
  } catch {
    // Native module may be unavailable.
  }
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
  try {
    const info = LenswireProxy.getCertificateInfo();
    return mapCertificateInfo(info);
  } catch {
    return { ...DEFAULT_CERTIFICATE };
  }
}

export function getCertificateInstallUrl(): string | null {
  try {
    return LenswireProxy.getCertificateInstallUrl();
  } catch {
    return null;
  }
}

export function getCertificatePemPath(): string | null {
  try {
    return LenswireProxy.getCertificatePemPath();
  } catch {
    return null;
  }
}

/** Android: DER `.cer`; iOS: Documents PEM — for share / manual install. */
export function getCertificateExportPath(): string | null {
  try {
    return LenswireProxy.getCertificateExportPath();
  } catch {
    return null;
  }
}

export async function installCertificate(): Promise<void> {
  await LenswireProxy.installCertificate();
}
