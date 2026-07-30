#!/usr/bin/env bash
# Install Lenswire CA into the Android system trust store (rooted emulator / AVD without Google Play).
# Chrome and most apps ignore User CAs on Android 7+ — System CA is required for HTTPS decrypt.
#
# Android 14+ (API 34+): real trust store is /apex/com.android.conscrypt/cacerts (immutable APEX).
# Writing only to /system/etc/security/cacerts is ignored by Chrome — bind-mount + nsenter is required.
set -euo pipefail

PACKAGE="${LENSWIRE_ANDROID_PACKAGE:-com.lenswire.app}"
WORKDIR="${TMPDIR:-/tmp}/lenswire-android-ca-$$"
SYSTEM_CACERTS="/system/etc/security/cacerts"
APEX_CACERTS="/apex/com.android.conscrypt/cacerts"

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
echo "Fingerprint: $(openssl x509 -inform PEM -in "$PEM" -noout -fingerprint -sha256 | sed 's/^sha256 Fingerprint=//')"

cp "$PEM" "$WORKDIR/$DEST_NAME"
adb push "$WORKDIR/$DEST_NAME" "/data/local/tmp/$DEST_NAME" >/dev/null

USES_APEX=0
if adb shell "test -d $APEX_CACERTS" >/dev/null 2>&1; then
  USES_APEX=1
fi

# Remount system writable (best-effort; often fails on modern images).
echo "Remounting system read-write..."
adb remount >/dev/null 2>&1 || true
adb shell "mount -o rw,remount /system" >/dev/null 2>&1 || true
adb shell "mount -o rw,remount /" >/dev/null 2>&1 || true

install_via_direct_copy() {
  adb shell "cp /data/local/tmp/$DEST_NAME $SYSTEM_CACERTS/$DEST_NAME && chmod 644 $SYSTEM_CACERTS/$DEST_NAME && chown root:root $SYSTEM_CACERTS/$DEST_NAME" >/dev/null 2>&1
}

# Build a writable cacerts dir at $SYSTEM_CACERTS (tmpfs) containing stock CAs + Lenswire CA.
# Prefer APEX contents as the source of truth on Android 14+.
prepare_tmpfs_cacerts() {
  local stock_src="$SYSTEM_CACERTS"
  if [[ "$USES_APEX" -eq 1 ]]; then
    stock_src="$APEX_CACERTS"
  fi

  # If we already overlaid system cacerts earlier, unmount so we can rebuild from APEX.
  adb shell "mountpoint -q $SYSTEM_CACERTS && umount $SYSTEM_CACERTS" >/dev/null 2>&1 || true

  adb shell "rm -rf /data/local/tmp/lenswire-cacerts /data/local/tmp/tmp-ca-copy && mkdir -p /data/local/tmp/tmp-ca-copy /data/local/tmp/lenswire-cacerts"
  adb shell "cp -a $stock_src/. /data/local/tmp/tmp-ca-copy/" || die "failed to copy stock CAs from $stock_src"
  adb shell "mount -t tmpfs tmpfs $SYSTEM_CACERTS" || die "failed to mount tmpfs on $SYSTEM_CACERTS"
  # Stock APEX certs use system_security_cacerts_file; wrong label → Chrome rejects MITM
  # with SSLV3_ALERT_CERTIFICATE_UNKNOWN even when the .0 file is visible in the namespace.
  adb shell "cp -a /data/local/tmp/tmp-ca-copy/. $SYSTEM_CACERTS/ && cp /data/local/tmp/$DEST_NAME $SYSTEM_CACERTS/$DEST_NAME && chown root:root $SYSTEM_CACERTS/* && chmod 644 $SYSTEM_CACERTS/* && chcon u:object_r:system_security_cacerts_file:s0 $SYSTEM_CACERTS/* 2>/dev/null || chcon u:object_r:system_file:s0 $SYSTEM_CACERTS/* 2>/dev/null || true"
  adb shell "rm -rf /data/local/tmp/tmp-ca-copy /data/local/tmp/$DEST_NAME"
}

