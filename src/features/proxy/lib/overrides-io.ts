import type { OverrideRule } from '@/entities/traffic/types';
import { asOverrideRule } from '@/shared/api/native-mappers';

export const OVERRIDES_EXPORT_VERSION = 1 as const;

export type OverridesExportPayload = {
  version: typeof OVERRIDES_EXPORT_VERSION;
  exportedAt: number;
  rules: OverrideRule[];
};

export function buildOverridesExport(rules: OverrideRule[]): OverridesExportPayload {
  return {
    version: OVERRIDES_EXPORT_VERSION,
    exportedAt: Date.now(),
    rules,
  };
}

/** Merge imported rules by id (replace existing ids; keep others). */
export function mergeImportedOverrides(
  current: OverrideRule[],
  incoming: OverrideRule[],
): OverrideRule[] {
  const byId = new Map(current.map((rule) => [rule.id, rule]));
  for (const rule of incoming) {
    byId.set(rule.id, rule);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function parseOverridesImport(raw: string): OverrideRule[] {
  const parsed = JSON.parse(raw) as unknown;
  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.rules)) items = obj.rules;
  }
  const rules = items
    .map((item) => asOverrideRule(item))
    .filter((item): item is OverrideRule => item != null && item.id.length > 0);
  if (rules.length === 0) {
    throw new Error('No valid override rules found in file.');
  }
  return rules;
}
