# Lenswire

Native HTTP(S) inspector — ProxyMan-style. VPN capture on device; Simulator / Android MVP modes for development without full MITM yet.

## Requirements

- Node **22.13+** (see [`.nvmrc`](.nvmrc))
- Mac + Xcode 16+ (iOS)
- Android Studio / SDK (Android)
- For **iOS device VPN**: Apple Developer Program (Network Extension) + physical iPhone
- For **iOS Simulator Dev Mode**: free Personal Team is enough
- For **Android**: no paid account required (`VpnService`)

## Run

```bash
nvm use
npm install
npm run prebuild:ios       # first time / after native iOS changes
npm run ios                # Simulator OK without paid NE team

npm run prebuild:android   # first time / after native Android changes
npm run android
```

## iOS Simulator Dev Mode

Packet Tunnel does **not** work on Simulator (`IPC failed`). Dev Mode starts `LocalProxyServer` in-process.

```bash
npm run ios
# Certificate → Generate CA
npm run sim:trust-ca
# Start → Send test request
```

Optional Mac HTTP proxy for Simulator Safari: `sim:mac-proxy-on` / `sim:mac-proxy-off`.

## Android MVP

```bash
npm run android
# Certificate → Generate CA → Install CA (system dialog)
# Start → allow VPN → Send test request
```

Smoke test: **Send test request** (in-app HTTP via `127.0.0.1:9090`) is the reliable path. Emulator browser traffic is optional:

```bash
npm run android:emu-proxy   # prints -http-proxy instructions
# Cold-boot / Extended controls: -http-proxy 127.0.0.1:9090
# (proxy runs inside the app process — do not use 10.0.2.2)
```

Notes:

- `VpnService` starts a foreground VPN session for the system permission UX; MVP does **not** rewrite TUN traffic yet (`tun2socks` follow-up). Capture goes through in-process `LocalProxyServer` on `:9090`.
- Plain HTTP is forwarded and recorded; HTTPS `CONNECT` is capture-only (no MITM decrypt yet).
- User CA store on Android 7+ is ignored by many apps (same as Proxyman without a system CA).
- No Apple Developer account needed — Android `VpnService` is enough for this MVP.

## Device usage (real iOS VPN)

1. Paid Apple Developer team + physical iPhone  
2. **Certificate** → Generate CA → Install profile → trust in Settings  
3. **Start** → allow VPN  
4. Open Safari or any app — requests appear in the list  

## Architecture

```
iOS device:  apps → Packet Tunnel → LocalProxyServer → UI
iOS Sim:     Start → in-process LocalProxyServer → UI
Android:     VpnService + LocalProxyServer :9090 → UI (+ probe / emu http-proxy)
```

| Path | Role |
|------|------|
| `app/` | Expo Router UI |
| `modules/lenswire-proxy/` | Native bridge (iOS + Android) |
| `targets/network-packet-tunnel/` | iOS VPN extension |
| `scripts/sim-dev.sh` | iOS Simulator CA / Mac proxy |
| `scripts/android-dev.sh` | Android emulator proxy / CA hints |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run ios` / `android` | Build & run |
| `npm run prebuild:ios` / `prebuild:android` | Regenerate native projects |
| `npm run sim:trust-ca` | Trust Dev CA in booted iOS Simulator |
| `npm run sim:mac-proxy-on/off` | Mac HTTP(S) proxy helpers |
| `npm run android:emu-proxy` | Emulator http-proxy instructions |
| `npm run android:trust-ca` | Android CA install hints |
