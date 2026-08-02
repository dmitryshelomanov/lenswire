import type { HeaderMap, OverrideKind, OverrideRule, TrafficEntry } from '@/entities/traffic/types';

import { newOverrideId, ruleFromEntry } from './override-seed';

export type HeaderRow = {
  id: string;
  name: string;
  value: string;
};

type DraftSeed = {
  draft: OverrideRule;
  headerRows: HeaderRow[];
  matchHeaderRows: HeaderRow[];
};

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

function withRuleDefaults(rule: OverrideRule): OverrideRule {
  return {
    ...rule,
    pathMatch: rule.pathMatch === 'regex' ? 'regex' : 'exact',
    matchHeaders: rule.matchHeaders ?? {},
    delayMs: Number.isFinite(rule.delayMs) ? Math.max(0, Math.min(30_000, rule.delayMs)) : 0,
    bodyMode: rule.bodyMode === 'statusOnly' ? 'statusOnly' : 'body',
    headers: rule.headers ?? {},
  };
}

export function seedOverrideDraft(
  existing: OverrideRule | undefined,
  entry: TrafficEntry | undefined,
  kind: OverrideKind,
): DraftSeed | null {
  if (existing) {
    const draft = withRuleDefaults(existing);
    return {
      draft,
      headerRows: rowsFromHeaders(draft.headers),
      matchHeaderRows: rowsFromHeaders(draft.matchHeaders),
    };
  }
  if (entry) {
    const next = withRuleDefaults(ruleFromEntry(entry, kind, { id: newOverrideId() }));
    return {
      draft: next,
      headerRows: rowsFromHeaders(next.headers),
      matchHeaderRows: rowsFromHeaders(next.matchHeaders),
    };
  }
  return null;
}
