import { describe, expect, it } from 'vitest';

import { layoutPhaseSegments, type TimingPhaseDef } from './timing-phases';

function phase(key: string, ms: number): TimingPhaseDef {
  return { key, label: key, color: '#000', ms };
}

describe('layoutPhaseSegments', () => {
  it('returns empty when width or scale is non-positive', () => {
    expect(layoutPhaseSegments([phase('dns', 10)], 100, 0)).toEqual([]);
    expect(layoutPhaseSegments([phase('dns', 10)], 0, 100)).toEqual([]);
  });

  it('scales segments into width when minSegPx would overflow', () => {
    const phases = [phase('a', 1), phase('b', 1), phase('c', 1)];
    const segs = layoutPhaseSegments(phases, 3, 10, 5);
    const totalW = segs.reduce((s, seg) => s + seg.w, 0);
    expect(totalW).toBeCloseTo(10, 5);
    expect(segs.every((seg) => seg.w > 0)).toBe(true);
  });

  it('lays out segments left-to-right without gaps', () => {
    const phases = [phase('dns', 50), phase('ttfb', 50)];
    const segs = layoutPhaseSegments(phases, 100, 200, 2);
    expect(segs).toHaveLength(2);
    expect(segs[0].x).toBe(0);
    expect(segs[1].x).toBeCloseTo(segs[0].w, 5);
    expect(segs[0].w + segs[1].w).toBeCloseTo(200, 5);
  });

  it('skips zero-ms phases with zero width', () => {
    const phases = [phase('dns', 0), phase('ttfb', 100)];
    const segs = layoutPhaseSegments(phases, 100, 100, 2);
    expect(segs[0].w).toBe(0);
    expect(segs[1].w).toBeCloseTo(100, 5);
  });
});
