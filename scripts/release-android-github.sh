#!/usr/bin/env bash
# Upload a local preview APK to a GitHub Release (create or replace asset).
# Does not build — run `npm run build:android:preview:local` first.
#
# Usage:
#   npm run release:android:github
#   bash scripts/release-android-github.sh [tag] [apk-path]
#
# Defaults:
#   tag  = v$(version from package.json)
#   apk  = newest dist/android/lenswire-preview-*.apk, else newest build-*.apk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

die() {
  echo "error: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need gh
need node

# SSH keys authenticate git@github.com, not the GitHub API that `gh release` uses.
if ! gh auth status >/dev/null 2>&1; then
  die "gh is not logged in (SSH key alone is not enough). Run: gh auth login
  Prefer: GitHub.com → HTTPS → Login with a web browser
  (optional) set git protocol to SSH afterward)"
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="${1:-v${VERSION}}"

find_apk() {
  local candidates=()
  shopt -s nullglob
  candidates+=(dist/android/lenswire-preview-*.apk)
  if ((${#candidates[@]} == 0)); then
    candidates+=(build-*.apk)
  fi
  shopt -u nullglob

  if ((${#candidates[@]} == 0)); then
    return 1
  fi

  # Newest by mtime
  ls -t "${candidates[@]}" | head -n 1
}

if [[ $# -ge 2 ]]; then
  APK="$2"
else
  APK="$(find_apk)" || die "no preview APK found. Run: npm run build:android:preview:local"
fi

[[ -f "$APK" ]] || die "APK not found: $APK"

ASSET_NAME="$(basename "$APK")"
TITLE="Lenswire ${TAG} (Android preview)"
NOTES="$(
  cat <<EOF
Sideload **preview** APK for Android (not a Play Store build).

\`\`\`bash
adb install -r ${ASSET_NAME}
\`\`\`

Build & publish docs: [README](https://github.com/dmitryshelomanov/lenswire#android--google-play)
EOF
)"

echo "Uploading ${APK} → GitHub Release ${TAG}"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release ${TAG} exists — uploading asset (clobber if same name)..."
  gh release upload "$TAG" "$APK" --clobber
else
  echo "Creating release ${TAG}..."
  gh release create "$TAG" "$APK" --title "$TITLE" --notes "$NOTES"
fi

echo "Done: $(gh release view "$TAG" --json url -q .url)"
