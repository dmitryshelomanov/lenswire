export const features = [
  {
    title: 'Device VPN capture',
    body: 'iOS Packet Tunnel and Android VpnService route traffic through a local MITM — no desktop required.',
  },
  {
    title: 'HTTPS decryption',
    body: 'Install the Lenswire CA, toggle decryption, and read requests and responses in plain text.',
  },
  {
    title: 'Domain & client filters',
    body: 'Group by host, filter by method, status, client (OkHttp and more), and search paths fast.',
  },
  {
    title: 'Request & response detail',
    body: 'Headers, JSON tree/raw body preview, timing, Copy as cURL, and Share HAR.',
  },
  {
    title: 'Mock & rewrite overrides',
    body: 'Mock responses without hitting the server, or rewrite request payloads before they leave the device.',
  },
  {
    title: 'On-device privacy',
    body: 'No remote proxy servers — captures stay on your phone. Fail-open MITM with clear bypass reasons.',
  },
] as const;

export const screens = [
  {
    src: '/screenshots/traffic.jpg',
    alt: 'Lenswire traffic list with domain groups',
    title: 'Traffic',
    body: 'Domains and requests as they arrive — pause, clear, send a test call.',
  },
  {
    src: '/screenshots/domain.jpg',
    alt: 'Lenswire domain detail with request list',
    title: 'Domain',
    body: 'Open a host and browse its paths, methods, and statuses.',
  },
  {
    src: '/screenshots/request.jpg',
    alt: 'Lenswire request inspector',
    title: 'Request',
    body: 'Query, headers, and body for the outgoing call.',
  },
  {
    src: '/screenshots/response.jpg',
    alt: 'Lenswire response body preview',
    title: 'Response',
    body: 'Status, headers, and JSON preview for the reply.',
  },
  {
    src: '/screenshots/settings.jpg',
    alt: 'Lenswire settings and traffic overrides',
    title: 'Overrides',
    body: 'Mock responses or rewrite requests; toggle HTTPS decryption.',
  },
] as const;

export const spotlights = [
  {
    eyebrow: 'Capture',
    title: 'Traffic on the phone',
    body: 'Start the VPN, watch domains appear, and open paths with method and status — decrypted when your CA is trusted.',
    src: '/screenshots/traffic.jpg',
    alt: 'Lenswire traffic list',
    wash: 'from-[#0B3D91] to-[#48CAE4]',
  },
  {
    eyebrow: 'Inspect',
    title: 'Headers, bodies, timing',
    body: 'Open any call for Overview, Request, Response, and Timing. Tree or raw JSON, Copy as cURL, Share HAR.',
    src: '/screenshots/request.jpg',
    alt: 'Lenswire request detail',
    reverse: true,
    wash: 'from-[#023E8A] to-[#00B4D8]',
  },
  {
    eyebrow: 'Override',
    title: 'Mocks and rewrites',
    body: 'Create an override from a captured call — mock the response, or rewrite what goes to the server.',
    src: '/screenshots/settings.jpg',
    alt: 'Lenswire traffic overrides settings',
    wash: 'from-[#03045E] to-[#0077B6]',
  },
] as const;

export const comparison = {
  tools: ['Lenswire', 'Charles Proxy', 'Proxyman', 'mitmproxy'] as const,
  highlight: 'Lenswire' as const,
  rows: [
    {
      criterion: 'Runs on the phone (no desktop)',
      values: ['yes', 'no', 'no', 'no'] as const,
    },
    {
      criterion: 'iOS + Android',
      values: ['yes', 'via proxy setup', 'via proxy setup', 'via proxy setup'] as const,
    },
    {
      criterion: 'HTTPS decryption',
      values: ['yes', 'yes', 'yes', 'yes'] as const,
    },
    {
      criterion: 'Mock / rewrite',
      values: ['yes', 'yes', 'yes', 'yes'] as const,
    },
    {
      criterion: 'Free & open source',
      values: ['yes (MIT)', 'paid', 'freemium', 'yes'] as const,
    },
    {
      criterion: 'Traffic stays on-device',
      values: ['yes', 'desktop host', 'desktop host', 'desktop host'] as const,
    },
  ],
  footnote:
    'Charles, Proxyman, and mitmproxy (CLI or mitmweb) run on a computer — you point the phone at that proxy. Proxyman started on Mac and also has Windows.',
} as const;

export const faqs = [
  {
    q: 'Do I need a desktop proxy?',
    a: 'No. Lenswire runs a local MITM on the device via VPN (Packet Tunnel on iOS, VpnService on Android).',
  },
  {
    q: 'How does HTTPS decryption work?',
    a: 'Generate and install the Lenswire CA, enable HTTPS decryption in Settings. Certificate-pinned apps still need unpinning tools on a rooted/jailbroken device.',
  },
  {
    q: 'Is traffic sent to remote servers?',
    a: 'No. Capture stays on your device. There is no Lenswire cloud proxy.',
  },
] as const;

