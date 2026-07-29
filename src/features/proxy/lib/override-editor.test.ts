import { describe, expect, it } from 'vitest';

import type { TrafficEntry } from '@/entities/traffic/types';

import { headersFromRows, rowsFromHeaders, seedOverrideDraft } from './override-editor';

function createEntry(): TrafficEntry {
  return {
    id: 'cap-1',
    startedAt: Date.now(),
    method: 'POST',
    scheme: 'https',
    host: 'api.example.com',
    path: '/v1/users',
    query: 'draft=1',
    status: 201,
    requestHeaders: { 'content-type': 'application/json', 'x-req': '1' },
    responseHeaders: { 'content-type': 'application/json', 'x-res': '1' },
    requestBody: { kind: 'text', text: '{"ok":true}', size: 11 },
    responseBody: { kind: 'text', text: '{"id":1}', size: 8 },
    timing: { dnsMs: 1, connectMs: 2, tlsMs: 3, ttfbMs: 4, downloadMs: 5, totalMs: 15 },
  };
}

describe('override-editor helpers', () => {
  it('builds headers map from rows with trimmed names', () => {
    const rows = [
      { id: '1', name: ' X-Test ', value: 'a' },
      { id: '2', name: ' ', value: 'ignored' },
    ];
    expect(headersFromRows(rows)).toEqual({ 'X-Test': 'a' });
  });

  it('creates editable rows from headers', () => {
    const rows = rowsFromHeaders({ A: '1', B: '2' });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name)).toEqual(['A', 'B']);
  });

  it('seeds draft from existing rule first', () => {
    const existing = {
      id: 'rule-1',
      enabled: true,
      kind: 'response' as const,
      method: 'GET' as const,
      scheme: 'https' as const,
      host: 'example.com',
      path: '/health',
      query: '',
      status: 200,
      contentType: 'application/json',
      headers: { 'x-mock': '1' },
      bodyText: '{"ok":true}',
      createdAt: 1,
    };
    const seeded = seedOverrideDraft(existing, createEntry(), 'request');
    expect(seeded?.draft.id).toBe('rule-1');
    expect(seeded?.draft.kind).toBe('response');
    expect(seeded?.headerRows[0]?.name).toBe('x-mock');
  });

  it('seeds draft from capture when existing rule is absent', () => {
    const seeded = seedOverrideDraft(undefined, createEntry(), 'request');
    expect(seeded).not.toBeNull();
    expect(seeded?.draft.method).toBe('POST');
    expect(seeded?.draft.host).toBe('api.example.com');
    expect(seeded?.draft.kind).toBe('request');
  });
});
