#!/usr/bin/env bash
set -euo pipefail

PORT="${LENSWIRE_PROXY_PORT:-9090}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <emu-proxy-hint|trust-ca-hint>

  emu-proxy-hint   Print how to point the Android emulator HTTP proxy at Lenswire
  trust-ca-hint    Print how to install the Dev CA on emulator/device
EOF
}

cmd_emu_proxy() {
  cat <<EOF
Android emulator → Lenswire local proxy (:${PORT})

1. Start Lenswire on the emulator and tap Start (allow VPN).
2. Point the emulator HTTP proxy at the in-guest proxy (runs inside the app process):

   emulator -avd <Your_AVD> -http-proxy 127.0.0.1:${PORT}

   Or: Extended controls → Settings → Proxy → Manual → 127.0.0.1:${PORT}

   Do not use 10.0.2.2 — that is the host loopback from the emulator, not the
   in-app LocalProxyServer.

3. Open the emulator Browser → http://example.com
4. Rows should appear in Lenswire.

Notes:
- Prefer "Send test request" in the app for a reliable smoke test.
- HTTPS MITM is MVP-limited (CONNECT captured, not decrypted).
- VPN session is UX/permission only; TUN packet rewrite (tun2socks) is a follow-up.
EOF
}

cmd_trust_ca() {
  cat <<EOF
Android CA install

In-app (preferred):
  Certificate → Generate CA → Install CA
  Complete the system "Install certificate" dialog.

Prefer the in-app Install CA flow. The Dev CA PEM lives in the app filesDir
after Generate CA (not in the repo .lenswire/ folder used by iOS Simulator).

User CAs are ignored by many apps on Android 7+ (same limitation as Proxyman
without a rooted system store).
EOF
}

main() {
  case "${1:-}" in
    emu-proxy-hint) cmd_emu_proxy ;;
    trust-ca-hint) cmd_trust_ca ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
