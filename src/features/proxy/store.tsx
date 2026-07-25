import * as React from 'react';
import { Alert, Platform } from 'react-native';

import type {
  CertificateInfo,
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
  getProxyPort,
  getProxyStatus,
  isSimulator,
  sendProbe as apiSendProbe,
  startCapture,
  stopCapture,
} from '@/shared/api/native-proxy';

const DEFAULT_SETTINGS: ProxySettings = {
  host: '127.0.0.1',
  port: 9090,
  httpsDecrypt: true,
};

const DEFAULT_FILTERS: TrafficFilters = {
  query: '',
  method: 'ALL',
  statusClass: 'ALL',
};

const DEFAULT_CERTIFICATE: CertificateInfo = {
  status: 'not_generated',
  fingerprint: null,
  generatedAt: null,
};

const SIMULATOR_DEV_MESSAGE =
  'Simulator Dev Mode starts an in-process proxy (not Packet Tunnel). Generate CA, run npm run sim:trust-ca, Start, then Send test request.';

const ANDROID_DEV_MESSAGE =
  'Android MVP starts VpnService + local proxy on :9090. Generate/Install CA, allow VPN, then Send test request. Full HTTPS MITM comes later.';

type ProxyStoreValue = {
  status: ProxyStatus;
  settings: ProxySettings;
  recording: boolean;
  entries: TrafficEntry[];
  filters: TrafficFilters;
  certificate: CertificateInfo;
  simulator: boolean;
  probing: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  probe: () => Promise<void>;
  toggleRecording: () => void;
  clear: () => Promise<void>;
  setFilters: (patch: Partial<TrafficFilters>) => void;
  updateSettings: (patch: Partial<ProxySettings>) => void;
  generateCertificate: () => Promise<void>;
  getEntry: (id: string) => TrafficEntry | undefined;
};

const ProxyStoreContext = React.createContext<ProxyStoreValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function ProxyStoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<ProxyStatus>('stopped');
  const [settings, setSettings] = React.useState<ProxySettings>(DEFAULT_SETTINGS);
  const [recording, setRecording] = React.useState(true);
  const [entries, setEntries] = React.useState<TrafficEntry[]>([]);
  const [filters, setFiltersState] = React.useState<TrafficFilters>(DEFAULT_FILTERS);
  const [certificate, setCertificate] = React.useState<CertificateInfo>(DEFAULT_CERTIFICATE);
  const [simulator, setSimulator] = React.useState(false);
  const [probing, setProbing] = React.useState(false);
  const recordingRef = React.useRef(recording);
  const simulatorHintShown = React.useRef(false);

  React.useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  React.useEffect(() => {
    setStatus(getProxyStatus());
    setCertificate(getCertificateInfo());
    setSimulator(isSimulator());
    try {
      setSettings((prev) => ({ ...prev, port: getProxyPort() }));
    } catch {
      // Native module may be unavailable in some environments.
    }
  }, []);

  React.useEffect(() => {
    if (status !== 'listening') return;

    const pollTimer = setInterval(() => {
      if (!recordingRef.current) return;
      setEntries(getCaptures());
      setStatus(getProxyStatus());
    }, 1200);

    return () => clearInterval(pollTimer);
  }, [status]);

  const start = React.useCallback(async () => {
    try {
      const next = await startCapture(settings);
      setStatus(next);
      setRecording(true);
      setEntries(getCaptures());
      if (!simulatorHintShown.current) {
        if (Platform.OS === 'android') {
          simulatorHintShown.current = true;
          Alert.alert('Android capture', ANDROID_DEV_MESSAGE);
        } else if (isSimulator()) {
          simulatorHintShown.current = true;
          Alert.alert('Simulator Dev Mode', SIMULATOR_DEV_MESSAGE);
        }
      }
    } catch (error) {
      const hint =
        Platform.OS === 'android'
          ? 'Allow VPN in the system dialog, then tap Start again.'
          : 'On iPhone, VPN requires a paid Apple Developer team.';
      Alert.alert('Could not start capture', `${errorMessage(error)}\n\n${hint}`);
    }
  }, [settings]);

  const stop = React.useCallback(async () => {
    try {
      const next = await stopCapture();
      setStatus(next);
    } catch (error) {
      Alert.alert('Could not stop capture', errorMessage(error));
    }
  }, []);

  const probe = React.useCallback(async () => {
    setProbing(true);
    try {
      await apiSendProbe();
      // Proxy writes captures asynchronously; give it a moment then refresh.
      await new Promise((resolve) => setTimeout(resolve, 400));
      setEntries(getCaptures());
    } catch (error) {
      Alert.alert('Test request failed', errorMessage(error));
    } finally {
      setProbing(false);
    }
  }, []);

  const clear = React.useCallback(async () => {
    clearCapture();
    setEntries([]);
  }, []);

  const generateCertificate = React.useCallback(async () => {
    try {
      const info = await apiGenerateCertificate();
      setCertificate(info);
    } catch (error) {
      Alert.alert('Could not generate certificate', errorMessage(error));
    }
  }, []);

  const value = React.useMemo<ProxyStoreValue>(
    () => ({
      status,
      settings,
      recording,
      entries,
      filters,
      certificate,
      simulator,
      probing,
      start,
      stop,
      probe,
      toggleRecording: () => setRecording((v) => !v),
      clear,
      setFilters: (patch) => setFiltersState((prev) => ({ ...prev, ...patch })),
      updateSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      generateCertificate,
      getEntry: (entryId) => entries.find((e) => e.id === entryId),
    }),
    [
      status,
      settings,
      recording,
      entries,
      filters,
      certificate,
      simulator,
      probing,
      start,
      stop,
      probe,
      clear,
      generateCertificate,
    ],
  );

  return <ProxyStoreContext.Provider value={value}>{children}</ProxyStoreContext.Provider>;
}

export function useProxyStore(): ProxyStoreValue {
  const ctx = React.useContext(ProxyStoreContext);
  if (!ctx) {
    throw new Error('useProxyStore must be used within ProxyStoreProvider');
  }
  return ctx;
}
