import type { OverrideRule } from '@/entities/traffic/types';

/** Normalized collision key for matchHeaders (order/case-insensitive names). */
export function matchHeadersKey(headers: OverrideRule['matchHeaders'] | undefined): string {
  const map = headers ?? {};
  return Object.keys(map)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((name) => `${name.toLowerCase()}=${map[name] ?? ''}`)
    .join('\n');
}

/** True when two rules target the same request shape (including pathMatch / matchHeaders). */
export function rulesShareMatchKey(a: OverrideRule, b: OverrideRule): boolean {
  return (
    a.kind === b.kind &&
    a.method === b.method &&
    a.scheme === b.scheme &&
    a.host.toLowerCase() === b.host.toLowerCase() &&
    a.path === b.path &&
    a.query === b.query &&
    (a.pathMatch ?? 'exact') === (b.pathMatch ?? 'exact') &&
    matchHeadersKey(a.matchHeaders) === matchHeadersKey(b.matchHeaders)
  );
}
