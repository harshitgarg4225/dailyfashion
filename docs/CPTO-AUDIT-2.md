# CPTO audit — second pass

An end-to-end product/technology review of Daily Fashion: ease of UX, ease of
use, functionality, security, scalability, and whether the end user actually
gets value. The first audit (CPTO-AUDIT.md) took the product from spec to
shipped; this one takes it from shipped to worth keeping.

**How to read the status column.** SHIPPED means built, tested and on the
deployed branch. QUEUED means selected into the top 30 but not yet built —
each carries a note on shape and cost so it can be picked up cold. The long
list below the table is everything considered, kept so future triage starts
from evidence rather than memory.

## The thesis this audit works from

The product's value arrives on a delay: nothing meaningful can appear before
fourteen answered evenings. Everything in the top 30 therefore serves one of
three goals, in priority order:

1. **Give value on day one, not day fourteen** — naming, matching, the
   shortlist, the week card: things that are useful before the engine speaks.
2. **Never lose a single day of anyone's log** — durability and trust:
   storage persistence, export health, screenshot protection.
3. **Make the fortnight social** — the community and the share paths are the
   only distribution the app has.

## The top 30

| # | Improvement | Axis | Status |
|---|---|---|---|
| 1 | On-device garment identification + naming (MobileNet, bundled same-origin) | Value/day-one | SHIPPED |
| 2 | Garment names editable; the user's word permanently outranks the model's | UX/trust | SHIPPED |
| 3 | Backfill naming over pre-model photos, batched after launch | Value | SHIPPED |
| 4 | Garment names searchable (user word ranks as tag, model word as derived) | Function | SHIPPED |
| 5 | Settings switch to turn model naming off entirely | Trust | SHIPPED |
| 6 | CSP rebuilt on two legs: `connect-src 'self'` + server refuses all bodies, both e2e-enforced | Security | SHIPPED |
| 7 | Reddit community: one-directional link out, submit + browse, link shape pinned by test | Growth | SHIPPED |
| 8 | Instagram/Reddit share paths made explicit on the Week screen | Growth | SHIPPED |
| 9 | Mira design language adopted whole (white gallery, monochrome, Instrument Sans) | UX | SHIPPED |
| 10 | Share card retypeset in the same language — it is the piece that travels | Growth | SHIPPED |
| 11 | Download page, icons, splash, manifest, native shells all re-themed to match | UX | SHIPPED |
| 12 | FLAG_SECURE on Android: mirror photos out of recents preview, screenshots, recordings | Security | SHIPPED |
| 13 | Buttons invert rather than tint; focus-visible outlines throughout | UX/a11y | SHIPPED |
| 14 | Service-worker cache versioning bumped with the redesign so no one is stranded on the old shell | Correctness | SHIPPED |
| 15 | Supply chain to zero known vulnerabilities (happy-dom, vite, vitest majors) | Security | SHIPPED |
| 16 | e2e coverage for the community links and the no-upload guarantee | Quality | SHIPPED |
| 17 | Garment name on the journal grid cell (a word under the thumbnail makes the grid scannable) | UX | QUEUED — LogScreen cell + one CSS block |
| 18 | Thumbnail store: save a ~200px thumb beside the full JPEG; grid decodes thumbs only | Scale | QUEUED — biggest perf win for year-long logs; needs a photos-store migration + refingerprint-style backfill |
| 19 | Journal virtualization above ~200 entries | Scale | QUEUED — pairs with 18; windowed rendering in LogScreen |
| 20 | Export-health nudge: quiet line when the log has grown 30+ days past the last export | Durability | QUEUED — `last_export_at` in settings, one line in Settings/Progress |
| 21 | Undo for day removal (6-second soft delete) instead of confirm-only | UX | QUEUED — hold row + photo in memory, flash with action button |
| 22 | Week card gains the week's garment words (facts about clothes, true at any n) | Growth | QUEUED — shareCard caption block; ban-list-safe by construction |
| 23 | Outfit detail view: all wears of a cluster on one screen with felt context | Value | QUEUED — new screen off the journal; data already denormalized |
| 24 | Month view for the journal once the grid passes ~60 entries | UX | QUEUED |
| 25 | Year wrap (the week card's machinery over 12 months) | Growth | QUEUED — seasonal moment; reuse weekWrapped aggregation |
| 26 | Encrypted export option (password → WebCrypto AES-GCM over the zip) | Security | QUEUED — needs careful copy so the password is understood as unrecoverable |
| 27 | iOS screenshot privacy: blur the app switcher snapshot (UIVisualEffectView on resign-active) | Security | QUEUED — small AppDelegate change, mirrors #12 |
| 28 | Camera-roll import de-duplication (same EXIF timestamp = same day offer) | UX | QUEUED — guards the seeding flow against double-picks |
| 29 | Tag autocomplete surfacing garment vocabulary (model words as suggestions in the tag field) | Function | QUEUED — itemSuggestions already exists; merge sources |
| 30 | Insight cards cite garment names where confidence was user-confirmed ("the black cardigan: 4 of 5 good days") | Value | QUEUED — insight engine change; gate on `source: 'user'` only |

## The long list

Everything considered, including what was deliberately not selected and why.

### Ease of UX
- Garment word on grid cells (#17) · month view (#24) · outfit detail (#23)
- Undo delete (#21) · import de-dup (#28)
- Skeleton shimmer while photos decode — considered; the quiet grey block
  already carries the wait, shimmer adds motion for its own sake. Dropped.
- Swipe between days in the day view — real value, real gesture-conflict cost
  with scroll; revisit after month view exists.
- Haptic on capture — already shipped in v1.
- Dark theme — the product's identity is white gallery; a dark theme would be
  a second design system to maintain. Deliberately refused for now; the camera
  is already black.

### Ease of use
- Export-health nudge (#20) · tag autocomplete (#29)
- Reminder time presets ("after dinner") — cute, low value over the picker.
- Passcode biometrics on native — WebAuthn/biometric plugin; queue behind
  store submission since it changes the lock model.
- Onboarding demo mode (pre-filled fake log) — the worked example on Patterns
  already serves this; a fake log risks teaching that the data is fake.

### Functionality
- Garment naming suite (#1–#5) · insight citations (#30) · year wrap (#25)
- Weather-aware shortlist — shipped in v1 (temperature bands, no network).
- Multi-photo days — schema allows entries-per-day > 1 already; UI cost is a
  carousel; not selected, the second photo rarely changes the day's story.
- Voice note on a day — transcription needs a model far bigger than the
  garment one or a network request. Refused on the privacy axis.

### Security & privacy
- Two-leg CSP guarantee (#6) · FLAG_SECURE (#12) · iOS switcher blur (#27)
- Encrypted export (#26) · supply chain zero (#15)
- Passcode rate limiting — shipped in v1 (delay on wrong entry).
- Clipboard hygiene — nothing sensitive is ever placed on the clipboard.
- Panic wipe (tap pattern → delete) — the settings delete-everything flow
  exists; a hidden gesture is more likely to fire accidentally than be needed.

### Scalability
- Thumbnails (#18) · virtualization (#19)
- Signature comparison is already windowed (SIMILARITY_WINDOW = 60).
- IndexedDB transaction batching for import — import is rare; current
  per-row writes are fine to ~thousands of rows.
- The model file (11MB) is cached by the service worker after first load;
  native builds carry it in the bundle. No further work needed.

### Growth
- Community (#7) · explicit share paths (#8) · card language (#10) · week
  garments (#22)
- Referral codes — mira has the machinery, but codes need a server to verify
  and this app must not acquire one. Refused.
- App Store / Play Store submission — blocked on signing secrets and a
  developer account, both outside the codebase. Tracked in RELEASE.md.
