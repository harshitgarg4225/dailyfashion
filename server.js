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
 * never sees. `connect-src 'none'` is the load-bearing directive — with it in
 * place the app is incapable of making a network request, which is a stronger
 * guarantee than any promise in a privacy policy.
 */
const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self'",
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
