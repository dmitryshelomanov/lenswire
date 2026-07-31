import type { ProxyStatus } from '@/entities/traffic/types';

export type TrafficEmptyKind = 'stopped' | 'empty' | 'filtered';

type ResolveTrafficEmptyKindArgs = {
  visibleCount: number;
  hasTraffic: boolean;
  status: ProxyStatus;
  hasActiveFilters: boolean;
};

/** Shared empty-state classification for home and domain traffic lists. */
export function resolveTrafficEmptyKind({
  visibleCount,
  hasTraffic,
  status,
  hasActiveFilters,
}: ResolveTrafficEmptyKindArgs): TrafficEmptyKind | null {
  if (visibleCount > 0) return null;
  if ((status === 'stopped' || status === 'error') && !hasTraffic) return 'stopped';
  if (hasActiveFilters) return 'filtered';
  return 'empty';
}
