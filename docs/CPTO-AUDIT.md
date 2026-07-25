# Daily Fashion — product & engineering audit

Written against commit `f3121c7`, the first build with the loop working end to end.

The MVP is real: 59 unit tests, 6 browser tests, a working camera→reflection loop,
an insight engine with honest thresholds, and a privacy claim enforced by CSP rather
than asserted in a policy. What follows is what is wrong with it, what is missing,
and what it would take to put it in front of someone who buys Louis Vuitton.

Severity is about consequence, not effort:

- **P0** — the product is broken, unsafe, or dishonest without it.
- **P1** — the product works but will not retain or convert.
- **P2** — quality, polish, and scale headroom.

Status: `TODO`, `DOING`, `DONE`.

---

## 0. The headline

Three findings dominate everything below.

1. **The evening reminder does not exist.** `Settings` stores a time and an enabled
   flag, and `sw.js` knows how to display a notification, but nothing ever schedules
   one. J2 — the half of the loop that produces every rating the insight engine eats
   — currently depends on the user spontaneously remembering. The single success
   metric in the spec is loop completion rate. Today the mechanic that drives it is
   not wired. **P0.**

2. **Local-only data has no durability story.** Photos live in IndexedDB, which
   browsers evict under storage pressure without asking. A user's year of history can
   vanish because Safari wanted space back. For an app whose whole moat is "it gets
   more valuable the longer you use it", silent data loss is existential — and we
   never call `navigator.storage.persist()`, never show usage, and never nudge an
   export. **P0.**

3. **The design is a generic dark app.** Rounded corners, amber accent, system font.
   It reads as a habit tracker. The stated audience expects the restraint of a
   maison: ivory, ink, hairline rules, letterspaced capitals, photographs treated as
   objects. This is not paint on top — it changes typography, spacing, colour,
   corner radius, and motion. **P0** given the explicit brief.

---

## 1. Functional — gaps against the spec

| # | Finding | Sev | Status |
|---|---|---|---|
| F1 | Evening reminder never scheduled. No timer, no permission request, no re-arm on launch. J2's lock-screen mechanic is inert. | P0 | DONE |
| F2 | `consecutive_ignores` is written to the schema but never incremented, so J9's "auto-mute after 5 ignores" cannot fire. | P0 | DONE |
| F3 | Temperature is only asked when the similarity matcher finds **no** match — the `else` branch. Every repeat-wear is logged with `temp_band: null`, which is exactly the population J7's confound suppression needs most. | P0 | DONE |
| F4 | `ShortlistScreen` is passed `tempBand: null` hard-coded from `App.tsx`, so J6's weather matching never engages and the header never earns its "days like today" claim. | P0 | DONE |
| F5 | "Add a past day" opens the camera with today's date. J9 promises backdating up to 7 days; there is no date picker. | P1 | DONE |
| F6 | J6's "wearing this again" sets state and opens the camera but never links the new entry to the chosen outfit. Repeat-wear is not one tap; it is a normal capture. | P1 | DONE |
| F7 | `recomputeOutfit` runs on link but not after a rating changes, so `avg_felt` and `wear_count` on the `outfit` row drift from the entries. Nothing reads them yet, which is the only reason this is not already a bug. | P1 | TODO |
| F8 | Biometric/passcode lock exists in `Settings` and in copy, with no UI row and no enforcement. J4 lists it as a feature. | P1 | TODO |
| F9 | `note` exists on `Entry` with no way to write one. Either build it or drop it from the schema. | P2 | TODO |
| F10 | `deleteEntry` is implemented and unreachable. A single bad photo cannot be removed without wiping everything. | P1 | DONE |
| F11 | Dismissed insights are dismissed forever. A card about a jacket you have since worn twenty more times should be allowed to return with new evidence. | P2 | TODO |
| F12 | The "welcome back" gap check reads `entries[1]`, which is the second-newest entry, not the gap before the current one. It will fire at the wrong times. | P1 | DONE |
| F13 | Export has no progress indication. 200 photos is several seconds of frozen button. | P2 | TODO |
| F14 | No import. Export exists, so a user can leave; they cannot return, or move to a new phone. For a local-only app with no sync, import **is** the migration story. | P1 | TODO |

## 2. UX & ease of use

