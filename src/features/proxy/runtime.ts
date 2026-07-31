import { Alert, PermissionsAndroid, Platform } from 'react-native';

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
  getCapture,
  getCaptures,
  getCapturesRevision,
  getCertificateInfo,
  getHttpsDecrypt,
  getProxyPort,
  getProxyStatus,
  getRecordingPaused,
  sendProbe as apiSendProbe,
  setHttpsDecrypt,
  setRecordingPaused,
  startCapture,
  stopCapture,
} from '@/shared/api/native-proxy';
import { loadJson, saveJson } from '@/shared/lib/safe-async-storage';

import { mergeCaptures } from './lib/merge-captures';
import { createRuntimePolling } from './runtime-polling';
import { createRuntimeSlice } from './runtime-store';

const PINNED_HOSTS_KEY = 'lenswire.pinnedHosts';
const FILTERS_KEY = 'lenswire.trafficFilters';
const SETTINGS_KEY = 'lenswire.proxySettings';

const DEFAULT_SETTINGS: ProxySettings = {
  host: '127.0.0.1',
  port: 9090,
  httpsDecrypt: true,
};

const DEFAULT_FILTERS: TrafficFilters = {
  query: '',
  method: 'ALL',
  resourceType: 'ALL',
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

type ControlSlice = {
  status: ProxyStatus;
  recording: boolean;
  probing: boolean;
};

type CertificateState = {
  certificate: CertificateInfo;
  busy: boolean;
};

const controlSlice = createRuntimeSlice<ControlSlice>({
  status: 'stopped',
  recording: true,
  probing: false,
});

const entriesSlice = createRuntimeSlice<TrafficEntry[]>([]);
const filtersSlice = createRuntimeSlice<TrafficFilters>(DEFAULT_FILTERS);
const settingsSlice = createRuntimeSlice<ProxySettings>(DEFAULT_SETTINGS);
const certificateSlice = createRuntimeSlice<CertificateState>({
  certificate: DEFAULT_CERTIFICATE,
  busy: false,
});
const pinsSlice = createRuntimeSlice<string[]>([]);

let bootstrapped = false;
let lastCapturesRevision: number | null = null;

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

function parseFilters(value: string | null): TrafficFilters | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TrafficFilters>;
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return null;
  }
}

function parseSettings(value: string | null): Partial<ProxySettings> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ProxySettings>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
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
  polling.sync(next.status === 'listening' || next.status === 'connecting');
}

async function refreshCaptures(force = false): Promise<void> {
  try {
    const revision = getCapturesRevision();
    if (
      !force &&
      revision !== null &&
      lastCapturesRevision !== null &&
      revision === lastCapturesRevision
    ) {
      const nextStatus = getProxyStatus();
      if (nextStatus !== controlSlice.getSnapshot().status) {
        patchControl({ status: nextStatus });
      }
      return;
    }
    const next = await getCaptures();
    lastCapturesRevision = revision;
    const prev = entriesSlice.getSnapshot();
    entriesSlice.set(mergeCaptures(prev, next));
    const nextStatus = getProxyStatus();
    if (nextStatus !== controlSlice.getSnapshot().status) {
      patchControl({ status: nextStatus });
    }
  } catch {
    // Native module may be unavailable; keep previous entries.
  }
}

const polling = createRuntimePolling(
  refreshCaptures,
  () => controlSlice.getSnapshot().status === 'listening',
  1200,
);

function loadPins(): void {
  loadJson(PINNED_HOSTS_KEY, parsePinnedHosts)
    .then((hosts) => {
      if (hosts) pinsSlice.set(hosts);
    })
    .catch(() => {
      // Ignore storage errors; pins stay empty.
    });
}

function loadPersistedUiState(): void {
  loadJson(FILTERS_KEY, parseFilters)
    .then((filters) => {
      if (filters) filtersSlice.set(filters);
    })
    .catch(() => {});
  loadJson(SETTINGS_KEY, parseSettings)
    .then((stored) => {
      if (!stored) return;
      const prev = settingsSlice.getSnapshot();
      settingsSlice.set({
        ...prev,
        httpsDecrypt:
          typeof stored.httpsDecrypt === 'boolean' ? stored.httpsDecrypt : prev.httpsDecrypt,
      });
    })
    .catch(() => {});
}

export function ensureProxyRuntime(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  tryNativeCall(() => {
    const prev = settingsSlice.getSnapshot();
    settingsSlice.set({
      ...prev,
      host: '127.0.0.1',
      port: getProxyPort(),
      httpsDecrypt: getHttpsDecrypt(),
    });
    certificateSlice.set({
      certificate: getCertificateInfo(),
      busy: false,
    });
    const paused = getRecordingPaused();
    patchControl({
      status: getProxyStatus(),
      recording: !paused,
    });
  });
  void refreshCaptures(true);
  loadPins();
  loadPersistedUiState();
  polling.sync(
    controlSlice.getSnapshot().status === 'listening' ||
      controlSlice.getSnapshot().status === 'connecting',
  );
}

async function ensureAndroidNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // Optional; VPN can still start without notifications.
  }
}

export async function start(): Promise<void> {
  if (controlSlice.getSnapshot().status === 'connecting') return;
  patchControl({ status: 'connecting' });
  try {
    await ensureAndroidNotificationPermission();
    const next = await startCapture(settingsSlice.getSnapshot());
    tryNativeCall(() => setRecordingPaused(false));
    patchControl({ status: next, recording: true });
    void refreshCaptures(true);
  } catch (error) {
    patchControl({ status: getProxyStatus() === 'error' ? 'error' : 'stopped' });
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
    tryNativeCall(() => setRecordingPaused(false));
    patchControl({ status: next, recording: true });
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
    await refreshCaptures(true);
  } catch (error) {
    Alert.alert('Test request failed', errorMessage(error));
  } finally {
    patchControl({ probing: false });
  }
}

export function toggleRecording(): void {
  const nextRecording = !controlSlice.getSnapshot().recording;
  tryNativeCall(() => setRecordingPaused(!nextRecording));
  patchControl({ recording: nextRecording });
}

export async function clear(): Promise<void> {
  clearCapture();
  lastCapturesRevision = getCapturesRevision();
  entriesSlice.set([]);
}

export function setFilters(patch: Partial<TrafficFilters>): void {
  const next = { ...filtersSlice.getSnapshot(), ...patch };
  filtersSlice.set(next);
  saveJson(FILTERS_KEY, next);
}

export function updateSettings(patch: Partial<ProxySettings>): void {
  const nextHttpsDecrypt = patch.httpsDecrypt;
  const prev = settingsSlice.getSnapshot();
  const next: ProxySettings = {
    ...prev,
    httpsDecrypt:
      typeof nextHttpsDecrypt === 'boolean' ? nextHttpsDecrypt : prev.httpsDecrypt,
    // Host/port are fixed by the native module.
    host: '127.0.0.1',
    port: prev.port,
  };
  settingsSlice.set(next);
  saveJson(SETTINGS_KEY, { httpsDecrypt: next.httpsDecrypt });
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

export async function loadFullEntry(id: string): Promise<TrafficEntry | null> {
  try {
    return await getCapture(id);
  } catch {
    return getEntry(id) ?? null;
  }
}

export const proxyRuntime = {
  control: controlSlice,
  entries: entriesSlice,
  filters: filtersSlice,
  settings: settingsSlice,
  certificate: certificateSlice,
  pins: pinsSlice,
};
