import { describe, expect, it } from 'vitest';

import type { OverrideRule } from '@/entities/traffic/types';

import {
  buildOverridesExport,
  mergeImportedOverrides,
  parseOverridesImport,
} from './overrides-io';

function rule(partial: Partial<OverrideRule> & Pick<OverrideRule, 'id'>): OverrideRule {
  return {
    enabled: true,
    kind: 'response',
    method: 'GET',
    scheme: 'https',
    host: 'example.com',
    path: '/',
    query: '',
    pathMatch: 'exact',
    matchHeaders: {},
    delayMs: 0,
    bodyMode: 'body',
    status: 200,
    contentType: 'application/json',
    headers: {},
    bodyText: '',
    createdAt: 10,
    ...partial,
  };
}

describe('overrides-io', () => {
  it('builds a versioned export payload', () => {
    const payload = buildOverridesExport([rule({ id: 'a', createdAt: 5 })]);
    expect(payload.version).toBe(1);
    expect(payload.rules).toHaveLength(1);
    expect(payload.exportedAt).toBeGreaterThan(0);
  });

  it('parses wrapped export and bare array', () => {
    const wrapped = parseOverridesImport(
      JSON.stringify(buildOverridesExport([rule({ id: 'a' }), rule({ id: 'b' })])),
    );
    expect(wrapped.map((item) => item.id).sort()).toEqual(['a', 'b']);

    const bare = parseOverridesImport(JSON.stringify([rule({ id: 'c' })]));
    expect(bare).toHaveLength(1);
    expect(bare[0]?.id).toBe('c');
  });

  it('rejects empty or invalid payloads', () => {
    expect(() => parseOverridesImport('{}')).toThrow(/No valid override/);
    expect(() => parseOverridesImport('[]')).toThrow(/No valid override/);
    expect(() => parseOverridesImport('not-json')).toThrow();
  });

  it('merges by id and sorts newest first', () => {
    const current = [rule({ id: 'keep', createdAt: 1 }), rule({ id: 'replace', createdAt: 2 })];
    const incoming = [rule({ id: 'replace', createdAt: 9, bodyText: 'new' }), rule({ id: 'fresh', createdAt: 8 })];
    const merged = mergeImportedOverrides(current, incoming);
    expect(merged.map((item) => item.id)).toEqual(['replace', 'fresh', 'keep']);
    expect(merged.find((item) => item.id === 'replace')?.bodyText).toBe('new');
  });
});
