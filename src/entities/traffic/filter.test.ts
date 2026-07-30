import { describe, expect, it } from 'vitest';

import { filterEntries } from './filter';
import { makeTrafficEntry } from './test-fixtures';
import type { TrafficFilters } from './types';

const BASE_FILTERS: TrafficFilters = {
  query: '',
  method: 'ALL',
  resourceType: 'ALL',
  statusClass: 'ALL',
  scheme: 'ALL',
  captureMode: 'ALL',
  overriddenOnly: false,
};

describe('filterEntries', () => {
  it('filters by method and status class', () => {
    const entries = [
      makeTrafficEntry({ id: 'ok-get', method: 'GET', status: 200 }),
      makeTrafficEntry({ id: 'err-post', method: 'POST', status: 500 }),
    ];

    const byMethod = filterEntries(entries, { ...BASE_FILTERS, method: 'POST' });
    expect(byMethod.map((entry) => entry.id)).toEqual(['err-post']);

    const byStatus = filterEntries(entries, { ...BASE_FILTERS, statusClass: '5xx' });
    expect(byStatus.map((entry) => entry.id)).toEqual(['err-post']);
  });

  it('matches query against tunnel and capture fields', () => {
    const entries = [
      makeTrafficEntry({
        id: 'tls',
        connectTarget: 'mail.example.com:443',
        captureSummary: 'intercepted via mitm',
        captureMode: 'mitm',
      }),
      makeTrafficEntry({ id: 'plain', host: 'static.example.com', captureMode: 'http' }),
    ];

    const byConnectTarget = filterEntries(entries, { ...BASE_FILTERS, query: 'mail.example.com' });
    expect(byConnectTarget.map((entry) => entry.id)).toEqual(['tls']);

    const bySummary = filterEntries(entries, { ...BASE_FILTERS, query: 'mitm' });
    expect(bySummary.map((entry) => entry.id)).toEqual(['tls']);
  });

  it('supports overriddenOnly filter', () => {
    const entries = [
      makeTrafficEntry({ id: 'plain' }),
      makeTrafficEntry({ id: 'mutated', overrideApplied: 'response' }),
    ];

    const filtered = filterEntries(entries, { ...BASE_FILTERS, overriddenOnly: true });
    expect(filtered.map((entry) => entry.id)).toEqual(['mutated']);
  });
});
