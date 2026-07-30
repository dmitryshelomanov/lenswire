import { describe, expect, it } from 'vitest';

import { asOverrideRule, mapNativeCapture } from './native-mappers';

describe('mapNativeCapture', () => {
  it('normalizes nullable and primitive values from native payload', () => {
    const entry = mapNativeCapture({
      id: 42,
      method: 'post',
      scheme: 'https',
      host: 'api.example.com',
      path: '/v1/items',
      status: '201',
      requestHeaders: { a: 1 },
      responseHeaders: { 'content-type': 'application/json' },
      requestBody: { kind: 'json', text: '{"ok":true}', size: '11' },
      responseBody: { kind: 'text', text: 'created', size: 7, truncated: true },
      timing: { totalMs: '8' },
      httpPayloadAvailable: 'true',
      clientUid: '1001',
      sniHostname: '',
      tlsSniPresent: 'false',
      tlsAlpnProtocols: ['h2', 7],
    });

    expect(entry.id).toBe('42');
    expect(entry.method).toBe('POST');
    expect(entry.status).toBe(201);
    expect(entry.requestHeaders).toEqual({ a: '1' });
    expect(entry.requestBody.kind).toBe('json');
    expect(entry.httpPayloadAvailable).toBe(true);
    expect(entry.clientUid).toBe(1001);
    expect(entry.sniHostname).toBeNull();
    expect(entry.tlsSniPresent).toBe(false);
    expect(entry.tlsAlpnProtocols).toEqual(['h2', '7']);
  });
});

describe('asOverrideRule', () => {
  it('returns null for invalid rule kind', () => {
    expect(asOverrideRule({ kind: 'unknown' })).toBeNull();
  });

  it('maps and sanitizes native override rule', () => {
    const rule = asOverrideRule({
      id: 10,
      kind: 'response',
      method: 'patch',
      scheme: 'http',
      host: 'example.com',
      path: '',
      query: null,
      status: '204',
      contentType: 'application/json',
      headers: {
        'x-a': '1',
        '   ': 'ignored',
      },
      bodyText: 1,
      createdAt: '7',
      enabled: true,
    });

    expect(rule).not.toBeNull();
    expect(rule?.id).toBe('10');
    expect(rule?.method).toBe('PATCH');
    expect(rule?.path).toBe('/');
    expect(rule?.query).toBe('');
    expect(rule?.headers).toEqual({ 'x-a': '1' });
    expect(rule?.bodyText).toBe('1');
    expect(rule?.createdAt).toBe(7);
  });
});