# Android 14+: bind-mount into Zygote + key processes (HTTP Toolkit approach).
# Full ps-sweep hangs on some emulators; zygote inheritance covers newly started apps.
inject_apex_bind_mounts() {
  echo "Android 14+ detected: injecting bind-mount into Zygote and key processes..."
  # shellcheck disable=SC2016
  adb shell "inject() {
      # pidof can return multiple PIDs — use the first only.
      pid=\$(echo \"\$1\" | awk '{print \$1}')
      name=\"\$2\"
      [ -n \"\$pid\" ] || return 0
      echo \"  \$name pid=\$pid\"
      timeout 3 nsenter --mount=/proc/\$pid/ns/mnt -- \
        /bin/mount --bind $SYSTEM_CACERTS $APEX_CACERTS 2>/dev/null || true
    }
    inject \"\$(pidof zygote || true)\" zygote
    inject \"\$(pidof zygote64 || true)\" zygote64
    inject \"\$(pidof system_server || true)\" system_server
    inject \"\$(pidof $PACKAGE || true)\" $PACKAGE
    inject \"\$(pidof com.android.chrome || true)\" chrome
    inject \"\$(pidof com.android.webview || true)\" webview
    # Confirm zygote sees the CA (new apps inherit this mount).
    Z=\$(pidof zygote64 | awk '{print \$1}')
    [ -n \"\$Z\" ] || Z=\$(pidof zygote | awk '{print \$1}')
    if [ -n \"\$Z\" ] && timeout 3 nsenter --mount=/proc/\$Z/ns/mnt -- test -f $APEX_CACERTS/$DEST_NAME; then
      echo \"  OK: CA visible in zygote namespace\"
    else
      echo \"  warn: could not confirm CA in zygote namespace\" >&2
    fi
  " || die "APEX bind-mount injection failed. Try an older AVD (API 28–33) without Google Play."
}

PERSISTED=0
if [[ "$USES_APEX" -eq 0 ]] && install_via_direct_copy; then
  echo "Installed into read-write system cacerts."
  echo "Rebooting emulator (required for trust store reload)..."
  adb reboot
  adb wait-for-device
  adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done' >/dev/null 2>&1 || sleep 15
  if adb shell "test -f $SYSTEM_CACERTS/$DEST_NAME" >/dev/null 2>&1; then
    PERSISTED=1
  else
    die "CA was not persisted after reboot on this image. Use an AVD without Google Play (API 28-30 recommended) or launch emulator with writable system partition."
  fi
else
  if [[ "$USES_APEX" -eq 1 ]]; then
    echo "APEX trust store present ($APEX_CACERTS). Building tmpfs + bind-mount overlay..."
  else
    echo "System store is read-only. Using tmpfs overlay fallback..."
  fi
  prepare_tmpfs_cacerts
  if [[ "$USES_APEX" -eq 1 ]]; then
    inject_apex_bind_mounts
  fi
  echo "Installed via tmpfs overlay (effective immediately, but reset after emulator reboot)."
fi

# Verify CA is visible where apps actually look.
echo
echo "Verifying..."
if [[ "$USES_APEX" -eq 1 ]]; then
  if adb shell "test -f $APEX_CACERTS/$DEST_NAME" >/dev/null 2>&1; then
    echo "OK: $APEX_CACERTS/$DEST_NAME visible in current adbd namespace"
  else
    echo "warn: CA not visible under APEX path in adbd namespace (apps may still see it via nsenter)"
  fi
fi
if adb shell "test -f $SYSTEM_CACERTS/$DEST_NAME" >/dev/null 2>&1; then
  echo "OK: $SYSTEM_CACERTS/$DEST_NAME present"
else
  die "CA missing from $SYSTEM_CACERTS after install"
fi

# Force-stop Chrome so it restarts with the new mount if it was already running.
adb shell "am force-stop com.android.chrome" >/dev/null 2>&1 || true
adb shell "am force-stop com.chrome.beta" >/dev/null 2>&1 || true
adb shell "am force-stop com.google.android.apps.chrome" >/dev/null 2>&1 || true
# Chrome's app zygote can survive force-stop and keep a stale trust view.
adb shell "kill -9 \$(pidof com.android.chrome_zygote) 2>/dev/null || true" >/dev/null 2>&1 || true

# Chrome treats System CAs as "public" and requires Certificate Transparency for MITM
# leaves → CERTIFICATE_UNKNOWN. Bypass via SPKI allowlist (HTTP Toolkit / Magisk approach).
SPKI="$(openssl x509 -in "$PEM" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64)"
echo "Chrome SPKI allowlist: $SPKI"
adb shell "settings put global debug_app com.android.chrome" >/dev/null 2>&1 || true
adb shell "printf 'chrome --ignore-certificate-errors-spki-list=%s\n' '$SPKI' > /data/local/tmp/chrome-command-line"
adb shell "printf 'chrome --ignore-certificate-errors-spki-list=%s\n' '$SPKI' > /data/local/chrome-command-line"
adb shell "chmod 644 /data/local/tmp/chrome-command-line /data/local/chrome-command-line" >/dev/null 2>&1 || true

echo
echo "Done. Verify:"
echo "  Settings → Security → Encryption & credentials → Trusted credentials → System → Lenswire CA"
echo "  (On Android 14+ the Settings UI may lag; trust still works for Chrome after force-stop.)"
echo "Then in Lenswire: Stop VPN (clears bypass) → Start → open Chrome → https://example.com"
echo "Expect decrypted GET/POST (not CONNECT + trust?/bypassed)."
echo
echo "If the CA is only under User (not System), most apps stay tunnel-only; Chrome needs the SPKI flag above when System CA is installed."
if [[ "$PERSISTED" -eq 0 ]]; then
  echo "Note: overlay + Chrome flags are non-persistent — run this script again after each emulator reboot."
fi
