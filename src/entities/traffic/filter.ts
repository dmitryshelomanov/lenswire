import { statusClassOf, type TrafficEntry, type TrafficFilters } from './types';

export function filterEntries(entries: TrafficEntry[], filters: TrafficFilters): TrafficEntry[] {
  const q = filters.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.method !== 'ALL' && entry.method !== filters.method) return false;
    if (filters.statusClass !== 'ALL' && statusClassOf(entry.status) !== filters.statusClass) {
      return false;
    }
    if (filters.scheme !== 'ALL' && entry.scheme !== filters.scheme) return false;
    if (filters.captureMode !== 'ALL' && entry.captureMode !== filters.captureMode) return false;
    if (filters.overriddenOnly && entry.overrideApplied == null) return false;
    if (!q) return true;

    const haystack = [
      entry.method,
      entry.host,
      entry.path,
      entry.query,
      entry.status,
      entry.reasonCode,
      entry.hostnameSource,
      entry.sniHostname,
      entry.rawTarget,
      entry.connectTarget,
      entry.connectHost,
      entry.connectPort,
      entry.effectiveHost,
      entry.captureMode,
      entry.captureSummary,
      entry.scheme,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
