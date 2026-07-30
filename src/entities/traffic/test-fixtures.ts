import type { TrafficEntry } from './types';

export function makeTrafficEntry(overrides: Partial<TrafficEntry> = {}): TrafficEntry {
  return {
    id: 'entry-1',
    startedAt: 1_700_000_000_000,
    method: 'GET',
    scheme: 'https',
    host: 'api.example.com',
    path: '/v1/items',
    query: '',
    status: 200,
    requestHeaders: {},
    responseHeaders: {},
    requestBody: { kind: 'empty', size: 0 },
    responseBody: { kind: 'empty', size: 0 },
    timing: {
      dnsMs: 0,
      connectMs: 0,
      tlsMs: 0,
      ttfbMs: 0,
      downloadMs: 0,
      totalMs: 0,
    },
    ...overrides,
  };
}
