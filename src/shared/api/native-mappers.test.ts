import { describe, expect, it } from 'vitest';

import { entryDisplayScheme, entryUrl } from '@/entities/traffic/types';

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
      tlsNegotiatedAlpn: 'http/1.1',
      upstreamHttpVersion: 'HTTP/1.1',
      bypassCause: 'mitm_handshake_failed',
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
    expect(entry.tlsNegotiatedAlpn).toBe('http/1.1');
    expect(entry.upstreamHttpVersion).toBe('HTTP/1.1');
    expect(entry.bypassCause).toBe('mitm_handshake_failed');
  });

  it('maps websocket frames and counts from native payload', () => {
    const entry = mapNativeCapture({
      id: 'ws-1',
      scheme: 'https',
      host: 'rtc.example.com',
      path: '/socket.io/',
      query: 'EIO=4&transport=websocket',
      status: 101,
      reasonCode: 'websocket_frames',
      wsFrameCount: 2,
      wsFramesOmitted: false,
      wsClosed: true,
      endedAt: 1_700_000_000_500,
      wsEndReason: 'close_frame',
      wsCloseCode: 1000,
      wsFrames: [
        {
          id: 'f1',
          at: 1,
          dir: 'client',
          opcode: 'text',
          size: 5,
          payload: { kind: 'text', text: 'hello', size: 5 },
        },
        {
          id: 'f2',
          at: 2,
          dir: 'server',
          opcode: 'binary',
          size: 3,
          payload: { kind: 'binary', size: 3, previewBase64: 'YWJj' },
        },
      ],
      requestBody: { kind: 'empty', size: 0 },
      responseBody: { kind: 'empty', size: 0 },
      timing: { totalMs: 1 },
    });

    expect(entry.wsFrameCount).toBe(2);
    expect(entry.wsFramesOmitted).toBe(false);
    expect(entry.wsClosed).toBe(true);
    expect(entry.endedAt).toBe(1_700_000_000_500);
    expect(entry.wsEndReason).toBe('close_frame');
    expect(entry.wsCloseCode).toBe(1000);
    expect(entry.wsFrames).toHaveLength(2);
    expect(entry.wsFrames?.[0]).toMatchObject({
      id: 'f1',
      dir: 'client',
      opcode: 'text',
      payload: { kind: 'text', text: 'hello', size: 5 },
    });
    expect(entry.wsFrames?.[1]?.payload.kind).toBe('binary');
    expect(entryDisplayScheme(entry)).toBe('wss');
    expect(entryUrl(entry)).toBe('wss://rtc.example.com/socket.io/?EIO=4&transport=websocket');
  });

  it('accepts body stubs without text or preview payloads', () => {
    const entry = mapNativeCapture({
      id: 'stub',
      requestBody: { kind: 'json', size: 11, truncated: true },
      responseBody: { kind: 'image', size: 2048, encodingDecoded: true },
    });

    expect(entry.requestBody).toEqual({
      kind: 'json',
      text: '',
      size: 11,
      truncated: true,
    });
    expect(entry.responseBody).toEqual({
      kind: 'image',
      size: 2048,
      encodingDecoded: true,
    });
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
    expect(rule?.pathMatch).toBe('exact');
    expect(rule?.matchHeaders).toEqual({});
    expect(rule?.delayMs).toBe(0);
    expect(rule?.bodyMode).toBe('body');
  });
});
