#!/usr/bin/env bash
# Install Lenswire CA into the Android system trust store (rooted emulator / AVD without Google Play).
# Chrome and most apps ignore User CAs on Android 7+ — System CA is required for HTTPS decrypt.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="${LENSWIRE_ANDROID_PACKAGE:-com.lenswire.app}"
WORKDIR="${TMPDIR:-/tmp}/lenswire-android-ca-$$"

cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

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

echo "Restarting adbd as root (requires AVD without Google Play / rooted image)..."
if ! adb root >/dev/null 2>&1; then
  die "adb root failed. Use an Android Emulator system image WITHOUT Google Play (Google APIs / AOSP), or a rooted device."
fi
adb wait-for-device
sleep 1

mkdir -p "$WORKDIR"
CER_SRC="$WORKDIR/lenswire-ca.cer"
PEM="$WORKDIR/lenswire-ca.pem"

echo "Exporting CA from app sandbox ($PACKAGE)..."
if ! adb exec-out run-as "$PACKAGE" cat files/certs/lenswire-ca.cer >"$CER_SRC" 2>/dev/null; then
  # Fallback: pull via external export if user pushed to /sdcard
  if adb exec-out "test -f /sdcard/Download/lenswire-ca.cer && cat /sdcard/Download/lenswire-ca.cer" >"$CER_SRC" 2>/dev/null; then
    echo "Using /sdcard/Download/lenswire-ca.cer"
  else
    die "CA not found. In Lenswire: Certificate → Generate CA, then re-run this script."
  fi
fi

# Normalize to PEM for hash + system store install payload.
if grep -q "BEGIN CERTIFICATE" "$CER_SRC" 2>/dev/null; then
  cp "$CER_SRC" "$PEM"
else
  openssl x509 -inform DER -in "$CER_SRC" -out "$PEM"
fi

HASH="$(openssl x509 -inform PEM -in "$PEM" -subject_hash_old 2>/dev/null | head -n1)"
[[ -n "$HASH" ]] || die "could not compute subject_hash_old"
DEST_NAME="${HASH}.0"
echo "CA hash: $DEST_NAME"

# Remount system writable.
echo "Remounting system read-write..."
adb remount >/dev/null 2>&1 || true
if ! adb shell "mount -o rw,remount /system" >/dev/null 2>&1; then
  adb shell "mount -o rw,remount /" >/dev/null 2>&1 || true
fi

CACERTS="/system/etc/security/cacerts"
if ! adb shell "test -d $CACERTS" >/dev/null 2>&1; then
  # Some newer images use APEX; try common fallbacks.
  if adb shell "test -d /system/etc/security/cacerts_google" >/dev/null 2>&1; then
    CACERTS="/system/etc/security/cacerts_google"
  else
    die "system cacerts directory not found. This image may use a read-only APEX trust store; try an older API (28–30) AVD without Google Play."
  fi
fi

echo "Pushing to $CACERTS/$DEST_NAME ..."
cp "$PEM" "$WORKDIR/$DEST_NAME"
adb push "$WORKDIR/$DEST_NAME" "/data/local/tmp/$DEST_NAME" >/dev/null
if adb shell "cp /data/local/tmp/$DEST_NAME $CACERTS/$DEST_NAME && chmod 644 $CACERTS/$DEST_NAME && chown root:root $CACERTS/$DEST_NAME && rm /data/local/tmp/$DEST_NAME" >/dev/null 2>&1; then
  echo "Installed into read-write system cacerts."
  echo "Rebooting emulator (required for trust store reload)..."
  adb reboot
  echo "Waiting for device after reboot..."
  adb wait-for-device
  # Wait until package manager is up enough for interactive use.
  adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done' >/dev/null 2>&1 || sleep 15
  if ! adb shell "test -f $CACERTS/$DEST_NAME" >/dev/null 2>&1; then
    die "CA was not persisted after reboot on this image. Use an AVD without Google Play (API 28-30 recommended) or launch emulator with writable system partition."
  fi
else
  echo "System store is read-only on this image. Using tmpfs overlay fallback..."
  if ! adb shell "mkdir -p /data/local/tmp/lenswire-cacerts && cp -a $CACERTS/. /data/local/tmp/lenswire-cacerts/ && mount -t tmpfs tmpfs $CACERTS && cp -a /data/local/tmp/lenswire-cacerts/. $CACERTS/ && cp /data/local/tmp/$DEST_NAME $CACERTS/$DEST_NAME && chmod 644 $CACERTS/$DEST_NAME && chown root:root $CACERTS/$DEST_NAME && rm /data/local/tmp/$DEST_NAME"; then
    die "tmpfs fallback failed on this image. Use an AVD without Google Play (API 28-30 recommended) or launch emulator with writable system partition."
  fi
  echo "Installed via tmpfs overlay (effective immediately, but reset after emulator reboot)."
fi

echo
echo "Done. Verify:"
echo "  Settings → Security → Encryption & credentials → Trusted credentials → System → Lenswire CA"
echo "Then in Lenswire: Start capture with HTTPS decryption ON, open https://example.com"
echo
echo "If the CA is only under User (not System), Chrome will keep showing certificate warnings."
echo "Note: tmpfs overlay fallback is non-persistent — run this script again after each emulator reboot."
