# Security

Lenswire is a local HTTP(S) inspector (MITM with a user-installed CA). Do not use it to intercept traffic without consent.

## Reporting a vulnerability

Please **do not** open a public issue for sensitive reports.

Prefer one of:

1. [GitHub Security Advisories](https://github.com/dmitryshelomanov/lenswire/security/advisories/new) (private disclosure)
2. Email the maintainer: **dmitryshelomanov@mail.ru** (same contact as in-app feedback / `package.json`)

Include impact, affected platforms (iOS/Android), and steps to reproduce if possible. You should get an acknowledgment when the report is seen; timing depends on maintainer availability.

## Scope notes

- Loopback-only listeners and user-controlled CA install are intentional product behavior.
- Certificate pinning bypass is out of scope for Lenswire itself.
