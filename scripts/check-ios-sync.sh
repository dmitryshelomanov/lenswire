#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 - <<'PY'
from pathlib import Path
import re
import sys

pairs = [
    (
        "modules/lenswire-proxy/ios/LocalProxyServer.swift",
        "targets/network-packet-tunnel/LocalProxyServer.swift",
    ),
    (
        "modules/lenswire-proxy/ios/LenswireShared.swift",
        "targets/network-packet-tunnel/LenswireShared.swift",
    ),
    (
        "modules/lenswire-proxy/ios/TLSBridge.swift",
        "targets/network-packet-tunnel/TLSBridge.swift",
    ),
    (
        "modules/lenswire-proxy/ios/CertificateAuthority.swift",
        "targets/network-packet-tunnel/CertificateAuthority.swift",
    ),
    (
        "modules/lenswire-proxy/ios/TlsSni.swift",
        "targets/network-packet-tunnel/TlsSni.swift",
    ),
    (
        "modules/lenswire-proxy/ios/X509.swift",
        "targets/network-packet-tunnel/X509.swift",
    ),
]


def normalize(content: str) -> str:
    out = content.replace("\r\n", "\n")
    out = re.sub(r"^// Keep in sync with .*$", "// Keep in sync with <peer>", out, flags=re.MULTILINE)
    return out


errors = []
for left_rel, right_rel in pairs:
    left = Path(left_rel)
    right = Path(right_rel)
    if not left.is_file() or not right.is_file():
        errors.append(f"Missing sync file(s): {left_rel} <-> {right_rel}")
        continue
    left_text = normalize(left.read_text(encoding="utf-8"))
    right_text = normalize(right.read_text(encoding="utf-8"))
    if left_text != right_text:
        errors.append(f"Out of sync: {left_rel} <-> {right_rel}")

if errors:
    print("iOS sync check failed:")
    for err in errors:
        print(f"- {err}")
    print("Run a diff and sync mirrored files before merge.")
    sys.exit(1)

print("iOS sync check passed.")
PY
