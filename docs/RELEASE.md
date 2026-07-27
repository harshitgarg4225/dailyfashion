# Shipping Daily Fashion

Three artefacts, one codebase: the web app, the Android APK, and the iOS build.
All three are the same `dist/` bundle — Capacitor wraps it, it is not rewritten.

---

## 1. The web app

Railway builds the branch and runs `server.js`.

### Deploy-on-push needs the GitHub App — do this once

Railway knows the repo but has no webhook from it, so **pushes do not deploy**
until the Railway GitHub App is installed on `harshitgarg4225/dailyfashion`.
Until then every deploy has to be triggered by hand from the Railway dashboard,
which is exactly how a fix sits finished-and-unshipped for an hour without
anybody noticing.

Install it at **railway.com → Account Settings → GitHub → Configure**, granting
access to this repository. Then in the service's *Settings → Source*, confirm
the branch is `claude/daily-fashion-mvp-u5vr20` and that automatic deploys are
on.

Two things that were wrong here and are worth checking if deploys go quiet
again: the service had no branch set at all, so Railway was watching a `main`
that does not exist in this repo; and `redeploy` rebuilds the *existing*
snapshot rather than fetching the branch head, so it will happily "succeed"
against an old commit.

The download page is served at `/download` from `public/download.html`. It is
plain HTML with one stylesheet and no JavaScript, so it is not part of the Vite
build and does not need one.

### dailyfashion.co

Both names are already registered against the service in Railway. What is left
is DNS at the registrar. **Each name has its own target** — they are not
interchangeable, and pointing both at one of them leaves the other permanently
unverified:

| Type              | Name  | Value                       |
| ----------------- | ----- | --------------------------- |
| `ALIAS` / `ANAME` | `@`   | `u2c4oq4w.up.railway.app`   |
| `CNAME`           | `www` | `n6l01q2m.up.railway.app`   |

Delete whatever is on those two names first. At the time of writing the domain
was parked — both names resolved to `13.248.243.5` and `76.223.105.230`, and
`www` was a `CNAME` to the apex — and a leftover parking record will keep
winning over the new one.

**The apex is the awkward one.** DNS does not allow a plain `CNAME` at the root
of a zone, so `@` needs a registrar that offers `ALIAS`, `ANAME` or
CNAME-flattening. Cloudflare (free), Namecheap and Porkbun all do. If yours does
not, the fallback is to make `www` the real host and use the registrar's
forwarding to send the apex there — or move the nameservers to Cloudflare, which
is usually less work than it sounds.

Certificates issue automatically once the records resolve; allow ten minutes,
longer if the old records had a high TTL.

Nothing in the app hardcodes a hostname, so no code change is needed for any of
this. The one URL that is written down is the "Read the source" link in
`public/download.html`, and it points at GitHub rather than at the site.

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
