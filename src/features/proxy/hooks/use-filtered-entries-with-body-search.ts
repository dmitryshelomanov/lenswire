import * as React from 'react';

import { entryMatchesQuery, filterEntries } from '@/entities/traffic/filter';
import type { TrafficEntry, TrafficFilters } from '@/entities/traffic/types';
import { getCapture } from '@/shared/api/native-proxy';

const BODY_SEARCH_DEBOUNCE_MS = 250;

/**
 * Applies list filters, then optionally scans full capture files for body text matches.
 * Headers are already searched via filterEntries (present on summaries).
 *
 * Callers should pass a pre-scoped list (e.g. one host) so scans stay bounded.
 */
export function useFilteredEntriesWithBodySearch(
  entries: TrafficEntry[],
  filters: TrafficFilters,
): { filtered: TrafficEntry[]; searchingBodies: boolean } {
  const baseFiltered = React.useMemo(() => filterEntries(entries, filters), [entries, filters]);
  const [bodyMatchIds, setBodyMatchIds] = React.useState<Set<string> | null>(null);
  const [searchingBodies, setSearchingBodies] = React.useState(false);
  const query = filters.query.trim();
  const searchBodies = Boolean(filters.searchBodies) && query.length > 0;

  const [debouncedQuery, setDebouncedQuery] = React.useState(query);
  React.useEffect(() => {
    if (!searchBodies) {
      const timer = setTimeout(() => setDebouncedQuery(query), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setDebouncedQuery(query), BODY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searchBodies]);

  const entryIdsKey = React.useMemo(() => entries.map((entry) => entry.id).join(','), [entries]);
  const metaFiltersKey = React.useMemo(
    () =>
      JSON.stringify({
        method: filters.method,
        resourceType: filters.resourceType ?? 'ALL',
        statusClass: filters.statusClass,
        scheme: filters.scheme,
        captureMode: filters.captureMode,
        overriddenOnly: filters.overriddenOnly,
      }),
    [filters],
  );

  const scanStateRef = React.useRef<{
    key: string;
    matched: Set<string>;
    scanned: Set<string>;
  }>({ key: '', matched: new Set(), scanned: new Set() });
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    const generation = ++generationRef.current;

    const applySyncState = (matched: Set<string> | null, searching: boolean) => {
      queueMicrotask(() => {
        if (cancelled || generation !== generationRef.current) return;
        setBodyMatchIds(matched);
        setSearchingBodies(searching);
      });
    };

    if (!searchBodies) {
      scanStateRef.current = { key: '', matched: new Set(), scanned: new Set() };
      applySyncState(null, false);
      return () => {
        cancelled = true;
      };
    }

    // Clear stale body hits while the query is still being typed.
    if (debouncedQuery !== query) {
      applySyncState(null, true);
      return () => {
        cancelled = true;
      };
    }

    const searchKey = `${debouncedQuery}\0${metaFiltersKey}`;
    if (scanStateRef.current.key !== searchKey) {
      scanStateRef.current = { key: searchKey, matched: new Set(), scanned: new Set() };
    }

    const summaryMatched = new Set(
      filterEntries(entries, { ...filters, query: debouncedQuery, searchBodies: false }).map(
        (entry) => entry.id,
      ),
    );
    for (const id of summaryMatched) {
      scanStateRef.current.matched.add(id);
      scanStateRef.current.scanned.add(id);
    }

    const toScan = entries.filter((entry) => {
      if (scanStateRef.current.scanned.has(entry.id)) return false;
      const metaOk =
        filterEntries([entry], { ...filters, query: '', searchBodies: false }).length > 0;
      return metaOk;
    });

    if (toScan.length === 0) {
      applySyncState(new Set(scanStateRef.current.matched), false);
      return () => {
        cancelled = true;
      };
    }

    applySyncState(null, true);

    void (async () => {
      for (const entry of toScan) {
        if (cancelled) return;
        scanStateRef.current.scanned.add(entry.id);
        try {
          const full = await getCapture(entry.id);
          if (!full) continue;
          const kindOk =
            (full.requestBody?.kind === 'text' ||
              full.requestBody?.kind === 'json' ||
              full.responseBody?.kind === 'text' ||
              full.responseBody?.kind === 'json') &&
            entryMatchesQuery(full, debouncedQuery, { includeBodies: true });
          if (kindOk) scanStateRef.current.matched.add(entry.id);
        } catch {
          // Ignore single-entry load failures.
        }
      }
      if (!cancelled && generation === generationRef.current) {
        setBodyMatchIds(new Set(scanStateRef.current.matched));
        setSearchingBodies(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // entryIdsKey / metaFiltersKey intentionally drive rescan; entries/filters used inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stable id/filter fingerprints
  }, [searchBodies, query, debouncedQuery, entryIdsKey, metaFiltersKey]);

  const filtered = React.useMemo(() => {
    if (!searchBodies) return baseFiltered;
    // While debouncing or before first result for this query: summary matches only (no stale body hits).
    if (bodyMatchIds == null) return baseFiltered;
    return entries.filter((entry) => bodyMatchIds.has(entry.id));
  }, [searchBodies, bodyMatchIds, baseFiltered, entries]);

  return { filtered, searchingBodies };
}
