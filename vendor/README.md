# Vendored native binaries

## HevSocks5Tunnel.xcframework

hev-socks5-tunnel (via [Tun2SocksKit](https://github.com/EbrahimTahernejad/Tun2SocksKit) release artifacts).

Used by the iOS Packet Tunnel (`Tun2SocksRuntime`) to convert `utun` packets into SOCKS5 toward `127.0.0.1:1080`.

Re-download:

```bash
curl -L -o /tmp/HevSocks5Tunnel.xcframework.zip \
  "https://github.com/EbrahimTahernejad/Tun2SocksKit/releases/download/5.16.0/HevSocks5Tunnel.xcframework.zip"
rm -rf vendor/HevSocks5Tunnel.xcframework
unzip -o /tmp/HevSocks5Tunnel.xcframework.zip -d vendor/
```