| # | Finding | Sev | Status |
|---|---|---|---|
| U1 | Post-capture sheets chain: link → tag, or temp. Up to three modal decisions after a shutter tap that promised "no confirm screen". The prompts are individually cheap and collectively a gauntlet. | P0 | DONE |
| U2 | No undo. A mis-tapped felt score is permanent unless the user finds the entry in the grid and re-opens it. | P1 | TODO |
| U3 | The tab bar carries `Capture` alongside four sections, so the primary action is a peer of Settings. It should be a distinct, always-present affordance. | P1 | DONE |
| U4 | No skeleton or empty-state treatment while the log loads; the app renders a blank `.app` div. On a cold start with 200 entries this is a visible flash of nothing. | P1 | TODO |
| U5 | Onboarding's buttons are both labelled "Next" with no sense of length or position beyond three dots. | P2 | TODO |
| U6 | The grid caps consecutive gap cells at 21, which is right, but a returning user still scrolls three weeks of blank squares before reaching their history. | P2 | TODO |
| U7 | No haptic feedback on shutter or felt selection. On a phone this is most of what "responsive" means. | P2 | TODO |
| U8 | Insight cards render all at once in a scroll. The spec says one at a time, which is a materially different experience — a stack of five observations is a dashboard. | P1 | DONE |
| U9 | Nothing explains what happens after the felt tap. A one-line "this is what builds your patterns" would connect the daily chore to the payoff. | P2 | TODO |

## 3. Design — the Louis Vuitton direction

The reference is not "luxury decoration". It is **restraint, material quality, and
confidence in white space**. Concretely, what changes:

| # | Change | Sev | Status |
|---|---|---|---|
| D1 | Palette: from dark/amber to ivory (`#F7F4EF`), ink (`#1A1714`), and a single monogram-adjacent brown (`#4E3629`) used sparingly. Camera stays black — it must. | P0 | DONE |
| D2 | Typography: a self-hosted editorial serif for display, a neutral sans for body, and letterspaced uppercase for eyebrows and labels. Self-hosted because `connect-src 'none'` forbids a font CDN — the privacy constraint dictates the typographic one. | P0 | DONE |
| D3 | Geometry: corner radius from 14–20px down to 0–2px. Luxury is square. Hairline 1px rules instead of filled surfaces. | P0 | DONE |
| D4 | Spacing: a proper scale with far more negative space. Current padding is app-generic (20px); editorial layouts want 24–40px margins and much larger vertical rhythm. | P0 | DONE |
| D5 | Photography: entries presented as gallery objects — generous margins, no rounded corners, no drop shadows, captions in small caps beneath rather than badges laid on top. | P0 | DONE |
| D6 | Motion: slow, few, and only on state changes. No bounce, no scale-on-press beyond a subtle opacity shift. | P1 | DONE |
| D7 | The felt scale currently uses circle glyphs (`◦◌○◍●`) that read as a rating widget. Needs a treatment that feels like choosing a word, not scoring yourself. | P1 | DONE |
| D8 | No favicon/app icon refinement — the generated ring is a placeholder, not a mark. | P2 | TODO |
| D9 | `style-src 'unsafe-inline'` is required today only because several components use inline `style` props. Removing them tightens the CSP **and** forces the spacing scale to be real. | P1 | TODO |

## 4. End-user problem solving

| # | Finding | Sev | Status |
|---|---|---|---|
| P1a | The killer insight ("you rate it highly and never wear it") needs 5 wears of one outfit, which needs the similarity matcher to cluster reliably. If clustering under-fires, the best card never appears. There is no instrumentation to know whether it fires. | P0 | TODO |
| P2a | Item-level findings ("your worst days correlate with those shoes") require lazy tags, which are optional and easy to skip. Realistically a minority of users ever reach n≥5 on an item. The colour card is the honest early substitute and should be foregrounded. | P1 | TODO |
| P3a | Nothing shows the user their own trajectory toward the first insight beyond a bare count. "You are 6 days from your first observation" is the retention hook of the first fortnight. | P1 | DONE |
| P4a | No insight explains *itself*. A "how was this worked out?" disclosure would convert scepticism into trust, which is the whole product. | P2 | TODO |

## 5. Security & privacy

| # | Finding | Sev | Status |
|---|---|---|---|
| S1 | Photos are stored unencrypted in IndexedDB. Any process with the profile can read them. With the passcode lock (F8) they should be encrypted at rest via WebCrypto with a key derived from the passcode. | P1 | TODO |
| S2 | Export writes a zip of every photo to the Downloads folder — outside the app sandbox, often synced to a cloud drive by the OS. This is the one moment the privacy promise legitimately ends, and the UI must say so plainly before the download starts. | P0 | DONE |
| S3 | `newId` falls back to `Math.random()` when `crypto.randomUUID` is absent. Predictable ids are harmless here, but the fallback is dead weight on every target browser and should just use `crypto.getRandomValues`. | P2 | DONE |
| S4 | `style-src 'unsafe-inline'` — see D9. | P1 | TODO |
| S5 | No `Clear-Site-Data` on wipe. `deleteDatabase` handles our data; the service worker cache still holds the shell (harmless, but worth being exact about). | P2 | TODO |
| S6 | The service worker has no version/skipWaiting story beyond a constant, so a deploy can leave a stale shell against a new asset manifest. | P1 | TODO |

