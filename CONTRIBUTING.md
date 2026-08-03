# Contributing

Thanks for helping with Lenswire. Keep PRs short and focused; match existing style. Do not invent features in docs or code beyond what the app already does.

## Prerequisites

- Node **22.13+** (see [`.nvmrc`](.nvmrc)); Expo SDK **57**
- Mac + Xcode 16+ for iOS; Android Studio / SDK for Android
- **iOS Simulator** can run the UI only — Packet Tunnel / full capture does **not** work (`IPC failed`). Use a physical iPhone.
- **iOS device VPN** needs Apple Developer Program (Network Extension) + real `appleTeamId`
- **Android** needs no paid account (`VpnService`)

More detail: root [`README.md`](README.md), [`modules/lenswire-proxy/ios/README.md`](modules/lenswire-proxy/ios/README.md), [`modules/lenswire-proxy/android/README.md`](modules/lenswire-proxy/android/README.md).

## Setup

```bash
nvm use
npm install
```

### iOS

First time / after native tunnel or vendor changes:

```bash
npm run prebuild:ios   # expo prebuild --clean + link-hev-ios
npx expo run:ios --device
```

Day-to-day (Simulator UI only):

```bash
npm run ios
```

Notes:

- `prebuild:ios` runs `expo prebuild -p ios --clean` then links `vendor/HevSocks5Tunnel.xcframework` into the Packet Tunnel target. If you prebuild another way, run `npm run link:hev-ios` afterward.
- Full capture: paid team + Network Extension entitlement + physical device.
- After editing shared MITM Swift sources, keep module and tunnel copies in sync: `npm run check:ios-sync`.

### Android

First time / after native Android module changes:

```bash
npm run prebuild:android
npm run android
```

Day-to-day:

```bash
npm run android
```

CA trust (Chrome / most apps on Android 7+ ignore **User** CAs):

- **Install CA** alone → User store — enough for apps that trust User CAs (e.g. [`sandbox/`](sandbox/)), not Chrome.
- Chrome decrypt on a rooted AVD (system image **without** Google Play): Generate CA → `npm run android:trust-ca` (System CA / Conscrypt overlay on Android 14+).
- Temporary workaround without System CA: HTTPS decryption **OFF** → Stop/Start (sites load; no decrypt).

## Tests & lint

Same checks as CI (`.github/workflows/ci.yml`):

```bash
npm run test:lint      # expo lint
npm run test:tsc       # tsc --noEmit
npm run format:check   # prettier
npm test               # check:ios-sync + vitest
```

Optional: `npm run format` to fix formatting. Android native unit tests (after `prebuild:android`): from `android/`, `./gradlew :lenswire-proxy:testDebugUnitTest`.

## Pull requests

- One concern per PR; prefer small diffs over large refactors.
- Describe what changed and how you verified (Simulator UI, device tunnel, Android emulator, etc.).
- Run lint / typecheck / tests above before opening the PR.
- If you touch mirrored iOS MITM sources, ensure `npm run check:ios-sync` passes.
