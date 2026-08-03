import { describe, expect, it } from 'vitest';

import { hasProtobufContentType, httpVersionLabel, isInspectable, reasonLabel } from './badges';
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

describe('isInspectable', () => {
  it('is true only when httpPayloadAvailable is true', () => {
    expect(isInspectable(makeTrafficEntry({ httpPayloadAvailable: true }))).toBe(true);
    expect(isInspectable(makeTrafficEntry({ httpPayloadAvailable: false }))).toBe(false);
    expect(isInspectable(makeTrafficEntry({ httpPayloadAvailable: null }))).toBe(false);
    expect(isInspectable(makeTrafficEntry({}))).toBe(false);
  });

  it('marks alpn_no_http11 and websocket_relay as non-inspectable', () => {
    expect(
      isInspectable(
        makeTrafficEntry({
          reasonCode: 'alpn_no_http11',
          captureMode: 'tunnel',
          httpPayloadAvailable: false,
          tlsAlpnProtocols: ['h2'],
        }),
      ),
    ).toBe(false);
    expect(
      isInspectable(
        makeTrafficEntry({
          reasonCode: 'websocket_relay',
          captureMode: 'mitm',
          httpPayloadAvailable: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('httpVersionLabel', () => {
  it('returns HTTP/1.1 when payload is available', () => {
    const entry = makeTrafficEntry({ httpPayloadAvailable: true });
    expect(httpVersionLabel(entry)).toBe('HTTP/1.1');
  });

  it('MITM with ClientHello h2+http/1.1 shows only HTTP/1.1 (no h2 chip)', () => {
    const entry = makeTrafficEntry({
      captureMode: 'mitm',
      httpPayloadAvailable: true,
      reasonCode: 'decrypted',
      tlsAlpnProtocols: ['h2', 'http/1.1'],
      tlsNegotiatedAlpn: 'http/1.1',
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/1.1');
    expect(reasonLabel(entry.reasonCode, entry.tlsAlpnProtocols)).toBeNull();
  });

  it('does not show version for tunnel sniff guess=http2 (reason badge only)', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      httpPayloadAvailable: false,
      reasonCode: 'mitm_unsupported',
      captureSummary: 'guess=http2; method=PRI; firstLine=PRI * HTTP/2.0',
    });
    expect(httpVersionLabel(entry)).toBeNull();
    expect(reasonLabel('mitm_unsupported', null, entry.captureSummary)).toBe('http2');
  });

  it('returns null when ALPN is h2 but no decrypt and not alpn_no_http11', () => {
    const entry = makeTrafficEntry({
      httpPayloadAvailable: false,
      captureMode: 'tunnel',
      tlsAlpnProtocols: ['h2', 'http/1.1'],
      captureSummary: 'passthrough',
    });
    expect(httpVersionLabel(entry)).toBeNull();
  });

  it('returns HTTP/2 for tunnel alpn_no_http11 with h2', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      httpPayloadAvailable: false,
      reasonCode: 'alpn_no_http11',
      tlsAlpnProtocols: ['h2'],
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/2');
  });

  it('returns HTTP/3 for tunnel alpn_no_http11 with h3', () => {
    const entry = makeTrafficEntry({
      captureMode: 'tunnel',
      httpPayloadAvailable: false,
      reasonCode: 'alpn_no_http11',
      tlsAlpnProtocols: ['h3'],
    });
    expect(httpVersionLabel(entry)).toBe('HTTP/3');
  });

  it('returns null when httpPayloadAvailable is null/undefined', () => {
    expect(httpVersionLabel(makeTrafficEntry({}))).toBeNull();
    expect(httpVersionLabel(makeTrafficEntry({ httpPayloadAvailable: null }))).toBeNull();
  });
});

describe('reasonLabel', () => {
  it('labels new bypass reason codes', () => {
    expect(reasonLabel('mitm_unsupported')).toBe('unsupported');
    expect(reasonLabel('mitm_unsupported', null, 'guess=http2; method=PRI')).toBe('http2');
    expect(reasonLabel('mitm_unsupported', null, 'guess=non_http; hex=00')).toBe('binary');
    expect(reasonLabel('mitm_no_request')).toBe('no request');
    expect(reasonLabel('mitm_no_request', null, 'guess=empty; bytes=0; cause=eof')).toBe(
      'client closed',
    );
    expect(reasonLabel('mitm_bypassed')).toBe('bypassed');
    expect(reasonLabel('mitm_bypassed', null, null, 'mitm_handshake_failed')).toBe(
      'bypassed:trust',
    );
    expect(reasonLabel('mitm_bypassed', null, null, 'mitm_unsupported')).toBe('bypassed:proto');
    expect(reasonLabel('mitm_bypassed', null, null, 'mitm_no_request')).toBe('bypassed:no req');
    expect(reasonLabel('alpn_no_http11')).toBe('no h1.1');
    expect(reasonLabel('alpn_no_http11', ['h2'])).toBe('h2-only');
    expect(reasonLabel('alpn_no_http11', ['h3'])).toBe('h3-only');
    expect(reasonLabel('mitm_websocket')).toBe('websocket');
    expect(reasonLabel('websocket_relay')).toBe('ws relay');
    expect(reasonLabel('websocket_frames')).toBe('ws');
    expect(reasonLabel('http_upstream_failed')).toBe('http fail');
    expect(reasonLabel('http_upstream_timeout')).toBe('http timeout');
    expect(reasonLabel('http_dns_failed')).toBe('dns fail');
    expect(reasonLabel('upstream_connect_failed')).toBe('upstream fail');
    expect(reasonLabel('http_cleartext_blocked')).toBe('cleartext');
    expect(reasonLabel('mitm_no_request', null, 'guess=empty; bytes=0; cause=timeout')).toBe(
      'no request',
    );
    expect(reasonLabel('mitm_error')).toBe('mitm error');
    expect(reasonLabel('mitm_error')).not.toBe(
      reasonLabel('mitm_no_request', null, 'guess=empty; bytes=0; cause=eof'),
    );
  });

  it('omits redundant decrypted and passthrough badges', () => {
    expect(reasonLabel('decrypted')).toBeNull();
    expect(reasonLabel('passthrough')).toBeNull();
  });
});
