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

  it('replaces when wsFrameCount or wsFramesOmitted changes', () => {
    const prev = [makeTrafficEntry({ id: 'a', wsFrameCount: 1, wsFramesOmitted: false })];
    const nextCount = [makeTrafficEntry({ id: 'a', wsFrameCount: 2, wsFramesOmitted: false })];
    const mergedCount = mergeCaptures(prev, nextCount);
    expect(mergedCount[0]).not.toBe(prev[0]);
    expect(mergedCount[0].wsFrameCount).toBe(2);

    const nextOmitted = [makeTrafficEntry({ id: 'a', wsFrameCount: 2, wsFramesOmitted: true })];
    const mergedOmitted = mergeCaptures(mergedCount, nextOmitted);
    expect(mergedOmitted[0]).not.toBe(mergedCount[0]);
    expect(mergedOmitted[0].wsFramesOmitted).toBe(true);
  });

  it('replaces when wsClosed lifecycle changes', () => {
    const prev = [makeTrafficEntry({ id: 'a', wsFrameCount: 2, wsClosed: false })];
    const next = [
      makeTrafficEntry({
        id: 'a',
        wsFrameCount: 2,
        wsClosed: true,
        endedAt: 1_700_000_000_500,
        wsEndReason: 'eof',
      }),
    ];
    const merged = mergeCaptures(prev, next);
    expect(merged[0]).not.toBe(prev[0]);
    expect(merged[0].wsClosed).toBe(true);
    expect(merged[0].wsEndReason).toBe('eof');
  });
});