export const REPO_URL = 'https://github.com/dmitryshelomanov/lenswire';
export const REPO_BLOB =
  `${REPO_URL}/blob/main/modules/lenswire-proxy/android/src/main/java/expo/modules/lenswireproxy` as const;
export const QUICK_START_URL = `${REPO_URL}#readme` as const;
export const ANDROID_BUILD_URL = `${REPO_URL}#android--google-play` as const;

export const getStarted = {
  title: 'Get the app',
  lead: 'Build a preview APK for Android, or clone the repo and run with Expo. Store builds are in progress.',
  primaryLabel: 'Quick start on GitHub',
  primaryHref: QUICK_START_URL,
  secondaryLabel: 'Android preview build',
  secondaryHref: ANDROID_BUILD_URL,
} as const;

export const howTeaser = {
  title: 'MITM when we can, tunnel when we can’t',
  lead: 'Every HTTPS connection takes one path: decrypt and inspect, or a sealed byte tunnel. You still see the connection either way — payload only when MITM succeeds.',
  cta: 'See how it works',
} as const;

export const howItWorks = {
  title: 'How the pipe works',
  lead: 'Apps hit a local VPN. The proxy checks whether it can decrypt HTTPS. If yes — MITM: open the bytes, inspect, send them on. If not — a sealed byte tunnel; you still see the connection in the UI, but not the HTTP payload.',
  platformNote: 'iOS Packet Tunnel · Android VpnService → tun2socks → SOCKS',
  fork: {
    intro: 'The fork',
    heading: 'One gate. Two exits.',
    lead: 'Before any decrypt, the proxy decides canMitm. Decrypt off, missing CA, no SNI, session bypass, or ALPN without HTTP/1.1 → runPassthrough. Otherwise → runMitm.',
    code: `if (!canMitm) {
  runPassthrough(/* … */, reasonCode = …)  // captureMode: tunnel
  return
}
runMitm(/* … */)  // decrypt → inspect → upstream → encrypt back`,
    sourceLabel: 'View canMitm gate · LocalProxyServer.kt',
    sourceHref: `${REPO_BLOB}/LocalProxyServer.kt#L283-L335`,
  },
  mitm: {
    title: 'We MITM',
    lead: 'Terminate TLS with the app → read HTTP → talk to the server → encrypt back.',
    items: [
      {
        label: 'HTTP/1.1',
        body: 'When the client offers http/1.1 (often with h2), we force that ALPN, decrypt request and response, and show full payload in the UI. Overrides land here.',
        code: 'decrypted',
        sourceHref: `${REPO_BLOB}/LocalProxyServer.kt#L426`,
      },
      {
        label: 'WebSocket',
        body: 'After MITM TLS, Upgrade is relayed end-to-end. Frames are not inspected; the host is not added to session bypass.',
        code: 'websocket_relay',
      },
    ],
  },
  tunnel: {
    title: 'We tunnel',
    lead: 'runPassthrough relays encrypted bytes as-is. captureMode: tunnel — payload unavailable in the UI.',
    items: [
      {
        label: 'ALPN without HTTP/1.1',
        body: 'ClientHello only offers h2 or h3. We never start MITM — straight tunnel. UI shows HTTP/2 or HTTP/3, not a decrypted call.',
        code: 'alpn_no_http11',
        sourceHref: `${REPO_BLOB}/LocalProxyServer.kt#L290-L306`,
      },
      {
        label: 'Session bypass',
        body: 'Trust fail or non-HTTP/1.1 after handshake → that connect closes; the host stays tunnel-only until you stop VPN. UI shows the bypass cause.',
        code: 'mitm_bypassed',
      },
      {
        label: 'No request after handshake',
        body: 'Timeout with no HTTP → close and bypass so retries tunnel. Empty EOF → close without bypass, so speculative CDN connects can still MITM next time.',
        code: 'mitm_no_request',
      },
      {
        label: 'Decrypt off / no CA / no SNI',
        body: 'MITM impossible up front. Still captured as a tunnel via runPassthrough — not a decrypted call.',
        code: 'passthrough',
        sourceHref: `${REPO_BLOB}/LocalProxyServer.kt#L759`,
      },
    ],
  },
  protocolsIntro: 'Same pipe. Two exits.',
  protocolsHeading: 'Open the payload — or keep it sealed',
  protocolsLead:
    'MITM calls show as HTTP/1.1 with full headers and body. Pure h2/h3 tunnels get version flags only. A successful downgrade is labeled HTTP/1.1 — the inspectable payload you actually got.',
  ctaTitle: 'Free and open source',
  ctaBody: 'MIT licensed. Capture and decrypt stay on your device.',
} as const;
