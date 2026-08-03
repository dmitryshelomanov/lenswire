import * as React from 'react';

import { isInspectable } from '@/entities/traffic/badges';
import type { OverrideRule, TrafficEntry } from '@/entities/traffic/types';
import { getOverrides, setOverrides } from '@/shared/api/native-proxy';

import { rulesShareMatchKey } from '../lib/override-match-key';

export { matchHeadersKey, rulesShareMatchKey } from '../lib/override-match-key';
export { contentTypeFromHeaders, headersFromEntry } from '../lib/override-seed';

/** Overrides need a decrypted HTTP exchange (not CONNECT tunnel / websocket). */
export function canCreateOverride(entry: TrafficEntry): boolean {
  if (!isInspectable(entry)) return false;
  if (entry.method === 'CONNECT') return false;
  if (entry.status === 101) return false;
  if (
    entry.reasonCode === 'websocket_frames' ||
    entry.reasonCode === 'websocket_relay' ||
    entry.reasonCode === 'mitm_websocket'
  ) {
    return false;
  }

  if ((entry.wsFrames?.length ?? 0) > 0 || (entry.wsFrameCount ?? 0) > 0) return false;
  return true;
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
  const sameMatch = rules.findIndex((item) => rulesShareMatchKey(item, rule));
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
  replaceAll: (rules: OverrideRule[]) => void;
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
    replaceAll: persist,
    reload: reloadStore,
  };
}
