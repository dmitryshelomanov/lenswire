# Lenswire Sandbox

Minimal Expo (React Native) Android app that trusts **User CAs** (`networkSecurityConfig`) and fires predictable HTTPS probes to [jsonplaceholder](https://jsonplaceholder.typicode.com).

Use it to verify:

1. Lenswire decrypts this app’s traffic after **Install CA** (no System CA / root AVD, no CA baked into the APK).
2. Future Lenswire **mocks**: response on screen ≠ Expected live → mock applied.

> Requires a custom native build (`expo run:android` / release APK). Expo Go cannot apply `networkSecurityConfig`.

## Why decrypt shows only CONNECT / TUNNEL

If Lenswire lists `CONNECT` with badges **`trust?`** or **`bypassed`** (not `GET`/`POST` with body):

- **`trust?`** (`mitm_handshake_failed`) — sandbox rejected the MITM leaf (CA not installed as User CA, or wrong CA after Generate).
- **`bypassed`** — after the first reject, that host stays in a session bypass list → only tunnels until VPN **Stop**.

Sandbox may still “work” (live API responses) because Lenswire fail-opens to passthrough. That is **not** decrypt.

### Fix checklist

1. Lenswire → **Stop** VPN (clears bypass) → Clear list.
2. Settings → HTTPS decryption **Enabled**.
3. Certificate → **Generate CA** (if needed) → **Install CA** (User store).
4. Start VPN → sandbox **GET post**.
5. Expect decrypted `GET …/posts/1` (not only `CONNECT`).

If you **Generate CA** again in Lenswire, **Install CA** again (User store must match the CA that signs MITM leaves).

## Trust config

[`plugins/network_security_config.xml`](plugins/network_security_config.xml):

```xml
<certificates src="system" />
<certificates src="user" />
```

## Run

### Dev (needs Metro)

```bash
cd sandbox
npm install
npm run prebuild:android
npm run android
```

Debug APK alone (without Metro) → white screen. Prefer release APK below for sideload.

### Standalone APK (no Metro)

```bash
cd sandbox
npm install
npm run prebuild:android   # first time / after native changes
npm run build:apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Capture check (with Lenswire)

1. Generate CA → **Install CA** (required).
2. HTTPS decryption ON → **Start** VPN.
3. Sandbox → **GET post**.
4. Lenswire should show decrypted `GET` to `jsonplaceholder.typicode.com/posts/1`.

## Mock check (when Lenswire mocks exist)

1. Mock `GET https://jsonplaceholder.typicode.com/posts/1` → custom JSON/status.
2. Sandbox → **GET post** again.
3. **Last response** ≠ **Expected live** → mock worked; match → mock miss / VPN / decrypt off.

### Probes

| Button      | Request         | Expected live (no mock)                                           |
| ----------- | --------------- | ----------------------------------------------------------------- |
| GET post    | `GET …/posts/1` | `200`, `userId: 1`, `id: 1`, title starts with _sunt aut facere…_ |
| GET todos   | `GET …/todos/1` | `200`, `title: "delectus aut autem"`, `completed: false`          |
| POST create | `POST …/posts`  | `201`, echoes body + `id: 101`                                    |

## Native plugin

[`plugins/with-user-ca.js`](plugins/with-user-ca.js) copies the NSC XML into the Android project and sets `android:networkSecurityConfig`.
