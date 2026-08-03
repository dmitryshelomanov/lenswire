import { describe, expect, it } from 'vitest';

import { makeTrafficEntry } from '@/entities/traffic/test-fixtures';

import { decryptHelpHint, decryptHelpTitle } from './entry-display';

describe('decryptHelpTitle / decryptHelpHint', () => {
  it('specializes empty client-closed as mitm_no_request', () => {
    const entry = makeTrafficEntry({
      reasonCode: 'mitm_no_request',
      captureSummary:
        'No HTTP request after MITM handshake (client closed); …\nguess=empty; bytes=0; cause=eof',
    });
    expect(decryptHelpTitle(entry)).toBe('Client closed after MITM');
    expect(decryptHelpHint(entry)).toMatch(/Host was not added to session bypass/i);
  });

  it('specializes HTTP/2 unsupported', () => {
    const entry = makeTrafficEntry({
      reasonCode: 'mitm_unsupported',
      captureSummary: 'HTTP/2 after MITM handshake; …\nguess=http2; method=PRI',
    });
    expect(decryptHelpTitle(entry)).toBe('HTTP/2 after MITM');
    expect(decryptHelpHint(entry)).toMatch(/not added to session bypass/i);
  });

  it('specializes HTTP/2 unsupported with session bypass', () => {
    const entry = makeTrafficEntry({
      reasonCode: 'mitm_unsupported',
      bypassCause: 'mitm_unsupported',
      captureSummary: 'HTTP/2 after MITM handshake; …\nguess=http2; method=PRI',
    });
    expect(decryptHelpTitle(entry)).toBe('HTTP/2 after MITM (bypassed)');
    expect(decryptHelpHint(entry)).toMatch(/Stop VPN/i);
  });

  it('specializes binary unsupported', () => {
    const entry = makeTrafficEntry({
      reasonCode: 'mitm_unsupported',
      captureSummary: 'Non-HTTP/binary…\nguess=non_http; hex=00 01',
    });
    expect(decryptHelpTitle(entry)).toBe('Non-HTTP after MITM');
  });

  it('timeout mitm_no_request is not session bypass', () => {
    const entry = makeTrafficEntry({
      reasonCode: 'mitm_no_request',
      captureSummary:
        'No HTTP request after MITM handshake (read timeout); …\nguess=empty; bytes=0; cause=timeout',
    });
    expect(decryptHelpTitle(entry)).toBe('No HTTP after MITM (timeout)');
    expect(decryptHelpHint(entry)).toMatch(/not added to session bypass/i);
  });
  it('specializes session bypass by cause', () => {
    const trust = makeTrafficEntry({
      reasonCode: 'mitm_bypassed',
      bypassCause: 'mitm_handshake_failed',
    });
    expect(decryptHelpTitle(trust)).toBe('Session bypass (trust fail)');
    expect(decryptHelpHint(trust)).toMatch(/trust/i);

    const proto = makeTrafficEntry({
      reasonCode: 'mitm_bypassed',
      bypassCause: 'mitm_unsupported',
    });
    expect(decryptHelpTitle(proto)).toBe('Session bypass (unsupported protocol)');
  });
});
