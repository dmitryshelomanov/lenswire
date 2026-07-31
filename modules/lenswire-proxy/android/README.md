# Lenswire Android proxy

Primary doc: this file. iOS twin: [`../ios/README.md`](../ios/README.md). App launch / CA flows: root [`README.md`](../../../README.md#run).

Local traffic capture stack for Lenswire on Android. Device traffic is routed through a VPN TUN interface into a localhost SOCKS bridge, then into an HTTP(S) MITM proxy that records requests and (when enabled) decrypts TLS.

## Build & run

```bash
# From repo root — first time / after native Android module changes:
npm run prebuild:android
npm run android

# JS-only iteration (android/ already generated):
npm run android
```

Emulator Chrome HTTPS needs System CA: `npm run android:trust-ca` (rooted AVD). See root README.

### IDE / Cursor highlighting

This directory is a dual-mode Gradle root so Cursor’s Kotlin language server can resolve `kotlin-stdlib` (avoids false `kotlin.Function1` / missing stdlib errors). Root [`.gitignore`](../../../.gitignore) also skips generated `android/app` so fwcd.kotlin does not merge the Expo `:app` classpath (that was causing errors to flicker back after a clean/rebuild).

After pulling: **Developer: Reload Window**, then reopen a `.kt` file. Keep `JAVA_HOME` set (see [`.vscode/settings.json`](../../../.vscode/settings.json)).

For full Expo API completion (`LenswireProxyModule`, etc.), open the app [`android/`](../../../android/) project in Android Studio — autolinking provides `expo-modules-core`.

## Architecture

```
App / system sockets
        │
        ▼
┌───────────────────┐
│  VpnService TUN   │  10.8.0.2, route 0.0.0.0/0 (+ optional ::/0)
│  (LenswireVpn)    │  Lenswire app itself is disallowed (no self-loop)
└─────────┬─────────┘
          │ fd://TUN
          ▼
┌───────────────────┐
│  tun2socks (leaf) │  TCP (+ UDP via SOCKS UDP ASSOCIATE)
└─────────┬─────────┘
          │ socks5://127.0.0.1:1080
          ▼
┌───────────────────┐
│ SocksBridgeServer │  SOCKS5 → HTTP CONNECT / plain HTTP
└─────────┬─────────┘
          │ 127.0.0.1:9090
          ▼
┌───────────────────┐
│ LocalProxyServer  │  Capture + optional HTTPS MITM
└─────────┬─────────┘
          │ protect() + bind to real Wi‑Fi/cellular
          ▼
     Upstream Internet
```

All listener sockets bind to **127.0.0.1** only. LAN clients cannot reach the MITM endpoint.

| Component | Port | Role |
|-----------|------|------|
| `LocalProxyServer` | `9090` | HTTP proxy + CONNECT MITM / passthrough |
| `SocksBridgeServer` | `1080` | SOCKS5 front-end for tun2socks |
| `Tun2SocksRuntime` | — | leaf `Engine`: TUN fd → SOCKS5 |
| `UnderlyingNetwork` | — | DNS + TCP egress on the non-VPN network |

## Startup sequence (`LenswireVpnService`)

1. Request VPN permission (JS → `LenswireProxy.startCapture`).
2. Establish TUN (`Builder`), start foreground notification.
3. Configure `UnderlyingNetwork` with `VpnService.protect`.
4. Start `LocalProxyServer` on `127.0.0.1:9090`.
5. Start `SocksBridgeServer` on `127.0.0.1:1080`.
6. Start tun2socks with `socks5://127.0.0.1:1080`.

Upstream sockets are always **protected** so they leave via Wi‑Fi/cellular and never re-enter the TUN.

## UnderlyingNetwork (egress without loopback)

With a full-tunnel VPN (`0.0.0.0/0`), plain DNS and `Socket.connect` would go into the TUN, back into the local stack, and loop. `UnderlyingNetwork` breaks that cycle for every upstream dial:

1. Pick a non-VPN network (`underlyingOrNull`: Wi‑Fi/cellular with `INTERNET`, skip `TRANSPORT_VPN`).
2. `VpnService.protect(socket)` — keep the fd out of VPN routing.
3. `Network.bindSocket(socket)` — force egress onto that underlying network.
4. `Network.getAllByName(host)` — resolve DNS on the same network, not via the system resolver over the VPN.

Used by `LocalProxyServer` (HTTP/TLS upstream), `SocksBridgeServer` (UDP ASSOCIATE), and configured from `LenswireVpnService`.

## How `LocalProxyServer` works

Listens on localhost and accepts either:

- **Absolute-form / origin-form HTTP** — forward with `HttpURLConnection`, record request/response in `CaptureStore`.
- **`CONNECT host:port`** — HTTPS (and other TLS) tunnels.

### CONNECT path

1. Reply `HTTP/1.1 200 Connection Established`.
2. Peek TLS **ClientHello** (`TlsSni`) to recover SNI / ALPN. The SOCKS bridge may also send `X-Lenswire-SNI` and replay ClientHello bytes after the 200.
3. Decide MITM vs passthrough:

| Condition | Outcome |
|-----------|---------|
| HTTPS decrypt disabled | Passthrough tunnel |
| CA not generated / not installed | Passthrough |
| Host already on session MITM bypass list | Passthrough |
| Effective host is an IP literal | Passthrough (`ip_no_sni`) |
| No ClientHello available | Passthrough |
| ALPN has no HTTP/1.1 | Passthrough (`alpn_no_http11`) |
| Otherwise | MITM |

4. **MITM**: present a leaf cert signed by the in-app CA (`CertificateManager`), terminate TLS toward the client, open a real TLS session upstream, parse HTTP/1.1, apply `OverrideRules`, store captures.
5. **Passthrough**: bidirectional byte relay with ClientHello replay via `PrefixedSocket`. No body inspection.
6. **Fail-open / hard failure**: if MITM cannot complete safely before the client has accepted our cert, fall back to passthrough; if TLS already started on the client side, close and optionally add the host to the session bypass map so later connections skip MITM.

### SOCKS bridge details

- **Port 80**: pipe the SOCKS client straight to the local HTTP proxy (origin-form requests).
- **Other TCP**: SOCKS success → peek ClientHello → `CONNECT` to `:9090` with optional `X-Lenswire-SNI` → replay ClientHello → bidirectional relay.
- **UDP ASSOCIATE**: DNS and other UDP for tun2socks; outbound datagrams are protected and bound to the underlying network.

## Captures & overrides

- **`CaptureStore`** — JSON files under app storage (`captures/`), ring buffer of recent items, revision counter for JS polling.
- **`OverrideRules`** — match method/scheme/host/path/query and return a synthetic status/headers/body instead of hitting upstream (HTTP and decrypted HTTPS).
- Recording can be paused without tearing down the VPN.

## Certificates

`CertificateManager` generates a local CA. The user must install/trust the CA for MITM of non-pinned HTTPS. Leaf certs are minted per hostname and cached in memory for the session. Regenerating the CA clears MITM SSL context and bypass state.

Certificate pinning and HTTP/3 (QUIC) are **not** decryptable; such traffic is tunnelled or forced toward TCP where the stack can see it.

## Key source files

| File | Purpose |
|------|---------|
| `LocalProxyServer.kt` | HTTP proxy, CONNECT MITM / passthrough, capture emission |
| `SocksBridgeServer.kt` | SOCKS5 TCP + UDP ASSOCIATE → local proxy |
| `LenswireVpnService.kt` | VpnService lifecycle, wiring of the stack |
| `Tun2SocksRuntime.kt` | leaf engine over the TUN fd |
| `UnderlyingNetwork.kt` | protect / bind / resolve on real network |
| `CertificateManager.kt` | CA + leaf generation |
| `CaptureStore.kt` | persisted capture index |
| `OverrideRules.kt` | response override matching |
| `TlsSni.kt` / `MitmAlpn.kt` | ClientHello SNI/ALPN helpers |
| `LenswireProxyModule.kt` | Expo module API to JS |

## Security notes

- Listeners are loopback-only.
- The Lenswire package is excluded from the VPN so the app UI and JS bridge are not captured by themselves.
- MITM only works for clients that trust the generated CA and do not pin certificates.
- Session MITM bypass avoids repeatedly breaking hosts that reject the forged cert.
