import type { TrafficTiming } from '@/entities/traffic/types';

export type TimingPhaseDef = {
  key: string;
  label: string;
  color: string;
  ms: number;
};

/** Calm DevTools-like palette (readable on light and dark). */
export const TIMING_PHASE_META = [
  { key: 'dns', label: 'DNS', color: '#1A7F37', field: 'dnsMs' },
  { key: 'connect', label: 'Connect', color: '#D97706', field: 'connectMs' },
  { key: 'tls', label: 'TLS', color: '#C45C26', field: 'tlsMs' },
  { key: 'ttfb', label: 'TTFB', color: '#5B8DEF', field: 'ttfbMs' },
  { key: 'download', label: 'Download', color: '#1A56DB', field: 'downloadMs' },
] as const;

export const TOTAL_BAR_COLOR = '#8B8B8B';

export function phaseDefs(timing: TrafficTiming): TimingPhaseDef[] {
  return TIMING_PHASE_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    color: meta.color,
    ms: timing[meta.field],
  }));
}

export function phaseSumMs(phases: TimingPhaseDef[]): number {
  return phases.reduce((sum, p) => sum + Math.max(0, p.ms), 0);
}

export function scaleMs(timing: TrafficTiming, phases: TimingPhaseDef[]): number {
  return Math.max(timing.totalMs, phaseSumMs(phases), 0);
}

export function layoutPhaseSegments(
  phases: TimingPhaseDef[],
  scale: number,
  width: number,
  minSegPx = 2,
): { key: string; color: string; x: number; w: number }[] {
  if (width <= 0 || scale <= 0) return [];

  let x = 0;
  const raw = phases.map((p) => {
    const ideal = (Math.max(0, p.ms) / scale) * width;
    const w = p.ms > 0 ? Math.max(ideal, minSegPx) : 0;
    return { key: p.key, color: p.color, w };
  });

  const totalW = raw.reduce((s, r) => s + r.w, 0);
  if (totalW > width && totalW > 0) {
    const factor = width / totalW;
    for (const r of raw) r.w *= factor;
  }

  return raw.map((r) => {
    const seg = { key: r.key, color: r.color, x, w: r.w };
    x += r.w;
    return seg;
  });
}

/** Status-tinted solid bar when phase timing is unavailable. */
export function statusBarColor(status: number): string {
  if (status >= 500) return '#DC2626';
  if (status >= 400) return '#EA580C';
  if (status >= 300) return '#CA8A04';
  if (status >= 200) return '#2563EB';
  return TOTAL_BAR_COLOR;
}
