# Lenswire iOS proxy

Local traffic capture stack for Lenswire on iOS. Device traffic is routed through a Packet Tunnel `utun` interface into hev-socks5-tunnel, then a localhost SOCKS bridge, then an HTTP(S) MITM proxy that records requests and (when enabled) decrypts TLS.

Android twin: [`../android/README.md`](../android/README.md). App launch / CA flows: root [`README.md`](../../../README.md#run).

## Build & run

```bash
# From repo root — first time / after native tunnel or vendor changes:
npm run prebuild:ios   # includes link-hev-ios
npx expo run:ios --device

# JS-only iteration (ios/ already generated):
npm run ios            # Simulator — UI only, no Packet Tunnel
```

`prebuild:ios` runs `expo prebuild -p ios --clean` then [`scripts/link-hev-ios.js`](../../../scripts/link-hev-ios.js) so `vendor/HevSocks5Tunnel.xcframework` is linked into the Packet Tunnel target. If you prebuild another way, run `npm run link:hev-ios` afterward.

## Architecture

```
App / system sockets
        │
        ▼
┌──────────────────────────┐
│  NEPacketTunnelProvider  │  10.8.0.2, route 0.0.0.0/0 (+ optional ::/0)
│  (packetFlow / utun)     │
└────────────┬─────────────┘
             │ utun fd
             ▼
┌──────────────────────────┐
│  hev-socks5-tunnel       │  TCP (+ UDP via SOCKS UDP ASSOCIATE)
└────────────┬─────────────┘
             │ socks5://127.0.0.1:1080
             ▼
┌──────────────────────────┐
│ SocksBridgeServer        │  SOCKS5 → HTTP CONNECT / plain HTTP
└────────────┬─────────────┘
             │ 127.0.0.1:9090
             ▼
┌──────────────────────────┐
│ LocalProxyServer         │  Capture + optional HTTPS MITM
└────────────┬─────────────┘
             │ extension egress (off-tunnel)
             ▼
        Upstream Internet
```

`LocalProxyServer` and `SocksBridgeServer` listen on **127.0.0.1** only.

| Component | Port | Role |
|-----------|------|------|
| `LocalProxyServer` | `9090` | HTTP proxy + CONNECT MITM / passthrough |
| `SocksBridgeServer` | `1080` | SOCKS5 front-end for hev |
| `Tun2SocksRuntime` | — | hev over Packet Tunnel utun fd |
| `UnderlyingNetwork` | — | `NWPathMonitor` diagnostics |

## Startup sequence (`PacketTunnelProvider`)

1. Request VPN permission (JS → `LenswireProxy.startCapture`).
2. Configure `UnderlyingNetwork` path monitor.
3. Start `LocalProxyServer` on `127.0.0.1:9090`.
4. Start `SocksBridgeServer` on `127.0.0.1:1080`.
5. `setTunnelNetworkSettings` (IPv4 default route, DNS, optional IPv6) — **no** `NEProxySettings`.
6. Start hev with the utun file descriptor → `socks5://127.0.0.1:1080`.
7. Publish diagnostics to the App Group (`ProxyRuntimeStore`).

## How capture works

Same MITM policy as Android (`LocalProxyServer`):

- Plain HTTP is forwarded and recorded.
- `CONNECT` peeks ClientHello (SNI / ALPN), then MITM or passthrough / session bypass.
- SOCKS bridge peeks ClientHello for non-80 TCP and sends `X-Lenswire-SNI` on the CONNECT to `:9090`.
- UDP ASSOCIATE forwards DNS for hev.

### WebSocket frames

- HTTP/1.1 `Upgrade: websocket` is captured as `websocket_frames` (read-only frame inspect via `WebSocketFrameParser`).
- Each Upgrade is a **new** capture. Reconnects are not merged into a closed session.
- `MitmSessionBypassPolicy` + `WsMitmHostStore` (App Group): idle MITM timeouts do not session-bypass; after successful WS MITM, parallel HTTP/2 does not poison that host. Cleared with session bypass / Stop VPN.

## Vendored hev

Binary: [`vendor/HevSocks5Tunnel.xcframework`](../../../vendor/HevSocks5Tunnel.xcframework) (from [Tun2SocksKit](https://github.com/EbrahimTahernejad/Tun2SocksKit) / hev-socks5-tunnel).

Linked into the Packet Tunnel target by [`scripts/link-hev-ios.js`](../../../scripts/link-hev-ios.js) (runs automatically via `npm run prebuild:ios`).

C helpers: [`targets/network-packet-tunnel/HevSupport/`](../../../targets/network-packet-tunnel/HevSupport/) (`lenswire_find_utun_fd`, bridging header).

## Sync’d MITM sources

These stay byte-identical between the app module and the tunnel target (`npm run check:ios-sync`):

- `LocalProxyServer.swift`
- `LenswireShared.swift` (includes `ProxyRuntimeStore`, `WsMitmHostStore`)
- `WebSocketFrameParser.swift`
- `TLSBridge.swift`
- `CertificateAuthority.swift`
- `TlsSni.swift`
- `X509.swift`

Tunnel-only (not mirrored): `PacketTunnelProvider`, `SocksBridgeServer`, `Tun2SocksRuntime`, `UnderlyingNetwork`, `HevSupport/`.

## Simulator

Packet Tunnel does **not** work on Simulator. Device build + paid Apple Developer team + Network Extension entitlement required.

## Security notes

- Listeners are loopback-only.
- MITM requires the user to install/trust the Lenswire CA; certificate pinning is not bypassed.
- Extension sockets egress outside the tunnel by Apple’s Packet Tunnel model; `NWPathMonitor` reports the preferred path for diagnostics.