## 6. Scalability

| # | Finding | Sev | Status |
|---|---|---|---|
| C1 | `useLog` reloads **every** entry, item, link, and setting after every single write. Each felt tap is an O(n) full reload. Fine at 30 entries, visibly slow at 1,000. | P1 | TODO |
| C2 | No `navigator.storage.persist()` request and no quota surfacing, so eviction is silent. See headline. | P0 | DONE |
| C3 | Signature computation and JPEG re-encode run on the main thread during capture, blocking the UI at exactly the moment the app promised to be fast. Belongs in a Worker. | P1 | TODO |
| C4 | `IDB_VERSION` is 1 with no migration scaffolding. The first schema change after launch will need one and it is much cheaper to add now. | P1 | TODO |
| C5 | The log grid mounts a `Photo` per cell, each creating an object URL immediately. 200 entries means 200 decoded images held at once. Needs windowing. | P1 | TODO |
| C6 | `generateInsights` runs on every render of the insights screen, over the whole log. Needs memoising on entry count + dismissals. | P2 | TODO |

## 7. Mobile

| # | Finding | Sev | Status |
|---|---|---|---|
| M1 | iOS PWAs cannot use notification actions, so J2's two-tap lock-screen rating degrades to tap-through. Documented in `sw.js`, but the user is never told, and iOS is the platform this audience is on. | P1 | TODO |
| M2 | No "Add to Home Screen" guidance. On iOS there is no install prompt, so without instructions most users stay in a Safari tab — where storage eviction is far more aggressive. This compounds C2 directly. | P0 | DONE |
| M3 | No orientation handling on the camera; a landscape capture is stored rotated. | P1 | TODO |
| M4 | No `apple-touch-startup-image`, so the installed app shows a white flash on cold launch. | P2 | TODO |
| M5 | Tab bar does not account for landscape safe areas. | P2 | TODO |
| M6 | Camera preview uses `object-fit: cover`, which crops the frame — a full-length outfit shot can lose the shoes that a later insight depends on. | P1 | TODO |

---

## 8. Found by the browser suite, already fixed

These were not on the plan; the end-to-end tests surfaced them, and all three
sat directly on the core loop.

| # | Finding | Sev | Status |
|---|---|---|---|
| B1 | The camera screen had no exit. J1 routes users into it every morning, so opening the app and deciding not to photograph anything left you stuck. | P0 | DONE |
| B2 | Tapping the shutter before the stream was live silently did nothing — `videoWidth` was 0, the encode rejected, and the rejection was swallowed. The single most important tap in the product, failing quietly, on exactly the cold-launch path J1 optimises for. | P0 | DONE |
| B3 | The evening reflection had no CSS for its photo. The image rendered at natural size and its bounding box covered the felt scale, making the screen impossible to complete. | P0 | DONE |
| B4 | `frame-ancestors` was set in the meta CSP, where browsers ignore it. Now header-only. | P2 | DONE |
| B5 | The camera preview used `object-fit: cover`, cropping the frame — losing the shoes and hem that later observations depend on. Now `contain`. | P1 | DONE |
| B6 | "Add a past day" only rendered once the log was non-empty, locking backdating away from the exact person it helps most — someone on day one entering the days they remember. | P1 | DONE |
| B7 | The insight gate counts evenings answered, but the copy said "days logged". Someone with a week of photos and no reflections read "0 of 14" as a broken app. | P2 | DONE |

## Build order

The sequence is chosen so each phase is shippable on its own.

**Phase 1 — trust and the loop** (F1, F2, F3, F4, F12, C2, S2, U1) — **shipped**
Without the reminder there is no rating; without the rating there is no insight;
without durable storage the whole premise leaks. Plus the honesty fixes.

**Phase 2 — the maison** (D1–D7) — **shipped**
The full design language, applied across every screen.

**Phase 3 — retention** (U8, P3a, F5, F6, F10) — **shipped**
One-card-at-a-time insights, progress toward the first observation, backdating,
one-tap repeat wear, entry removal. U2 (undo) remains: re-rating is possible by
reopening a day from the grid, but there is no immediate undo after a save.

**Phase 4 — durability at scale** (C1, C3, C4, C5, F14, S1, M2, M3)
Workers, windowing, migrations, import, encryption, install guidance.
