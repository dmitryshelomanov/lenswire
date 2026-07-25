import { statusClassOf, type TrafficEntry, type TrafficFilters } from './types';

export function filterEntries(entries: TrafficEntry[], filters: TrafficFilters): TrafficEntry[] {
  const q = filters.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.method !== 'ALL' && entry.method !== filters.method) return false;
    if (filters.statusClass !== 'ALL' && statusClassOf(entry.status) !== filters.statusClass) {
      return false;
    }
    if (!q) return true;

    const haystack = `${entry.method} ${entry.host} ${entry.path} ${entry.query} ${entry.status}`.toLowerCase();
    return haystack.includes(q);
  });
}
