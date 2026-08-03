export type CaptureStatusId = 'decrypted' | 'tunnel' | 'bypassed' | 'skipped' | 'quic';

export type CaptureStatusCopy = {
  id: CaptureStatusId;
  label: string;
  short: string;
  detail: string;
};

/** One-line capability limits — reuse everywhere users wait or learn capture. */
export const CAPTURE_LIMITS_LINE =
  'Decrypts HTTP/1.1 after CA trust; H2-only, QUIC, pinned apps stay tunnel.';

export const CAPTURE_STATUSES_INTRO = {
  title: 'Capture statuses',
  lead: 'Decrypt when we can, tunnel when we can’t. Filters and badges on the domain list use these statuses.',
  limits: CAPTURE_LIMITS_LINE,
} as const;

export const CAPTURE_STATUS_ITEMS: CaptureStatusCopy[] = [
  {
    id: 'decrypted',
    label: 'Decrypted',
    short: 'HTTPS was MITM’d (or cleartext HTTP) — headers and body are inspectable.',
    detail:
      'The host has at least one decrypted or cleartext HTTP capture. You can open requests and inspect headers and body. Needs HTTPS decryption on and a trusted Lenswire CA for HTTPS.',
  },
  {
    id: 'tunnel',
    label: 'Tunnel',
    short: 'Bytes relayed encrypted — connection visible, no HTTP payload.',
    detail:
      'Every capture for this host is an opaque tunnel. The connection still appears in the list, but headers and body are unavailable. Common when decrypt is off, the CA is missing, or MITM cannot start.',
  },
  {
    id: 'bypassed',
    label: 'Bypassed',
    short: 'MITM failed once — host stays tunnel-only until you Stop VPN.',
    detail:
      'MITM failed or was refused for this host (trust fail, unsupported protocol, and similar). The host is on the session bypass list, so later connects stay tunnel-only until you Stop VPN and start again.',
  },
  {
    id: 'skipped',
    label: 'Skipped',
    short: 'Client only offered HTTP/2 or HTTP/3 on TCP — MITM skipped, straight tunnel.',
    detail:
      'The TCP ClientHello ALPN offered only h2/h3 (no http/1.1). Lenswire never starts MITM for that connect and uses a transparent tunnel. The UI may show HTTP/2 or HTTP/3 version badges. This is not the same as UDP QUIC.',
  },
  {
    id: 'quic',
    label: 'QUIC',
    short: 'UDP/443 (HTTP/3) was blocked — clients should fall back to TCP.',
    detail:
      'QUIC carries HTTP/3 over UDP (usually port 443). Lenswire does not decrypt QUIC, so UDP/443 is blocked and a once-per-host capture is logged. Browsers and apps typically retry over TCP TLS, which can then be decrypted or tunneled normally.',
  },
];
