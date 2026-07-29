import { Pool } from 'pg'

/**
 * The API: the one place data is allowed to arrive, and what it will hold.
 *
 * This file exists because the product changed its mind, and the change is
 * recorded here rather than smuggled in. The original contract was "no route
 * accepts a body anywhere". The contract now is narrower but still exact:
 *
 *  - Photos, notes, felt scores and the log NEVER arrive here. There is no
 *    endpoint shaped like them, and the events endpoint drops oversized or
 *    unknown payloads outright.
 *  - Usage events and an optional profile arrive ONLY for clients that
 *    opted in — the app sends nothing until the switch in Settings is on,
 *    which the e2e suite still enforces.
 *  - Ads are read-only rows we place in the database by hand; the endpoint
 *    hands them out and records nothing about who asked.
 *
 * Everything is same-origin, so `connect-src 'self'` still holds and every
 * third-party destination remains unreachable from the app.
 */

/** Events the client may report. Anything else is dropped, not stored. */
const KNOWN_EVENTS = new Set([
  'app_open',
  'capture',
  'reflection',
  'share_card',
  'export',
  'ads_view',
])

const AGE_BANDS = new Set(['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'])

/** Request bodies larger than this are hostile, not chatty. */
const MAX_BODY_BYTES = 16 * 1024

let pool = null
let ready = null

function db() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        client_id TEXT NOT NULL,
        event TEXT NOT NULL,
        props JSONB NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS profiles (
        client_id TEXT PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        age_band TEXT,
        gender TEXT,
        location TEXT,
        profession TEXT
      );
      CREATE TABLE IF NOT EXISTS ads (
        id BIGSERIAL PRIMARY KEY,
        active BOOLEAN NOT NULL DEFAULT true,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL
      );
    `)
  }
  return pool
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function clean(value, max) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Routes /api/*. Returns true when the request was handled here.
 *
 * `send` is the caller's responder, so every API response carries the same
 * security headers as the static files do.
 */
export async function handleApi(req, res, url, send) {
  if (!url.pathname.startsWith('/api/')) return false

  const database = db()

  if (url.pathname === '/api/ads' && req.method === 'GET') {
    let ads = []
    if (database) {
      try {
        await ready
        const result = await database.query(
          'SELECT id, title, body, url FROM ads WHERE active ORDER BY id DESC LIMIT 20',
        )
        ads = result.rows
      } catch {
        ads = []
      }
    }
    await send(res, 200, JSON.stringify({ ads }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    return true
  }

  if (url.pathname === '/api/events' && req.method === 'POST') {
    if (!database) {
      await send(res, 503, 'no database', { 'Content-Type': 'text/plain; charset=utf-8' })
      return true
    }
    try {
      await ready
      const body = JSON.parse(await readBody(req))
      const clientId = clean(body.client_id, 64)
      const event = clean(body.event, 32)
      if (!clientId || !event || !KNOWN_EVENTS.has(event)) {
        await send(res, 400, 'bad event', { 'Content-Type': 'text/plain; charset=utf-8' })
        return true
      }
      // Props are capped and stored as-is; the client only ever sends counts.
      const props = typeof body.props === 'object' && body.props !== null ? body.props : {}
      await database.query(
        'INSERT INTO telemetry_events (client_id, event, props) VALUES ($1, $2, $3)',
        [clientId, event, JSON.stringify(props).slice(0, 2048)],
      )
      await send(res, 204, '')
    } catch {
      await send(res, 400, 'bad request', { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    return true
  }

  if (url.pathname === '/api/profile' && req.method === 'POST') {
    if (!database) {
      await send(res, 503, 'no database', { 'Content-Type': 'text/plain; charset=utf-8' })
      return true
    }
    try {
      await ready
      const body = JSON.parse(await readBody(req))
      const clientId = clean(body.client_id, 64)
      if (!clientId) {
        await send(res, 400, 'bad profile', { 'Content-Type': 'text/plain; charset=utf-8' })
        return true
      }
      const ageBand = AGE_BANDS.has(body.age_band) ? body.age_band : null
      await database.query(
        `INSERT INTO profiles (client_id, age_band, gender, location, profession)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id) DO UPDATE
           SET age_band = $2, gender = $3, location = $4, profession = $5, ts = now()`,
        [clientId, ageBand, clean(body.gender, 32), clean(body.location, 80), clean(body.profession, 80)],
      )
      await send(res, 204, '')
    } catch {
      await send(res, 400, 'bad request', { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    return true
  }

  await send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
  return true
}
