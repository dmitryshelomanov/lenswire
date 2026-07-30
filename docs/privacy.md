# Privacy Policy — Lenswire

**Last updated:** 2026-07-30

**Live page:** https://dmitryshelomanov.github.io/lenswire/privacy/

Source of truth for the public page lives in [`website/app/privacy/page.tsx`](../website/app/privacy/page.tsx).

---

Lenswire (“the App”) is a local HTTP(S) inspector for iOS and Android. This policy describes how Lenswire handles information.

## Who we are

Lenswire is developed by Dmitry Shelomanov.

- Email: dmitryshelomanov@mail.ru
- Website: https://dmitryshelomanov.github.io/
- App site: https://dmitryshelomanov.github.io/lenswire/
- Repository: https://github.com/dmitryshelomanov/lenswire

## Data we process

Lenswire does **not** collect, sell, or transmit personal data to our servers. There is no Lenswire backend and no third-party analytics in the App.

### Network traffic

When you start the local VPN / proxy, the App intercepts network traffic on your device so you can inspect it. Captured requests and responses are stored locally on your device only.

### Certificates

HTTPS decryption uses a locally generated Lenswire CA that you install on the device. Certificate material stays on your device.

### Local settings

Preferences (listen host/port, HTTPS decryption, override rules) are stored locally and are not synced to Lenswire servers.

### Export / share

Copy as cURL, Share HAR, and similar actions leave the device only when you explicitly share them.

## Permissions

Depending on the platform, Lenswire may request VPN configuration, notifications (Android FGS), and network access.

## Children’s privacy

Lenswire is not directed at children under 13.

## Contact

Questions about privacy: **dmitryshelomanov@mail.ru**
