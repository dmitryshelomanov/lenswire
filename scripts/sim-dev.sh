#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA_DIR="$ROOT/.lenswire"
CA_PEM="$CA_DIR/ca.pem"
BUNDLE_ID="${LENSWIRE_BUNDLE_ID:-com.lenswire.app}"

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

usage() {
  cat <<EOF
Usage: $(basename "$0") trust-ca
EOF
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    trust-ca) cmd_trust ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
