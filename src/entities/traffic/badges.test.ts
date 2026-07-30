import { describe, expect, it } from 'vitest';

import { hasProtobufContentType, httpVersionLabel } from './badges';
import { makeTrafficEntry } from './test-fixtures';

describe('hasProtobufContentType', () => {
  it('detects application/json+protobuf on request', () => {
    const entry = makeTrafficEntry({
      requestHeaders: { 'Content-Type': 'application/json+protobuf; charset=UTF-8' },
    });
    expect(hasProtobufContentType(entry)).toBe(true);
  });

  it('detects +protobuf on response', () => {
    const entry = makeTrafficEntry({
      responseHeaders: { 'content-type': 'application/x-protobuf+protobuf' },
    });
    expect(hasProtobufContentType(entry)).toBe(true);
  });

  it('does not match plain application/json', () => {
    const entry = makeTrafficEntry({
      requestHeaders: { 'Content-Type': 'application/json' },
      responseHeaders: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    expect(hasProtobufContentType(entry)).toBe(false);
  });

  it('does not match application/grpc+proto (no +protobuf)', () => {
    const entry = makeTrafficEntry({
      requestHeaders: { 'Content-Type': 'application/grpc+proto' },
    });
    expect(hasProtobufContentType(entry)).toBe(false);
  });
});

describe('httpVersionLabel', () => {
  it('returns HTTP/1.1 when payload is available', () => {
    const entry = makeTrafficEntry({ httpPayloadAvailable: true });
    expect(httpVersionLabel(entry)).toBe('HTTP/1.1');
  });

  it('returns HTTP/2 for tunnel with guess=http2 sniff', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      httpPayloadAvailable: false,
      captureSummary: 'guess=http2; method=PRI; firstLine=PRI * HTTP/2.0',
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/2');
  });

  it('is case-insensitive for guess=http2', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      captureSummary: 'Guess=HTTP2; method=PRI',
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/2');
  });

  it('returns HTTP/2 for tunnel with method=PRI sniff', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      httpPayloadAvailable: false,
      captureSummary: 'MITM error\nmethod=PRI; firstLine=PRI * HTTP/2.0',
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/2');
  });

  it('does not match guess=http2 as a substring of another token', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      captureSummary: 'fooguess=http2; other=1',
    });
    expect(httpVersionLabel(entry)).toBeNull();
  });

  it('returns null when ALPN is h2 but no decrypt and no sniff', () => {
    const entry = makeTrafficEntry({
      httpPayloadAvailable: false,
      captureMode: 'tunnel',
      tlsAlpnProtocols: ['h2', 'http/1.1'],
      captureSummary: 'passthrough',
    });
    expect(httpVersionLabel(entry)).toBeNull();
  });

  it('returns null when httpPayloadAvailable is null/undefined', () => {
    expect(httpVersionLabel(makeTrafficEntry({}))).toBeNull();
    expect(httpVersionLabel(makeTrafficEntry({ httpPayloadAvailable: null }))).toBeNull();
  });

  it('prefers HTTP/1.1 over sniff when payload is available', () => {
    const entry = makeTrafficEntry({
      httpPayloadAvailable: true,
      captureMode: 'tunnel',
      captureSummary: 'guess=http2',
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/1.1');
  });
});
