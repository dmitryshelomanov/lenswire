import { resourceTypeOf } from './resource-type';
import { type HeaderMap, statusClassOf, type TrafficEntry, type TrafficFilters } from './types';

function headersHaystack(headers: HeaderMap | undefined): string {
  if (!headers) return '';
  return Object.entries(headers)
    .flatMap(([key, value]) => [key, value])
    .join(' ');
}

export function entryMatchesQuery(
  entry: TrafficEntry,
  query: string,
  options?: { includeBodies?: boolean },
): boolean {
  const q = query.trim().toLowerCase();
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
    headersHaystack(entry.requestHeaders),
    headersHaystack(entry.responseHeaders),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes(q)) return true;

  if (!options?.includeBodies) return false;
  const bodies = [entry.requestBody?.text, entry.responseBody?.text]
    .filter((text): text is string => typeof text === 'string' && text.length > 0)
    .join(' ')
    .toLowerCase();
  return bodies.includes(q);
}

export function filterEntries(entries: TrafficEntry[], filters: TrafficFilters): TrafficEntry[] {
  const q = filters.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.method !== 'ALL' && entry.method !== filters.method) return false;
    if (
      filters.resourceType &&
      filters.resourceType !== 'ALL' &&
      resourceTypeOf(entry) !== filters.resourceType
    ) {
      return false;
    }
    if (filters.statusClass !== 'ALL' && statusClassOf(entry.status) !== filters.statusClass) {
      return false;
    }
    if (filters.scheme !== 'ALL' && entry.scheme !== filters.scheme) return false;
    if (filters.captureMode !== 'ALL' && entry.captureMode !== filters.captureMode) return false;
    if (filters.overriddenOnly && entry.overrideApplied == null) return false;
    if (!q) return true;
    return entryMatchesQuery(entry, q, { includeBodies: false });
  });
}
