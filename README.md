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
save and compared against recent entries, so "same as Tuesday?" is a single tap.

**Nothing leaves the device.** No account, no sign-up, no sync, no analytics. The
page is served with `connect-src 'none'`, so the app is *incapable* of making a
network request — the privacy claim is a property enforced by the browser rather
than a promise in a policy. The end-to-end suite fails the build if any cross-origin
request is attempted.

**It never talks about your body.** No weight, no measurements, no sizes — those
fields do not exist in the schema and never will. A ban list of appearance-judgment
vocabulary is enforced over every user-facing string by a unit test.

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
| `npx playwright test` | Browser suite — the loop, and the no-network guarantee |
| `node scripts/make-icons.mjs` | Regenerates app icons from source |

The Playwright suite needs a Chromium. If the environment provides one, point at it
with `CHROMIUM_PATH=/path/to/chromium`.

## Deploying

Railway, via `railway.json`: `npm run build` then `npm start`. `server.js` serves the
built assets and nothing else — it has no route that accepts a request body, so there
is nowhere for user data to go even in principle. Healthcheck is `/healthz`.

## Layout

```
src/lib/insights.ts    the insight engine — thresholds, confound suppression
src/lib/signature.ts   dHash + HSV palette histogram for "worn before?"
src/lib/copy.ts        every user-facing string, plus the ban list
src/db/db.ts           IndexedDB; photos live in the same database as entries
src/screens/           one file per screen
docs/CPTO-AUDIT.md     prioritised backlog: what is missing and what is next
```

## Where it is

The daily loop works end to end and the insight engine is tested. The evening
reminder is not yet scheduled, storage is not yet marked persistent, and several
spec items remain open — all tracked with severities in `docs/CPTO-AUDIT.md`.
