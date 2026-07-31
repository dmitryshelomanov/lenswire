import type { TrafficEntry } from '@/entities/traffic/types';

/** Reuse previous object identity when summary fields are unchanged (helps FlatList/memo). */
export function mergeCaptures(prev: TrafficEntry[], next: TrafficEntry[]): TrafficEntry[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((entry) => [entry.id, entry]));
  let changed = prev.length !== next.length;
  const merged = next.map((entry) => {
    const old = prevById.get(entry.id);
    if (old && sameSummary(old, entry)) {
      return old;
    }
    changed = true;
    return entry;
  });
  return changed ? merged : prev;
}

function sameSummary(a: TrafficEntry, b: TrafficEntry): boolean {
  return (
    a.id === b.id &&
    a.startedAt === b.startedAt &&
    a.method === b.method &&
    a.host === b.host &&
    a.path === b.path &&
    a.query === b.query &&
    a.status === b.status &&
    a.scheme === b.scheme &&
    a.captureMode === b.captureMode &&
    a.overrideApplied === b.overrideApplied &&
    a.reasonCode === b.reasonCode &&
    a.bypassCause === b.bypassCause &&
    a.timing?.totalMs === b.timing?.totalMs &&
    a.requestBody?.size === b.requestBody?.size &&
    a.responseBody?.size === b.responseBody?.size &&
    a.httpPayloadAvailable === b.httpPayloadAvailable
  );
}
