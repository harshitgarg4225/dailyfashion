import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

/**
 * Static file server for the built PWA.
 *
 * This is the only server-side code in the project, and it is worth being
 * precise about what it does: it hands out HTML, JS, CSS and icons. It has no
 * database, no API routes, no session handling, and no logging of anything a
 * user does. There is nowhere for a photo or a rating to go even in principle,
 * because nothing here accepts a request body.
 *
 * That is what makes the claim in onboarding survive being hosted. "Nothing
 * leaves this phone" would be a lie if the origin serving the app also had an
 * endpoint willing to receive it. It doesn't.
 */

const PORT = Number(process.env.PORT ?? 3000)
const ROOT = resolve('dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * The same policy as the page's meta tag, sent as a real header.
 *
 * A meta CSP is applied by the parser and cannot cover everything a header
 * can; sending both means the restriction holds even for responses the parser
 * never sees.
 *
 * `connect-src 'self'` is the load-bearing directive. It was `'none'`, which
 * made the app incapable of any network request at all; on-device garment
 * naming needs to fetch a model file, so same-origin had to be allowed for the
 * web build to have that feature.
 *
 * That leaves exactly one reachable host — this one — and the handler below
 * refuses every method that can carry a body, so the only thing this origin
 * can do for the page is hand it files. No cross-origin destination is
 * reachable at all. The privacy claim is still a property rather than a
 * promise; it now rests on two of them instead of one.
 */
const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self'",
  "font-src 'self'",
  "script-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // The camera is used on-device; nothing else needs a powerful feature.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
}

async function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers })
  res.end(body)
}

async function tryFile(pathname) {
  // Resolve inside dist and reject anything that escapes it.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(ROOT, safe)
  if (!filePath.startsWith(ROOT)) return null

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) return null
    return { filePath, size: info.size }
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  /*
   * Half of the privacy guarantee lives on this line.
   *
   * Since `connect-src` allows same-origin, the browser would let the page
   * POST to this server. Refusing every body-carrying method — before routing,
   * for every path that exists and every path that does not — means there is
   * nowhere for that request to land. The app cannot upload anything here
   * because here does not accept uploads.
   *
   * Anything added below this line that reads a request body breaks the claim
   * in onboarding. The end-to-end suite asserts this and will fail the build.
   */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  // Railway's healthcheck.
  if (url.pathname === '/healthz') {
    return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' })
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  let found = await tryFile(pathname)

  /*
   * Extensionless paths resolve to a real page before the shell catches them.
   *
   * The download page is plain HTML rather than a route inside the app, so
   * without this the single-page fallback below would hand /download the app
   * shell — and someone following a link from a shared URL would land in an
   * onboarding flow instead of on the page that explains what they are
   * installing.
   */
  if (!found && !extname(pathname)) found = await tryFile(`${pathname}.html`)

  // Single-page app: unknown paths fall through to the shell.
  if (!found) found = await tryFile('/index.html')
  if (!found) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })

  const ext = extname(found.filePath)
  const isShell = found.filePath.endsWith('index.html')
  const isWorker = found.filePath.endsWith('sw.js')

  // Hashed build assets are immutable; the shell and the worker must not be,
  // or a deploy never reaches anyone who already installed the app.
  const cacheControl =
    isShell || isWorker
      ? 'no-cache'
      : found.filePath.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600'

  const body = req.method === 'HEAD' ? '' : await readFile(found.filePath)

  return send(res, 200, body, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': String(found.size),
    'Cache-Control': cacheControl,
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Daily Fashion listening on :${PORT}`)
})
