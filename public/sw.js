/**
 * Service worker: offline shell and the evening reminder.
 *
 * Two jobs, and one thing it deliberately does not do.
 *
 * It caches the app shell so Daily Fashion opens in airplane mode — which is
 * how the claim in onboarding stays true after first load rather than only
 * during it (J4).
 *
 * It owns the evening notification (J2). On Android and desktop the
 * notification carries inline actions, so a rating is two taps from the lock
 * screen without opening the app. iOS Safari ignores `actions`, so there the
 * notification is a tap-through that deep-links to the rating sheet for the
 * waiting entry — one tap more, and the best available on that platform.
 *
 * What it does not do is talk to a server. There is no push subscription and
 * no sync; reminders are scheduled locally by the page. A push-based reminder
 * would need a server, an endpoint, and a subscription tied to the device,
 * which is exactly the thing this app promises not to have.
 */

/*
 * Bumped on every release that changes the shell.
 *
 * A fixed name meant `activate` never deleted anything — the sweep only removes
 * caches whose key differs — so an old shell could sit in storage indefinitely
 * and keep being served against a build that had moved on. That is not a
 * theoretical failure: it shipped, and it hid two whole features from the first
 * person to open the app.
 */
const CACHE = 'daily-fashion-v7'
// '/' is the brochure now, not the shell; the app answers at /app and the
// navigation fallback below serves index.html for it offline.
const SHELL = ['/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The API is live data and consented traffic — never cached, never
  // served stale, never intercepted. Ads and events go to the network or
  // they go nowhere.
  if (url.pathname.startsWith('/api/')) return

  // Navigations fall back to the cached shell so a cold launch works offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  /*
   * The shell and the worker are never served from cache while the network is
   * available. Everything under /assets/ is content-hashed, so a stale copy is
   * impossible by construction and cache-first is safe there; index.html is the
   * one file whose name never changes, and serving an old one against a new
   * asset manifest is exactly how a deploy fails to reach anybody.
   */
  if (url.pathname === '/index.html' || url.pathname === '/sw.js') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request).then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only cache our own successful, basic responses.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})

/**
 * The page asks the worker to show the reminder at the chosen time. Timers in
 * a service worker are not durable, so the page re-arms on every launch; the
 * worst case is a missed nudge, never a duplicate.
 */
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'show-reminder') return

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'evening-reflection',
      renotify: false,
      requireInteraction: false,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { entryId: data.entryId ?? null },
      // Ignored by iOS Safari; on Android these are the whole point.
      actions: [
        { action: 'felt-5', title: 'Really good' },
        { action: 'felt-3', title: 'Fine' },
        { action: 'felt-1', title: 'Not great' },
      ],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const entryId = event.notification.data?.entryId ?? null
  const action = event.action

  // An inline action carries the rating in the URL, so the page can apply it
  // and close without the user ever seeing a screen.
  const rating = action && action.startsWith('felt-') ? action.slice('felt-'.length) : null
  const target = rating
    ? `/app?rate=${encodeURIComponent(rating)}${entryId ? `&entry=${encodeURIComponent(entryId)}` : ''}`
    : `/app?screen=tonight${entryId ? `&entry=${encodeURIComponent(entryId)}` : ''}`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'reminder-action', rating, entryId })
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
