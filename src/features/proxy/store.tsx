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

function useRuntimeSlice<T>(slice: {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
}): T {
  useRuntimeBootstrap();
  return React.useSyncExternalStore(slice.subscribe, slice.getSnapshot, slice.getSnapshot);
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
  const control = useRuntimeSlice(proxyRuntime.control);

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
  const entries = useRuntimeSlice(proxyRuntime.entries);

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
  const filters = useRuntimeSlice(proxyRuntime.filters);

  return { filters, setFilters };
}

export function useProxySettings(): {
  settings: ProxySettings;
  updateSettings: (patch: Partial<ProxySettings>) => void;
} {
  const settings = useRuntimeSlice(proxyRuntime.settings);

  return { settings, updateSettings };
}

export function useProxyCertificate(): {
  certificate: CertificateInfo;
  busy: boolean;
  generateCertificate: () => Promise<void>;
} {
  const slice = useRuntimeSlice(proxyRuntime.certificate);

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
  const pinnedHosts = useRuntimeSlice(proxyRuntime.pins);

  return { pinnedHosts, togglePin };
}
