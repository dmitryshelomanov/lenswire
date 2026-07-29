import type { HeaderMap, OverrideKind, OverrideRule, TrafficEntry } from '@/entities/traffic/types';

export type HeaderRow = {
  id: string;
  name: string;
  value: string;
};

type DraftSeed = {
  draft: OverrideRule;
  headerRows: HeaderRow[];
};
const MANAGED_HEADER_NAMES = new Set(['content-type', 'content-length', 'transfer-encoding']);

export function newHeaderRowId(): string {
  return `hdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function rowsFromHeaders(headers: HeaderMap | undefined): HeaderRow[] {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    id: newHeaderRowId(),
    name,
    value,
  }));
}

export function headersFromRows(rows: HeaderRow[]): HeaderMap {
  const out: HeaderMap = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    out[name] = row.value;
  }
  return out;
}

export function guessContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.js')) return 'application/javascript';
  return 'text/plain';
}

export function seedOverrideDraft(
  existing: OverrideRule | undefined,
  entry: TrafficEntry | undefined,
  kind: OverrideKind,
): DraftSeed | null {
  if (existing) {
    return {
      draft: { ...existing, headers: existing.headers ?? {} },
      headerRows: rowsFromHeaders(existing.headers),
    };
  }
  if (entry) {
    const next = draftFromEntry(entry, kind);
    return { draft: next, headerRows: rowsFromHeaders(next.headers) };
  }
  return null;
}

function contentTypeFromHeaders(headers: HeaderMap): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
  return entry?.[1] ?? 'application/json';
}

function headersFromEntry(headers: HeaderMap): HeaderMap {
  const out: HeaderMap = {};
  for (const [key, value] of Object.entries(headers)) {
    if (MANAGED_HEADER_NAMES.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function draftFromEntry(entry: TrafficEntry, kind: OverrideKind): OverrideRule {
  const isResponse = kind === 'response';
  return {
    id: `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    kind,
    method: entry.method,
    scheme: entry.scheme,
    host: entry.host,
    path: entry.path || '/',
    query: entry.query || '',
    status: isResponse ? entry.status || 200 : 200,
    contentType: isResponse
      ? contentTypeFromHeaders(entry.responseHeaders)
      : contentTypeFromHeaders(entry.requestHeaders),
    headers: isResponse
      ? headersFromEntry(entry.responseHeaders)
      : headersFromEntry(entry.requestHeaders),
    bodyText: isResponse ? (entry.responseBody.text ?? '') : (entry.requestBody.text ?? ''),
    createdAt: Date.now(),
  };
}
