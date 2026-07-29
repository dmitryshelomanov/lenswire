import { describe, expect, it } from 'vitest';

import type { TrafficEntry, TrafficBody } from './types';

import { clientNameFromUserAgent, clientNameOfEntry } from './client-name';

function textBody(text: string): TrafficBody {
  return { kind: 'text', text, size: text.length };
}

function baseEntry(overrides: Partial<TrafficEntry> = {}): TrafficEntry {
  return {
    id: 'cap-1',
    startedAt: Date.now(),
    method: 'GET',
    scheme: 'https',
    host: 'example.com',
    path: '/',
    query: '',
    status: 200,
    requestHeaders: {},
    responseHeaders: {},
    requestBody: textBody(''),
    responseBody: textBody('ok'),
    timing: { dnsMs: 1, connectMs: 2, tlsMs: 3, ttfbMs: 4, downloadMs: 5, totalMs: 15 },
    ...overrides,
  };
}

describe('client-name heuristics', () => {
  it('detects Edge from UA', () => {
    expect(clientNameFromUserAgent('Mozilla/5.0 ... Edg/123.0.0.0 Safari/537.36')).toBe('Edge');
  });

  it('detects Opera from UA', () => {
    expect(clientNameFromUserAgent('Mozilla/5.0 ... OPR/87.0.4280.88 ...')).toBe('Opera');
  });

  it('detects Firefox from UA', () => {
    expect(clientNameFromUserAgent('Mozilla/5.0 ... Firefox/125.0')).toBe('Firefox');
  });

  it('detects Chrome from UA', () => {
    expect(
      clientNameFromUserAgent('Mozilla/5.0 ... Chrome/126.0.0.0 Safari/537.36'),
    ).toBe('Chrome');
  });

  it('detects Safari from UA', () => {
    expect(
      clientNameFromUserAgent('Mozilla/5.0 ... Version/17.0 Mobile/15E148 Safari/604.1'),
    ).toBe('Safari');
  });

  it('detects OkHttp from UA', () => {
    expect(clientNameFromUserAgent('okhttp/4.12.0')).toBe('OkHttp');
  });

  it('detects Dalvik from UA', () => {
    expect(clientNameFromUserAgent('Dalvik/2.1.0 (Linux; Android 10; Pixel 3)')).toBe('Dalvik');
  });

  it('falls back to App for unknown UA', () => {
    expect(clientNameFromUserAgent('SomeRandomClient/1.2.3')).toBe('App');
  });
});

describe('clientNameOfEntry()', () => {
  it('returns Browser when UA missing but sec-fetch-* headers present', () => {
    const entry = baseEntry({
      requestHeaders: { 'sec-fetch-dest': 'document' },
    });
    expect(clientNameOfEntry(entry)).toBe('Browser');
  });

  it('returns Unknown when UA missing and sec-fetch-* headers absent', () => {
    const entry = baseEntry({
      requestHeaders: {},
    });
    expect(clientNameOfEntry(entry)).toBe('Unknown');
  });
});

