import { clientAttributionKindOfEntry, clientNameOfEntry } from '@/entities/traffic/client-name';
import type { ClientAttributionKind, TrafficEntry } from '@/entities/traffic/types';

export type DomainGroup = {
  host: string;
  totalRequests: number;
  clientName: string;
  clientAttributionKind: ClientAttributionKind;
  lastSeenAt: number;
  errorCount: number;
  tunnelOnly: boolean;
};

type Acc = {
  group: DomainGroup;
  counts: Map<string, number>;
  bestCount: number;
};

export function groupByDomain(entries: TrafficEntry[]): DomainGroup[] {
  const ordered: DomainGroup[] = [];
  const byHost = new Map<string, Acc>();

  for (const entry of entries) {
    const name = clientNameOfEntry(entry);
    const kind = clientAttributionKindOfEntry(entry);
    const counterKey = `${kind}:${name}`;
    const isError = entry.status >= 400;
    const isTunnel = entry.captureMode === 'tunnel';
    const existing = byHost.get(entry.host);

    if (existing) {
      existing.group.totalRequests += 1;
      if (entry.startedAt > existing.group.lastSeenAt) {
        existing.group.lastSeenAt = entry.startedAt;
      }
      if (isError) existing.group.errorCount += 1;
      if (!isTunnel) existing.group.tunnelOnly = false;
      const prev = existing.counts.get(counterKey) ?? 0;
      const nextCount = prev + 1;
      existing.counts.set(counterKey, nextCount);
      if (nextCount > existing.bestCount) {
        existing.bestCount = nextCount;
        existing.group.clientName = name;
        existing.group.clientAttributionKind = kind;
      }
      continue;
    }

    const next: DomainGroup = {
      host: entry.host,
      totalRequests: 1,
      clientName: name,
      clientAttributionKind: kind,
      lastSeenAt: entry.startedAt,
      errorCount: isError ? 1 : 0,
      tunnelOnly: isTunnel,
    };
    const counts = new Map<string, number>();
    counts.set(counterKey, 1);
    byHost.set(entry.host, { group: next, counts, bestCount: 1 });
    ordered.push(next);
  }

  return ordered;
}

export function summarizeHost(entries: TrafficEntry[], host: string): DomainGroup | null {
  const groups = groupByDomain(entries.filter((e) => e.host === host));
  return groups[0] ?? null;
}
