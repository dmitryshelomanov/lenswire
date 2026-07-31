import { describe, expect, it } from 'vitest';

import { makeTrafficEntry } from '@/entities/traffic/test-fixtures';

import { mergeCaptures } from './merge-captures';

describe('mergeCaptures', () => {
  it('reuses previous object identity when summary is unchanged', () => {
    const prev = [makeTrafficEntry({ id: 'a' }), makeTrafficEntry({ id: 'b', path: '/b' })];
    const next = [makeTrafficEntry({ id: 'a' }), makeTrafficEntry({ id: 'b', path: '/b' })];
    const merged = mergeCaptures(prev, next);
    expect(merged).toBe(prev);
    expect(merged[0]).toBe(prev[0]);
  });

  it('replaces only changed entries', () => {
    const prev = [makeTrafficEntry({ id: 'a', status: 200 }), makeTrafficEntry({ id: 'b' })];
    const next = [makeTrafficEntry({ id: 'a', status: 500 }), makeTrafficEntry({ id: 'b' })];
    const merged = mergeCaptures(prev, next);
    expect(merged[0]).not.toBe(prev[0]);
    expect(merged[0].status).toBe(500);
    expect(merged[1]).toBe(prev[1]);
  });
});
