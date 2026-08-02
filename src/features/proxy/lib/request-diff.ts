export type DiffSide = 'same' | 'left' | 'right' | 'both';

export type HeaderDiffRow = {
  key: string;
  left?: string;
  right?: string;
  side: DiffSide;
};

export function diffHeaders(
  left: Record<string, string>,
  right: Record<string, string>,
): HeaderDiffRow[] {
  const keys = new Set([
    ...Object.keys(left).map((k) => k.toLowerCase()),
    ...Object.keys(right).map((k) => k.toLowerCase()),
  ]);
  const leftBy = new Map(Object.entries(left).map(([k, v]) => [k.toLowerCase(), { k, v }]));
  const rightBy = new Map(Object.entries(right).map(([k, v]) => [k.toLowerCase(), { k, v }]));

  return Array.from(keys)
    .sort()
    .map((lower) => {
      const l = leftBy.get(lower);
      const r = rightBy.get(lower);
      if (l && r) {
        return {
          key: l.k,
          left: l.v,
          right: r.v,
          side: l.v === r.v ? ('same' as const) : ('both' as const),
        };
      }
      if (l) return { key: l.k, left: l.v, side: 'left' as const };
      return { key: r!.k, right: r!.v, side: 'right' as const };
    });
}

export type LineDiffRow = {
  left?: string;
  right?: string;
  side: DiffSide;
};

/** Simple line-oriented diff (not LCS) — aligned by index for short bodies. */
export function diffTextLines(leftText: string, rightText: string): LineDiffRow[] {
  const left = leftText.split('\n');
  const right = rightText.split('\n');
  const max = Math.max(left.length, right.length);
  const rows: LineDiffRow[] = [];
  for (let i = 0; i < max; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l != null && r != null) {
      rows.push({ left: l, right: r, side: l === r ? 'same' : 'both' });
    } else if (l != null) {
      rows.push({ left: l, side: 'left' });
    } else {
      rows.push({ right: r, side: 'right' });
    }
  }
  return rows;
}
