import * as React from 'react';

import type { OverrideKind, OverrideRule, TrafficEntry } from '@/entities/traffic/types';
import { getOverrides, setOverrides } from '@/shared/api/native-proxy';

function newId(): string {
  return `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const MANAGED_HEADER_NAMES = new Set(['content-type', 'content-length', 'transfer-encoding']);

export function contentTypeFromHeaders(headers: Record<string, string>): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
  return entry?.[1] ?? 'application/json';
}

/** Seed override headers from a capture, excluding hop-by-hop / content-type (dedicated field). */
export function headersFromEntry(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (MANAGED_HEADER_NAMES.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

/** Overrides need a decrypted HTTP exchange (not CONNECT tunnel passthrough). */
export function canCreateOverride(entry: TrafficEntry): boolean {
  if (entry.httpPayloadAvailable === false) return false;
  if (entry.method === 'CONNECT') return false;
  return true;
}

export function ruleFromEntry(
  entry: TrafficEntry,
  kind: OverrideKind,
  overrides?: Partial<
    Pick<OverrideRule, 'bodyText' | 'status' | 'contentType' | 'headers' | 'enabled'>
  >,
): OverrideRule {
  const isResponse = kind === 'response';
  return {
    id: newId(),
    enabled: overrides?.enabled ?? true,
    kind,
    method: entry.method,
    scheme: entry.scheme,
    host: entry.host,
    path: entry.path || '/',
    query: entry.query || '',
    status: overrides?.status ?? (isResponse ? entry.status || 200 : 200),
    contentType:
      overrides?.contentType ??
      (isResponse
        ? contentTypeFromHeaders(entry.responseHeaders)
        : contentTypeFromHeaders(entry.requestHeaders)),
    headers:
      overrides?.headers ??
      (isResponse
        ? headersFromEntry(entry.responseHeaders)
        : headersFromEntry(entry.requestHeaders)),
    bodyText:
      overrides?.bodyText ??
      (isResponse ? (entry.responseBody.text ?? '') : (entry.requestBody.text ?? '')),
    createdAt: Date.now(),
  };
}

type OverridesSnapshot = {
  rules: OverrideRule[];
  ready: boolean;
};

let snapshot: OverridesSnapshot = { rules: [], ready: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OverridesSnapshot {
  return snapshot;
}

function setSnapshot(next: OverridesSnapshot) {
  snapshot = next;
  emit();
}

function reloadStore() {
  try {
    setSnapshot({ rules: getOverrides(), ready: true });
  } catch {
    setSnapshot({ rules: [], ready: true });
  }
}

function persist(next: OverrideRule[]) {
  setSnapshot({ rules: next, ready: true });
  try {
    setOverrides(next);
  } catch {
    // Native bridge unavailable (web); keep UI state.
  }
}

function upsertRule(rule: OverrideRule) {
  const rules = snapshot.rules;
  const idx = rules.findIndex((item) => item.id === rule.id);
  if (idx >= 0) {
    const next = [...rules];
    next[idx] = rule;
    persist(next);
    return;
  }
  const sameMatch = rules.findIndex(
    (item) =>
      item.kind === rule.kind &&
      item.method === rule.method &&
      item.scheme === rule.scheme &&
      item.host.toLowerCase() === rule.host.toLowerCase() &&
      item.path === rule.path &&
      item.query === rule.query,
  );
  if (sameMatch >= 0) {
    const next = [...rules];
    next[sameMatch] = { ...rule, id: next[sameMatch].id };
    persist(next);
    return;
  }
  persist([rule, ...rules]);
}

function removeRule(id: string) {
  persist(snapshot.rules.filter((item) => item.id !== id));
}

function toggleRule(id: string) {
  persist(
    snapshot.rules.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
  );
}

export function useOverrides(): {
  rules: OverrideRule[];
  ready: boolean;
  upsertRule: (rule: OverrideRule) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  reload: () => void;
} {
  const { rules, ready } = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    if (!snapshot.ready) {
      reloadStore();
    }
  }, []);

  return {
    rules,
    ready,
    upsertRule,
    removeRule,
    toggleRule,
    reload: reloadStore,
  };
}
