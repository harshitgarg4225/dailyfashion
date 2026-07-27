# Shipping Daily Fashion

Three artefacts, one codebase: the web app, the Android APK, and the iOS build.
All three are the same `dist/` bundle — Capacitor wraps it, it is not rewritten.

---

## 1. The web app

Railway builds from the default branch and runs `server.js`. Nothing else is
needed; a push deploys.

The download page is served at `/download` from `public/download.html`. It is
plain HTML with one stylesheet and no JavaScript, so it is not part of the Vite
build and does not need one.

### Pointing your own domain at it

1. Railway → project **Dailyfashion** → service **dailyfashion-web** →
   *Settings* → *Networking* → **Custom Domain**.
2. Enter the domain (and `www.` as a second domain if you want both).
3. Railway shows a `CNAME` target. Add it at your registrar:

   | Type    | Name  | Value                          |
   | ------- | ----- | ------------------------------ |
   | `CNAME` | `www` | *(the target Railway shows)*   |
   | `ALIAS` | `@`   | *(the same target)*            |

   A bare apex domain needs `ALIAS`/`ANAME`/flattened-`CNAME` support.
   Cloudflare, Namecheap and Google Domains all have it. If yours does not, use
   `www` as the primary and redirect the apex at the registrar.
4. Certificates are issued automatically once DNS resolves. Give it ten minutes.

Nothing in the app hardcodes a hostname, so no code change is needed. The one
exception is the "Read the source" link in `public/download.html`.

---

## 2. The Android APK

`.github/workflows/apk.yml` builds it on every push and publishes it to the
`beta` release, which is what `/download` links to.

### The signing key — do this once

The APK is sideloaded, so its signature is the only thing tying one build to
the next: **Android refuses to update an installed app with a build signed by a
different key**. A throwaway key per build would mean every user has to
uninstall and lose their log to get an update, so the workflow refuses to
publish an unsigned APK rather than shipping that trap.

Generate a key and keep it somewhere you will still have in three years:

```sh
keytool -genkeypair -v \
  -keystore daily-fashion-release.keystore \
  -alias dailyfashion \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Daily Fashion, O=Daily Fashion, C=IN"
```

It will ask for a password twice. Then add four repository secrets
(*Settings → Secrets and variables → Actions → New repository secret*):

| Secret                      | Value                                             |
| --------------------------- | ------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 daily-fashion-release.keystore`        |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose                             |
| `ANDROID_KEY_ALIAS`         | `dailyfashion`                                     |
| `ANDROID_KEY_PASSWORD`      | the same password, unless you set a separate one   |

Or from the CLI:

```sh
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 daily-fashion-release.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body dailyfashion
gh secret set ANDROID_KEY_PASSWORD
```

Re-run the workflow and the `beta` release appears with `daily-fashion.apk`
attached, along with its SHA-256 so anyone can verify what they downloaded.

**Back the keystore up.** Losing it means the next version cannot update any
installed copy, and every existing user has to uninstall — which deletes their
log, because the log only lives on their phone.

### Building one locally

Needs an Android SDK. Create `android/keystore.properties` (untracked):

```properties
storeFile=/absolute/path/to/daily-fashion-release.keystore
storePassword=…
keyAlias=dailyfashion
keyPassword=…
```

Then:

```sh
npm run sync
cd android && ./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release.apk
```

Without that file the release build comes out unsigned rather than falling back
to the debug key — deliberately. A debug-signed build is `debuggable`, and a
debuggable build of an app whose entire claim is "nothing leaves this phone"
hands its contents to anything that can reach `adb`.

### Version numbers

`android/app/build.gradle` holds `versionCode` and `versionName`. **Bump
`versionCode` for every published build** — Android refuses to install an APK
whose `versionCode` is not higher than the installed one.

---

## 3. iOS

Needs a Mac with Xcode; there is no CI path for it.

```sh
npm run ios          # opens ios/App/App.xcworkspace
```

Set the team under *Signing & Capabilities*, then *Product → Archive*.
`Info.plist` already carries the camera and photo-library usage strings and
`ITSAppUsesNonExemptEncryption=false`, so App Store Connect will not stop to ask.

Ahead of a submission, the two answers reviewers ask for:

- **Account required?** No. There is no account and no server.
- **Data collected?** None. Everything is on-device; the app makes no network
  request at all, which is enforced by the Content-Security-Policy it runs
  under rather than by policy.

---

## Before any release

```sh
npm test          # 136 unit tests: thresholds, the ban list, the worked example
npx playwright test   # 13 end-to-end, including "no cross-origin request"
```

The e2e suite fails the build if the app makes a single request off its own
origin. That check is the privacy claim, so a release that skips it is a release
that has stopped making the claim.
