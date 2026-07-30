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
    wash: 'from-[#0B3D91]/to-[#48CAE4]',
  },
  {
    eyebrow: 'Inspect',
    title: 'Headers, bodies, timing',
    body: 'Open any call for Overview, Request, Response, and Timing. Tree or raw JSON, Copy as cURL, Share HAR.',
    src: '/screenshots/request.jpg',
    alt: 'Lenswire request detail',
    reverse: true,
    wash: 'from-[#023E8A]/to-[#00B4D8]',
  },
  {
    eyebrow: 'Override',
    title: 'Mocks and rewrites',
    body: 'Create an override from a captured call — mock the response, or rewrite what goes to the server.',
    src: '/screenshots/settings.jpg',
    alt: 'Lenswire traffic overrides settings',
    wash: 'from-[#03045E]/to-[#0077B6]',
  },
] as const;

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
