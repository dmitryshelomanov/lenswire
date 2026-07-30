import type { TrafficEntry } from '@/entities/traffic/types';

export type SessionBounds = {
  t0: number;
  span: number;
};

export function sessionBounds(entries: TrafficEntry[]): SessionBounds {
  if (entries.length === 0) return { t0: 0, span: 1 };
  let t0 = entries[0].startedAt;
  let end = entries[0].startedAt + Math.max(entries[0].timing.totalMs, 0);
  for (const entry of entries) {
    t0 = Math.min(t0, entry.startedAt);
    end = Math.max(end, entry.startedAt + Math.max(entry.timing.totalMs, 0));
  }
  return { t0, span: Math.max(end - t0, 1) };
}

export function timeTicks(span: number): number[] {
  if (span <= 1) return [0, span];
  const target = 4;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let t = 0; t < span; t += step) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== span) {
    ticks.push(span);
  }
  return ticks;
}

export function hasTimingScale(scale: number): boolean {
  return scale > 0;
}
