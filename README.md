# Daily Fashion

A confidence log. You photograph what you wore, and in the evening you answer two
questions in a few seconds: how the day felt, and whether anything happened.

After a few weeks it can tell you things you cannot see from the inside — that you
rate a jacket highly and almost never reach for it, that compliments cluster on a
colour you rarely wear. It argues with you using your own receipts.

## What makes it different

**It never asks you to build a wardrobe.** Every wardrobe app that died asked people
to photograph and tag two hundred garments before doing anything useful. Item-level
knowledge here accumulates as a side effect of logging: photos are fingerprinted on
save and compared against recent entries, so "same as Tuesday?" is a single tap —
and an on-device vision model (MobileNet, bundled same-origin, eleven megabytes)
suggests a name for what you wore. The suggestion is always editable, your own
word permanently outranks the model's, and a settings switch turns it off.

**Nothing leaves the device.** No account, no sign-up, no sync, no analytics. This
is a property enforced by the browser, not a promise in a policy, and it stands on
two legs. The page is served with `connect-src 'self'`, so every destination except
the app's own origin is unreachable — there is no analytics endpoint or third-party
API it *can* reach. And that origin accepts no data: `server.js` answers 405 to every
method that can carry a body, on every path. The end-to-end suite fails the build if
a cross-origin request is attempted, if the app ever issues anything but a GET, or if
the server starts accepting a POST.

The directive is `'self'` rather than `'none'` so the web build can load the
on-device vision model that names garments; a model is a file, and a file has to be
fetched. It is bundled same-origin, so nothing third-party is involved, and in the
packaged native builds it resolves to the local asset bundle — no network at all.

**It never talks about your body.** No weight, no measurements, no sizes — those
fields do not exist in the schema and never will. A ban list of appearance-judgment
vocabulary is enforced over every user-facing string by a unit test.

**Every observation shows its working.** Each card carries its sample size and,
on request, the arithmetic behind it. Nothing surfaces below 14 answered evenings
and 5 wears of the thing being discussed, and a claim is suppressed outright when
context could explain it away — if every wear of a jacket was a weekend, the
jacket gets no credit.

## Running it

```bash
npm install
npm run dev            # development
npm run build && npm start   # production build, served by server.js
```

| Command | What it does |
|---|---|
| `npm test` | Unit suite — insight thresholds, similarity, zip, copy ban list |
| `npm run typecheck` | Strict TypeScript, no emit |
| `npx playwright test` | Browser suite — the loop, and the nothing-transmitted guarantee |
| `node scripts/make-icons.mjs` | Regenerates app icons from source |

The Playwright suite needs a Chromium. If the environment provides one, point at it
with `CHROMIUM_PATH=/path/to/chromium`.

## Deploying

Railway, via `railway.json`: `npm run build` then `npm start`. `server.js` serves the
built assets and nothing else — it has no route that accepts a request body, so there
is nowhere for user data to go even in principle. Healthcheck is `/healthz`.

Live at `dailyfashion-web-production.up.railway.app` (project `Dailyfashion`).

Both the page and the response header send
`default-src 'self'; connect-src 'self'; style-src 'self'` with no
`unsafe-inline`. The server has no route that accepts a request body, which is
half the privacy guarantee and is asserted by the browser suite — keep it that
way. Pushes to the deployed branch redeploy automatically.

## Layout

```
src/lib/insights.ts    the insight engine — thresholds, confound suppression
src/lib/signature.ts   dHash + HSV palette histogram for "worn before?"
src/lib/garments.ts    the naming rules — class map, confidence floor
src/lib/garmentNamer.ts the model runtime — lazy tfjs, backfill
src/lib/community.ts   the one link out, to the Reddit community
src/lib/photoWorker.ts capture pipeline, off the main thread
src/lib/reminders.ts   the evening nudge, scheduled on-device
src/lib/lock.ts        the optional passcode gate
src/lib/copy.ts        every user-facing string, plus the ban list
src/db/db.ts           IndexedDB; photos live in the same database as entries
src/screens/           one file per screen
docs/CPTO-AUDIT.md     the product audit: 62 findings, and what was done about each
```

## Where it is

The loop works end to end, the insight engine is tested, and the export/import
round trip is verified. 86 unit tests, 7 browser tests, strict TypeScript.

Every finding in `docs/CPTO-AUDIT.md` is closed except one, which is a recorded
decision rather than an omission: photographs are **not** encrypted at rest. With
no account and no server there is nowhere to recover a forgotten passcode from, so
encrypting the log would let four forgotten digits permanently destroy years of
history — on a product whose whole value is that the history accumulates. The
passcode lock defends against the realistic threat (someone holding your phone);
encryption would trade a recoverable harm for an unrecoverable one. Section 9 of
the audit has the full reasoning.

Known platform limits, stated in the app rather than hidden: the evening reminder
needs the app to have been opened that day, since there is no server to push from;
and on iOS the notification is a tap-through rather than an inline answer, because
Safari ignores notification actions.
