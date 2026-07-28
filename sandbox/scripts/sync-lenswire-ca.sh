#!/usr/bin/env bash
# Pull the current Lenswire CA from the device app sandbox into this sandbox project
# so network_security_config can trust it via @raw/lenswire_ca (no User/System store needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="${LENSWIRE_ANDROID_PACKAGE:-com.lenswire.app}"
OUT_DIR="$ROOT/plugins/raw"
OUT_PEM="$OUT_DIR/lenswire_ca.pem"
OUT_CER="$OUT_DIR/lenswire_ca.cer"

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need adb
need openssl

echo "Waiting for adb device..."
adb wait-for-device

mkdir -p "$OUT_DIR"
TMP="$(mktemp)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "Exporting CA from $PACKAGE (files/certs/lenswire-ca.cer)..."
if adb exec-out run-as "$PACKAGE" cat files/certs/lenswire-ca.cer >"$TMP" 2>/dev/null && [[ -s "$TMP" ]]; then
  :
elif adb exec-out "test -f /sdcard/Download/lenswire-ca.cer && cat /sdcard/Download/lenswire-ca.cer" >"$TMP" 2>/dev/null && [[ -s "$TMP" ]]; then
  echo "Using /sdcard/Download/lenswire-ca.cer"
else
  die "CA not found. In Lenswire: Certificate → Generate CA, then re-run: npm run sync:ca"
fi

# Keep DER for tooling, but NSC prefers PEM in res/raw.
cp "$TMP" "$OUT_CER"
openssl x509 -in "$TMP" -inform DER -out "$OUT_PEM" -outform PEM

echo "Wrote $OUT_PEM ($(wc -c <"$OUT_PEM" | tr -d ' ') bytes PEM)"
echo "Wrote $OUT_CER ($(wc -c <"$OUT_CER" | tr -d ' ') bytes DER)"
openssl x509 -in "$OUT_PEM" -noout -fingerprint -sha256
echo "Next: npm run prebuild:android && npm run build:apk"
