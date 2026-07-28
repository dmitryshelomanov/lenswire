import { Alert, Platform } from 'react-native';

import type {
  CertificateInfo,
  ProbeScheme,
  ProbeType,
  ProxySettings,
  ProxyStatus,
  TrafficEntry,
  TrafficFilters,
} from '@/entities/traffic/types';
import {
  clearCapture,
  generateCertificate as apiGenerateCertificate,
  getCaptures,
  getCertificateInfo,
  getHttpsDecrypt,
  getProxyPort,
  getProxyStatus,
  sendProbe as apiSendProbe,
  setHttpsDecrypt,
  startCapture,
  stopCapture,
} from '@/shared/api/native-proxy';
import { loadJson, saveJson } from '@/shared/lib/safe-async-storage';

const PINNED_HOSTS_KEY = 'lenswire.pinnedHosts';

const DEFAULT_SETTINGS: ProxySettings = {
  host: '127.0.0.1',
  port: 9090,
  httpsDecrypt: true,
};

const DEFAULT_FILTERS: TrafficFilters = {
  query: '',
  method: 'ALL',
  statusClass: 'ALL',
  scheme: 'ALL',
  captureMode: 'ALL',
  overriddenOnly: false,
};

const DEFAULT_CERTIFICATE: CertificateInfo = {
  status: 'not_generated',
  fingerprint: null,
  generatedAt: null,
};

const ANDROID_DEV_MESSAGE =
  'Android: System CA required for Chrome decrypt (npm run android:trust-ca on rooted AVD). User CA alone breaks browsing. Pinned apps need separate Frida/LSPosed unpin. SNI MITM + TCP-only SOCKS (QUIC→TCP).';

type ControlSlice = {
  status: ProxyStatus;
  recording: boolean;
  probing: boolean;
};

type CertificateSlice = {
  certificate: CertificateInfo;
  busy: boolean;
};

function createSlice<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): T {
      return snapshot;
    },
    set(next: T): void {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const controlSlice = createSlice<ControlSlice>({
  status: 'stopped',
  recording: true,
  probing: false,
});

const entriesSlice = createSlice<TrafficEntry[]>([]);
const filtersSlice = createSlice<TrafficFilters>(DEFAULT_FILTERS);
const settingsSlice = createSlice<ProxySettings>(DEFAULT_SETTINGS);
const certificateSlice = createSlice<CertificateSlice>({
  certificate: DEFAULT_CERTIFICATE,
  busy: false,
});
const pinsSlice = createSlice<string[]>([]);

let bootstrapped = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let hintShown = false;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function tryNativeCall(fn: () => void): void {
  try {
    fn();
  } catch {
    // Native module may be unavailable in some environments.
  }
}

async function runAction(title: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    Alert.alert(title, errorMessage(error));
  }
}

function parsePinnedHosts(value: string | null): string[] | null {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function patchControl(patch: Partial<ControlSlice>): void {
  const prev = controlSlice.getSnapshot();
  const next = { ...prev, ...patch };
  if (
    next.status === prev.status &&
    next.recording === prev.recording &&
    next.probing === prev.probing
  ) {
    return;
  }
  controlSlice.set(next);
  syncPoll();
}

function refreshCaptures(): void {
  entriesSlice.set(getCaptures());
  const nextStatus = getProxyStatus();
  if (nextStatus !== controlSlice.getSnapshot().status) {
    patchControl({ status: nextStatus });
  }
}

function syncPoll(): void {
  const { status } = controlSlice.getSnapshot();
  if (status === 'listening') {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!controlSlice.getSnapshot().recording) return;
      refreshCaptures();
    }, 1200);
    return;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function loadPins(): void {
  loadJson(PINNED_HOSTS_KEY, parsePinnedHosts)
    .then((hosts) => {
      if (hosts) pinsSlice.set(hosts);
    })
    .catch(() => {
      // Ignore storage errors; pins stay empty.
    });
}

export function ensureProxyRuntime(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  refreshCaptures();
  certificateSlice.set({
    certificate: getCertificateInfo(),
    busy: false,
  });
  tryNativeCall(() => {
    const prev = settingsSlice.getSnapshot();
    settingsSlice.set({
      ...prev,
      port: getProxyPort(),
      httpsDecrypt: getHttpsDecrypt(),
    });
  });
  loadPins();
  syncPoll();
}

export async function start(): Promise<void> {
  try {
    const next = await startCapture(settingsSlice.getSnapshot());
    patchControl({ status: next, recording: true });
    refreshCaptures();
    if (!hintShown && Platform.OS === 'android') {
      hintShown = true;
      Alert.alert('Android capture', ANDROID_DEV_MESSAGE);
    }
  } catch (error) {
    const hint =
      Platform.OS === 'android'
        ? 'Allow VPN in the system dialog, then tap Start again.'
        : 'On iPhone, VPN requires a paid Apple Developer team.';
    Alert.alert('Could not start capture', `${errorMessage(error)}\n\n${hint}`);
  }
}

export async function stop(): Promise<void> {
  await runAction('Could not stop capture', async () => {
    const next = await stopCapture();
    patchControl({ status: next });
  });
}

export async function probe(
  type: ProbeType = 'http_get',
  scheme: ProbeScheme = 'http',
): Promise<void> {
  patchControl({ probing: true });
  try {
    await apiSendProbe(type, scheme);
    // Proxy writes captures asynchronously; give it a moment then refresh.
    await new Promise((resolve) => setTimeout(resolve, 400));
    refreshCaptures();
  } catch (error) {
    Alert.alert('Test request failed', errorMessage(error));
  } finally {
    patchControl({ probing: false });
  }
}

export function toggleRecording(): void {
  patchControl({ recording: !controlSlice.getSnapshot().recording });
}

export async function clear(): Promise<void> {
  clearCapture();
  entriesSlice.set([]);
}

export function setFilters(patch: Partial<TrafficFilters>): void {
  filtersSlice.set({ ...filtersSlice.getSnapshot(), ...patch });
}

export function updateSettings(patch: Partial<ProxySettings>): void {
  const nextHttpsDecrypt = patch.httpsDecrypt;
  const next = { ...settingsSlice.getSnapshot(), ...patch };
  settingsSlice.set(next);
  if (typeof nextHttpsDecrypt === 'boolean') {
    tryNativeCall(() => setHttpsDecrypt(nextHttpsDecrypt));
  }
}

export async function generateCertificate(): Promise<void> {
  const prev = certificateSlice.getSnapshot();
  certificateSlice.set({ ...prev, busy: true });
  try {
    const info = await apiGenerateCertificate();
    certificateSlice.set({ certificate: info, busy: false });
  } catch (error) {
    certificateSlice.set({ ...certificateSlice.getSnapshot(), busy: false });
    Alert.alert('Could not generate certificate', errorMessage(error));
  }
}

export function togglePin(host: string): void {
  const prev = pinsSlice.getSnapshot();
  const next = prev.includes(host) ? prev.filter((h) => h !== host) : [host, ...prev];
  pinsSlice.set(next);
  saveJson(PINNED_HOSTS_KEY, next);
}

export function getEntry(id: string): TrafficEntry | undefined {
  return entriesSlice.getSnapshot().find((entry) => entry.id === id);
}

export const proxyRuntime = {
  control: controlSlice,
  entries: entriesSlice,
  filters: filtersSlice,
  settings: settingsSlice,
  certificate: certificateSlice,
  pins: pinsSlice,
};
