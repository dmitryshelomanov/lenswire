# Play Console setup — Lenswire (Android)

Package name: `com.lenswire.app`  
EAS project: https://expo.dev/accounts/dshelomanovs-team/projects/lenswire  
Production submit track in `eas.json`: `internal` (change to `production` for public rollout)

## Local EAS builds (preferred — cloud is slow)

```bash
nvm use && npm install

# Preview APK (sideload / smoke)
npm run build:android:preview:local

# Production AAB (Play upload)
npm run build:android:local
```

| Artifact                       | Typical path                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Preview APK (sideload / smoke) | `dist/android/lenswire-preview-1.0.0.apk` (also `build-*.apk` in repo root)    |
| Production AAB (Play upload)   | `dist/android/lenswire-production-1.0.0.aab` (also `build-*.aab` in repo root) |

EAS project: https://expo.dev/accounts/dshelomanovs-team/projects/lenswire

Install preview:

```bash
adb install -r dist/android/lenswire-preview-1.0.0.apk
```

Cloud builds (optional fallback):

```bash
npm run build:android:preview   # APK on Expo servers
npm run build:android           # AAB on Expo servers
```

## 1. Create the app (manual, once)

1. Open [Google Play Console](https://play.google.com/console) with a verified developer account.
2. **Create app** → name **Lenswire**, language English, app type **App**, free.
3. Accept declarations as applicable.
4. Under **Test and release → Testing → Internal testing**, create a release.
5. Upload the production AAB from a local (or cloud) EAS build.
6. Add yourself (and testers) to the internal testing email list → **Save and publish** the release.

First upload for a **new** app must be manual. After that, automate with EAS Submit.

## 2. Service account for `eas submit` (subsequent uploads)

1. In Google Cloud Console, create (or reuse) a project linked to Play Console.
2. Create a service account with access to the Play Android Developer API.
3. In Play Console → **Users and permissions**, invite the service account email with release permissions.
4. Download the JSON key (keep it **out of git**).
5. Configure EAS:

```bash
npm run submit:android
# When prompted, upload the Google Service Account key
```
