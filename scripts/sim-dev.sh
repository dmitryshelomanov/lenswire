#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA_DIR="$ROOT/.lenswire"
CA_PEM="$CA_DIR/ca.pem"
CA_KEY="$CA_DIR/ca.key"
BUNDLE_ID="${LENSWIRE_BUNDLE_ID:-com.lenswire.app}"
PORT="${LENSWIRE_PROXY_PORT:-9090}"

ensure_ca() {
  mkdir -p "$CA_DIR"
  if [[ ! -f "$CA_PEM" ]]; then
    echo "Generating Lenswire Dev CA in $CA_DIR"
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$CA_KEY" \
      -out "$CA_PEM" \
      -days 3650 \
      -subj "/CN=Lenswire Dev CA/O=Lenswire/C=US"
  fi
}

cmd_trust() {
  if ! xcrun simctl list devices booted | grep -q Booted; then
    echo "No booted Simulator. Run: npm run ios" >&2
    exit 1
  fi

  local pem=""
  if DATA_PATH="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data 2>/dev/null)"; then
    if [[ -f "$DATA_PATH/Documents/lenswire-ca.pem" ]]; then
      pem="$DATA_PATH/Documents/lenswire-ca.pem"
    fi
  fi

  # App Group shared container (preferred for MITM key material sync).
  if [[ -z "$pem" ]]; then
    if GROUP_PATH="$(xcrun simctl get_app_container booted "$BUNDLE_ID" group.com.lenswire.app 2>/dev/null)"; then
      if [[ -f "$GROUP_PATH/lenswire-ca.pem" ]]; then
        pem="$GROUP_PATH/lenswire-ca.pem"
      fi
    fi
  fi

  if [[ -z "$pem" ]]; then
    echo "No on-device CA found in the Simulator app container." >&2
    echo "In Lenswire: Certificate → Generate CA, then re-run: npm run sim:trust-ca" >&2
    exit 1
  fi

  echo "Installing root CA into booted Simulator keychain:"
  echo "  $pem"
  xcrun simctl keychain booted add-root-cert "$pem"

  # Keep repo .lenswire copy in sync for convenience.
  mkdir -p "$CA_DIR"
  cp "$pem" "$CA_PEM"

  echo "Done. In Simulator: Settings → General → About → Certificate Trust Settings → enable Lenswire CA if shown."
  echo "Note: HTTPS MITM needs the same CA the app generated (this script installs that PEM)."
}

primary_network_service() {
  # Prefer Wi-Fi / Ethernet when present.
  local services
  services="$(networksetup -listallnetworkservices | tail -n +2)"
  if echo "$services" | grep -qx "Wi-Fi"; then
    echo "Wi-Fi"
    return
  fi
  if echo "$services" | grep -qx "Ethernet"; then
    echo "Ethernet"
    return
  fi
  echo "$services" | head -n 1
}

cmd_proxy_on() {
  local service
  service="$(primary_network_service)"
  if [[ -z "$service" ]]; then
    echo "Could not detect a network service." >&2
    exit 1
  fi
  echo "Enabling HTTP(S) proxy on '$service' → 127.0.0.1:$PORT"
  networksetup -setwebproxy "$service" 127.0.0.1 "$PORT"
  networksetup -setsecurewebproxy "$service" 127.0.0.1 "$PORT"
  networksetup -setwebproxystate "$service" on
  networksetup -setsecurewebproxystate "$service" on
  echo "Mac proxy on. Start Lenswire on Simulator, then open http://example.com in Simulator Safari."
  echo "Remember: npm run sim:mac-proxy-off when finished."
}

cmd_proxy_off() {
  local service
  service="$(primary_network_service)"
  if [[ -z "$service" ]]; then
    echo "Could not detect a network service." >&2
    exit 1
  fi
  echo "Disabling HTTP(S) proxy on '$service'"
  networksetup -setwebproxystate "$service" off
  networksetup -setsecurewebproxystate "$service" off
  echo "Mac proxy off."
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <trust-ca|mac-proxy-on|mac-proxy-off>
EOF
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    trust-ca) cmd_trust ;;
    mac-proxy-on) cmd_proxy_on ;;
    mac-proxy-off) cmd_proxy_off ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
