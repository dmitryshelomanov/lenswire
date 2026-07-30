import { describe, expect, it } from 'vitest';

import type { TrafficEntry } from '@/entities/traffic/types';

import { groupByDomain, summarizeHost } from './domain-group';
import { formatRelativeTime } from './format-relative-time';

function entry(partial: Partial<TrafficEntry> & Pick<TrafficEntry, 'host'>): TrafficEntry {
  return {
    id: partial.id ?? '1',
    startedAt: partial.startedAt ?? 1_000,
    method: partial.method ?? 'GET',
    scheme: partial.scheme ?? 'https',
    host: partial.host,
    path: partial.path ?? '/',
    query: partial.query ?? '',
    status: partial.status ?? 200,
    requestHeaders: partial.requestHeaders ?? {},
    responseHeaders: partial.responseHeaders ?? {},
    requestBody: partial.requestBody ?? { kind: 'empty', size: 0 },
    responseBody: partial.responseBody ?? { kind: 'empty', size: 0 },
    timing: partial.timing ?? {
      dnsMs: 0,
      connectMs: 0,
      tlsMs: 0,
      ttfbMs: 0,
      downloadMs: 0,
      totalMs: 0,
    },
    captureMode: partial.captureMode ?? 'mitm',
    clientLabel: partial.clientLabel,
    clientAttributionKind: partial.clientAttributionKind,
  };
}

describe('formatRelativeTime', () => {
  it('formats seconds minutes hours and days', () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 12_000, now)).toBe('12s');
    expect(formatRelativeTime(now - 180_000, now)).toBe('3m');
    expect(formatRelativeTime(now - 7_200_000, now)).toBe('2h');
    expect(formatRelativeTime(now - 172_800_000, now)).toBe('2d');
  });
});

describe('groupByDomain', () => {
  it('aggregates lastSeenAt errorCount and tunnelOnly', () => {
    const groups = groupByDomain([
      entry({
        id: 'a',
        host: 'api.example.com',
        startedAt: 100,
        status: 200,
        captureMode: 'tunnel',
      }),
      entry({
        id: 'b',
        host: 'api.example.com',
        startedAt: 500,
        status: 500,
        captureMode: 'tunnel',
      }),
      entry({
        id: 'c',
        host: 'cdn.example.com',
        startedAt: 200,
        status: 404,
        captureMode: 'mitm',
        clientLabel: 'Chrome',
        clientAttributionKind: 'exact',
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      host: 'api.example.com',
      totalRequests: 2,
      lastSeenAt: 500,
      errorCount: 1,
      tunnelOnly: true,
    });
    expect(groups[1]).toMatchObject({
      host: 'cdn.example.com',
      totalRequests: 1,
      errorCount: 1,
      tunnelOnly: false,
    });
  });

  it('clears tunnelOnly when a decrypted capture appears', () => {
    const groups = groupByDomain([
      entry({ id: 'a', host: 'x.test', captureMode: 'tunnel' }),
      entry({ id: 'b', host: 'x.test', captureMode: 'mitm' }),
    ]);
    expect(groups[0]?.tunnelOnly).toBe(false);
  });
});

describe('summarizeHost', () => {
  it('returns null for missing host', () => {
    expect(summarizeHost([entry({ host: 'a.test' })], 'missing')).toBeNull();
  });
});
