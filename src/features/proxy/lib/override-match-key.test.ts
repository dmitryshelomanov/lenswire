import { describe, expect, it } from 'vitest';

import type { OverrideRule } from '@/entities/traffic/types';
import { matchHeadersKey, rulesShareMatchKey } from '@/features/proxy/lib/override-match-key';

function baseRule(overrides: Partial<OverrideRule> = {}): OverrideRule {
  return {
    id: 'rule-1',
    enabled: true,
    kind: 'response',
    method: 'GET',
    scheme: 'https',
    host: 'api.example.com',
    path: '/v1/items',
    query: '',
    pathMatch: 'exact',
    matchHeaders: {},
    delayMs: 0,
    bodyMode: 'body',
    status: 200,
    contentType: 'application/json',
    headers: {},
    bodyText: '{}',
    createdAt: 1,
    ...overrides,
  };
}

describe('rulesShareMatchKey', () => {
  it('treats exact and regex pathMatch as different matches', () => {
    const exact = baseRule({ pathMatch: 'exact' });
    const regex = baseRule({ id: 'rule-2', pathMatch: 'regex' });
    expect(rulesShareMatchKey(exact, regex)).toBe(false);
  });

  it('treats different matchHeaders as different matches', () => {
    const plain = baseRule();
    const withHeader = baseRule({ id: 'rule-2', matchHeaders: { Authorization: 'Bearer' } });
    expect(rulesShareMatchKey(plain, withHeader)).toBe(false);
  });

  it('normalizes matchHeaders name case and order', () => {
    expect(matchHeadersKey({ B: '2', A: '1' })).toBe(matchHeadersKey({ a: '1', b: '2' }));
    const left = baseRule({ matchHeaders: { 'X-Token': 'abc' } });
    const right = baseRule({ id: 'rule-2', matchHeaders: { 'x-token': 'abc' } });
    expect(rulesShareMatchKey(left, right)).toBe(true);
  });

  it('still collides when all match fields align', () => {
    const a = baseRule({ pathMatch: 'regex', matchHeaders: { Accept: 'json' } });
    const b = baseRule({ id: 'other', pathMatch: 'regex', matchHeaders: { Accept: 'json' } });
    expect(rulesShareMatchKey(a, b)).toBe(true);
  });
});
