import { describe, expect, it } from 'vitest';

import { resourceTypeOf } from './resource-type';
import { makeTrafficEntry } from './test-fixtures';

describe('resourceTypeOf', () => {
  it('prefers grpc detection before mime/path heuristics', () => {
    const entry = makeTrafficEntry({
      path: '/pkg.Service/Call',
      responseHeaders: { 'content-type': 'application/grpc+proto' },
    });
    expect(resourceTypeOf(entry)).toBe('grpc');
  });

  it('resolves by response content-type', () => {
    const img = makeTrafficEntry({
      path: '/assets/file.unknown',
      responseHeaders: { 'content-type': 'image/png; charset=utf-8' },
    });
    expect(resourceTypeOf(img)).toBe('img');
  });

  it('falls back to extension when content-type is missing', () => {
    const js = makeTrafficEntry({ path: '/scripts/app.mjs' });
    expect(resourceTypeOf(js)).toBe('js');
  });

  it('classifies Google Fonts /l/font kit paths as font', () => {
    const entry = makeTrafficEntry({
      path: '/l/font?kit=memSYaGs126&v=v44',
      responseHeaders: {},
    });
    expect(resourceTypeOf(entry)).toBe('font');
  });

  it('classifies by Sec-Fetch-Dest when mime and extension are absent', () => {
    const entry = makeTrafficEntry({
      path: '/assets/kit',
      requestHeaders: { 'Sec-Fetch-Dest': 'font' },
      responseHeaders: {},
    });
    expect(resourceTypeOf(entry)).toBe('font');
  });

  it('prefers response content-type over Sec-Fetch-Dest', () => {
    const entry = makeTrafficEntry({
      path: '/assets/kit',
      requestHeaders: { 'sec-fetch-dest': 'font' },
      responseHeaders: { 'content-type': 'image/png' },
    });
    expect(resourceTypeOf(entry)).toBe('img');
  });

  it('returns other when no heuristics match', () => {
    const entry = makeTrafficEntry({ path: '/api/no-extension', responseHeaders: {} });
    expect(resourceTypeOf(entry)).toBe('other');
  });
});
