export type CaptureStatusId = 'decrypted' | 'tunnel' | 'bypassed' | 'skipped';

export type CaptureStatusCopy = {
  id: CaptureStatusId;
  label: string;
  short: string;
  detail: string;
};

export const CAPTURE_STATUSES_INTRO = {
  title: 'Capture statuses',
  lead: 'Decrypt when we can, tunnel when we can’t. Filters and badges on the domain list use these four statuses.',
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
    short: 'Client only offered HTTP/2 or HTTP/3 — MITM skipped, straight tunnel.',
    detail:
      'The ClientHello ALPN offered only h2/h3 (no http/1.1). Lenswire never starts MITM for that connect and uses a transparent tunnel. The UI may show HTTP/2 or HTTP/3 version badges.',
  },
];
