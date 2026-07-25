import type { CertificateInfo, ProxySettings, ProxyStatus, TrafficEntry } from '@/entities/traffic/types';
import { LenswireProxy } from 'lenswire-proxy';

function mapNativeCapture(raw: Record<string, unknown>): TrafficEntry {
  return {
    id: String(raw.id ?? ''),
    startedAt: Number(raw.startedAt ?? Date.now()),
    method: String(raw.method ?? 'GET').toUpperCase() as TrafficEntry['method'],
    scheme: raw.scheme === 'https' ? 'https' : 'http',
    host: String(raw.host ?? 'unknown'),
    path: String(raw.path ?? '/'),
    query: String(raw.query ?? ''),
    status: Number(raw.status ?? 0),
    requestHeaders: {},
    responseHeaders: {},
    requestBody: { kind: 'empty', size: 0 },
    responseBody: { kind: 'empty', size: 0 },
    timing: { dnsMs: 0, connectMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0, totalMs: 0 },
  };
}

export function isSimulator(): boolean {
  return LenswireProxy.isSimulator();
}

export function getProxyPort(): number {
  return LenswireProxy.getProxyPort();
}

export function getCaptures(): TrafficEntry[] {
  return LenswireProxy.getCaptures().map((item) => mapNativeCapture(item as Record<string, unknown>));
}

export function getProxyStatus(): ProxyStatus {
  return LenswireProxy.getStatus() === 'listening' ? 'listening' : 'stopped';
}

export async function startCapture(_settings: ProxySettings): Promise<ProxyStatus> {
  await LenswireProxy.startCapture();
  return getProxyStatus();
}

export async function stopCapture(): Promise<ProxyStatus> {
  await LenswireProxy.stopCapture();
  return 'stopped';
}

export async function sendProbe(): Promise<void> {
  await LenswireProxy.sendProbe();
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
