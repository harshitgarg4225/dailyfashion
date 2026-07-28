# Android and iOS

The packaged builds are not a distribution convenience. They remove the two
limitations the web version could not solve, and both were the largest
remaining risks in the product.

## What packaging actually fixes

**The reminder fires.** On the web the evening nudge is a `setTimeout` inside a
page — it only works if the app was opened that day and the tab is still
resident, which means it fails precisely for the person who most needs it, the
one who forgot. Natively it is scheduled with the operating system, so it
arrives regardless, carries actions so a rating is genuinely two taps from the
lock screen, and survives a reboot. Loop completion is the one metric that
decides whether this product works; this is the change most likely to move it.

**Storage stops being evictable.** Browsers clear IndexedDB under storage
pressure, silently and without recourse. A packaged app's WebView storage is
not subject to those sweeps, so a year of history can no longer disappear
because the OS wanted space back. `navigator.storage.persist()` mitigated this
on the web; packaging removes it.

Secondary: real haptics on iOS (Safari ignores `navigator.vibrate` entirely, so
half the audience had no feedback at all), a launch that never flashes white,
and a store listing that has to declare data collection — where this app
declares none.

## Two decisions that would otherwise have broken the privacy promise

Both were defaults in the generated projects. Both are the kind of thing that
never surfaces in testing, because nothing looks wrong.

**Android: `allowBackup` was `true`.** That enrols the app in Android's
automatic cloud backup — every photograph and every entry copied to the user's
Google Drive, without them being asked. The central claim of the product would
have been false at the operating-system level on every device. It is now
`false`, with matching Android 12+ `data_extraction_rules` that exclude cloud
backup and device transfer, since from Android 12 those rules are what actually
govern it.

**iOS: the WebView's storage sits in `Library/`, which iCloud backs up.** Same
outcome — mirror selfies uploaded to Apple. `AppDelegate.swift` now sets
`isExcludedFromBackup` on the WebKit and Caches directories at launch.

The accepted cost on both platforms is that a restored or new phone starts
empty. That is what export and import in Settings are for, and a restore the
user deliberately performs is the honest version of this anyway.

## The INTERNET permission — verify this first

`android/app/src/main/AndroidManifest.xml` **omits**
`android.permission.INTERNET`. Without it the operating system makes network
access impossible for the app: the privacy claim stops being a policy and
becomes something the kernel enforces, and the Play Store listing shows the app
cannot reach the network at all. For a product whose whole argument is "nothing
leaves this phone", that is the strongest available version of the claim —
stronger than the CSP, because a user can verify it without trusting us.

**This has not been run on hardware.** Capacitor serves the bundle through
`WebViewAssetLoader` on a virtual `https://localhost` origin, which should need
no INTERNET permission, but that needs confirming on a device. If the app fails
to load its assets at launch, uncomment the line in the manifest — behaviour
then matches any other Capacitor app and nothing else changes.

This is the first thing to check on a real phone.

## Building

The web layer, both platform projects and all configuration are committed. What
remains needs an SDK that cannot run in a Linux container.

### Android

Needs Android Studio (or the command-line SDK) and a JDK. Gradle and JDK 21 are
already present in this repo's toolchain.

```bash
npm run android          # build web, sync, open in Android Studio
npm run android:build    # or straight to a debug APK
```

The debug APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

For a release build you need a signing keystore — create one in Android Studio
under Build → Generate Signed Bundle, and produce an `.aab` for Play.

### iOS

Needs macOS with Xcode and CocoaPods. Neither can run on Linux, so the project
is scaffolded and configured but has never been compiled.

```bash
npm run ios              # build web, sync, open in Xcode
```

Then in Xcode: set the team under Signing & Capabilities, and run. First build
also needs `cd ios/App && pod install`.

## After any web change

```bash
npm run sync
```

Builds the web bundle and copies it into both platforms. The native projects
hold no application logic — everything lives in `src/`, and the platform seam
is `src/lib/platform.ts`.

## The platform seam

No screen imports a Capacitor plugin directly. Everything native goes through
`src/lib/platform.ts` and `src/lib/nativeReminders.ts`, each with a web
fallback that already worked. The browser build stays a first-class target,
because it is how someone tries this before installing anything — and the ten
browser tests, including the one that fails the build on any cross-origin
request, still run against it.

## Store listing notes

Both stores ask what data the app collects. The answer is none: no account, no
analytics, nothing transmitted. In the packaged build every asset — the shell,
the fonts, the vision model — is loaded from the local bundle, so `connect-src
'self'` resolves to the device itself and no request reaches the network at
all. Declaring that accurately is straightforward and is worth making prominent
in the listing — it is the product's main differentiator and the thing most
competitors cannot say.

Camera and notification permissions are both requested in context, at the
moment they are first needed, rather than at launch.
