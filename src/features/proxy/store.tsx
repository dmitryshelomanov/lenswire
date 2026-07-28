import * as React from 'react';

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
  clear,
  ensureProxyRuntime,
  generateCertificate,
  getEntry,
  probe,
  proxyRuntime,
  setFilters,
  start,
  stop,
  togglePin,
  toggleRecording,
  updateSettings,
} from './runtime';

function useRuntimeBootstrap(): void {
  React.useEffect(() => {
    ensureProxyRuntime();
  }, []);
}

export function useProxyStatus(): {
  status: ProxyStatus;
  recording: boolean;
  probing: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  probe: (type?: ProbeType, scheme?: ProbeScheme) => Promise<void>;
  toggleRecording: () => void;
} {
  useRuntimeBootstrap();
  const control = React.useSyncExternalStore(
    proxyRuntime.control.subscribe,
    proxyRuntime.control.getSnapshot,
    proxyRuntime.control.getSnapshot,
  );

  return {
    status: control.status,
    recording: control.recording,
    probing: control.probing,
    start,
    stop,
    probe,
    toggleRecording,
  };
}

export function useProxyEntries(): {
  entries: TrafficEntry[];
  getEntry: (id: string) => TrafficEntry | undefined;
  clear: () => Promise<void>;
} {
  useRuntimeBootstrap();
  const entries = React.useSyncExternalStore(
    proxyRuntime.entries.subscribe,
    proxyRuntime.entries.getSnapshot,
    proxyRuntime.entries.getSnapshot,
  );

  return {
    entries,
    getEntry,
    clear,
  };
}

export function useProxyFilters(): {
  filters: TrafficFilters;
  setFilters: (patch: Partial<TrafficFilters>) => void;
} {
  useRuntimeBootstrap();
  const filters = React.useSyncExternalStore(
    proxyRuntime.filters.subscribe,
    proxyRuntime.filters.getSnapshot,
    proxyRuntime.filters.getSnapshot,
  );

  return { filters, setFilters };
}

export function useProxySettings(): {
  settings: ProxySettings;
  updateSettings: (patch: Partial<ProxySettings>) => void;
} {
  useRuntimeBootstrap();
  const settings = React.useSyncExternalStore(
    proxyRuntime.settings.subscribe,
    proxyRuntime.settings.getSnapshot,
    proxyRuntime.settings.getSnapshot,
  );

  return { settings, updateSettings };
}

export function useProxyCertificate(): {
  certificate: CertificateInfo;
  busy: boolean;
  generateCertificate: () => Promise<void>;
} {
  useRuntimeBootstrap();
  const slice = React.useSyncExternalStore(
    proxyRuntime.certificate.subscribe,
    proxyRuntime.certificate.getSnapshot,
    proxyRuntime.certificate.getSnapshot,
  );

  return {
    certificate: slice.certificate,
    busy: slice.busy,
    generateCertificate,
  };
}

export function useProxyPins(): {
  pinnedHosts: string[];
  togglePin: (host: string) => void;
} {
  useRuntimeBootstrap();
  const pinnedHosts = React.useSyncExternalStore(
    proxyRuntime.pins.subscribe,
    proxyRuntime.pins.getSnapshot,
    proxyRuntime.pins.getSnapshot,
  );

  return { pinnedHosts, togglePin };
}
