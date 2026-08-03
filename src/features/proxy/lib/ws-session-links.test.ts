import { describe, expect, it } from 'vitest';

import { makeTrafficEntry } from '@/entities/traffic/test-fixtures';

import {
  findNewerWsReconnect,
  findPreviousWsSession,
  findWsCaptureBlocker,
  isWsTrafficEntry,
  wsCaptureBlockerMessage,
  wsFramesMissingFromEntry,
  wsSessionMatchKey,
} from './ws-session-links';

function makeWs(overrides: Parameters<typeof makeTrafficEntry>[0] = {}) {
  return makeTrafficEntry({
    status: 101,
    reasonCode: 'websocket_frames',
    path: '/socket',
    scheme: 'https',
    wsFrameCount: 2,
    ...overrides,
  });
}

describe('ws-session-links', () => {
  it('detects websocket captures', () => {
    expect(isWsTrafficEntry(makeWs())).toBe(true);
    expect(isWsTrafficEntry(makeTrafficEntry())).toBe(false);
  });

  it('match key ignores query and normalizes scheme', () => {
    const a = makeWs({ query: 'token=1' });
    const b = makeWs({ scheme: 'http', query: 'token=2' });
    expect(wsSessionMatchKey(a)).toBe('wss|api.example.com|/socket');
    expect(wsSessionMatchKey(b)).toBe('ws|api.example.com|/socket');
  });

  it('finds newer reconnect preferring open', () => {
    const closed = makeWs({ id: 'a', startedAt: 100, wsClosed: true });
    const olderOpen = makeWs({ id: 'b', startedAt: 150, wsClosed: false });
    const newestClosed = makeWs({ id: 'c', startedAt: 200, wsClosed: true });
    const otherHost = makeWs({ id: 'd', startedAt: 300, host: 'other.example.com' });

    expect(findNewerWsReconnect(closed, [newestClosed, olderOpen, closed, otherHost])?.id).toBe(
      'b',
    );
    expect(findNewerWsReconnect(closed, [newestClosed, closed])?.id).toBe('c');
    expect(findNewerWsReconnect(closed, [closed, otherHost])).toBeNull();
  });

  it('finds previous session preferring closed with messages', () => {
    const open = makeWs({ id: 'now', startedAt: 300, wsClosed: false, wsFrameCount: 0 });
    const closedEmpty = makeWs({
      id: 'old-empty',
      startedAt: 200,
      wsClosed: true,
      wsFrameCount: 0,
    });
    const closedMsgs = makeWs({
      id: 'old-msgs',
      startedAt: 100,
      wsClosed: true,
      wsFrameCount: 5,
    });
    const openOlder = makeWs({ id: 'open-old', startedAt: 250, wsClosed: false });

    expect(findPreviousWsSession(open, [open, openOlder, closedEmpty, closedMsgs])?.id).toBe(
      'old-msgs',
    );
  });

  it('detects missing frame payloads', () => {
    expect(wsFramesMissingFromEntry(makeWs({ wsFrameCount: 3, wsFrames: null }))).toBe(true);
    expect(
      wsFramesMissingFromEntry(
        makeWs({
          wsFrameCount: 1,
          wsFrames: [
            {
              id: 'f1',
              at: 1,
              dir: 'client',
              opcode: 'text',
              size: 2,
              payload: { kind: 'text', size: 2, text: 'hi' },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('finds capture blocker when closed WS has later bypass and no newer WS', () => {
    const closed = makeWs({ id: 'ws', startedAt: 100, wsClosed: true });
    const bypass = makeTrafficEntry({
      id: 'bypass',
      startedAt: 200,
      host: 'api.example.com',
      reasonCode: 'mitm_bypassed',
      bypassCause: 'mitm_unsupported',
      status: 502,
    });
    const blocker = findWsCaptureBlocker(closed, [bypass, closed]);
    expect(blocker?.entry.id).toBe('bypass');
    expect(wsCaptureBlockerMessage(blocker!).title).toContain('session bypass');
  });

  it('ignores mitm_no_request without bypassCause as blocker', () => {
    const closed = makeWs({ id: 'ws', startedAt: 100, wsClosed: true });
    const timeout = makeTrafficEntry({
      id: 'timeout',
      startedAt: 200,
      host: 'api.example.com',
      reasonCode: 'mitm_no_request',
      status: 502,
    });
    expect(findWsCaptureBlocker(closed, [timeout, closed])).toBeNull();
  });

  it('treats unsupported with bypassCause as blocker', () => {
    const closed = makeWs({ id: 'ws', startedAt: 100, wsClosed: true });
    const unsupported = makeTrafficEntry({
      id: 'h2',
      startedAt: 200,
      host: 'api.example.com',
      reasonCode: 'mitm_unsupported',
      bypassCause: 'mitm_unsupported',
      status: 502,
    });
    expect(findWsCaptureBlocker(closed, [unsupported, closed])?.entry.id).toBe('h2');
  });

  it('returns null blocker when a newer WS exists', () => {
    const closed = makeWs({ id: 'ws', startedAt: 100, wsClosed: true });
    const bypass = makeTrafficEntry({
      id: 'bypass',
      startedAt: 150,
      host: 'api.example.com',
      reasonCode: 'mitm_bypassed',
      status: 502,
    });
    const newer = makeWs({ id: 'ws2', startedAt: 200, wsClosed: false });
    expect(findWsCaptureBlocker(closed, [newer, bypass, closed])).toBeNull();
  });

  it('detects ALPN blocker copy', () => {
    const closed = makeWs({ id: 'ws', startedAt: 100, wsClosed: true });
    const alpn = makeTrafficEntry({
      id: 'alpn',
      startedAt: 200,
      host: 'api.example.com',
      reasonCode: 'alpn_no_http11',
      status: 502,
    });
    const blocker = findWsCaptureBlocker(closed, [alpn, closed]);
    expect(blocker?.reasonCode).toBe('alpn_no_http11');
    expect(wsCaptureBlockerMessage(blocker!).title).toContain('ALPN');
  });
});
