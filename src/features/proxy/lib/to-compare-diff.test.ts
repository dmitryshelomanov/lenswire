import { describe, expect, it } from 'vitest';

import { makeTrafficEntry } from '@/entities/traffic/test-fixtures';

import { toCompareDiff } from './to-compare-diff';

describe('toCompareDiff', () => {
  it('emits unified header markers and changed header lines', () => {
    const left = makeTrafficEntry({
      id: 'a1',
      method: 'GET',
      path: '/v1/items',
      status: 200,
      requestHeaders: { Accept: 'application/json', 'X-Trace': 'one' },
      responseBody: { kind: 'json', text: '{\n  "ok": true\n}', size: 18 },
    });
    const right = makeTrafficEntry({
      id: 'b2',
      method: 'GET',
      path: '/v1/items',
      status: 201,
      requestHeaders: { Accept: 'application/json', 'X-Trace': 'two' },
      responseBody: { kind: 'json', text: '{\n  "ok": false\n}', size: 19 },
    });

    const diff = toCompareDiff(left, right);

    expect(diff).toContain('--- A GET https://api.example.com/v1/items (a1)');
    expect(diff).toContain('+++ B GET https://api.example.com/v1/items (b2)');
    expect(diff).toContain('@@ overview @@');
    expect(diff).toContain('-status: 200');
    expect(diff).toContain('+status: 201');
    expect(diff).toContain('@@ request headers @@');
    expect(diff).toContain('-X-Trace: one');
    expect(diff).toContain('+X-Trace: two');
    expect(diff).not.toContain('-Accept:');
    expect(diff).toContain('@@ response body @@');
    expect(diff).toContain('-  "ok": true');
    expect(diff).toContain('+  "ok": false');
  });

  it('summarizes non-text bodies without dumping binary', () => {
    const left = makeTrafficEntry({
      id: 'bin-a',
      responseBody: { kind: 'image', size: 1024, previewBase64: 'aaaa' },
    });
    const right = makeTrafficEntry({
      id: 'bin-b',
      responseBody: { kind: 'binary', size: 2048 },
    });

    const diff = toCompareDiff(left, right);
    expect(diff).toContain('@@ response body @@');
    expect(diff).toContain('-A: image');
    expect(diff).toContain('+B: binary');
    expect(diff).not.toContain('aaaa');
  });
});
