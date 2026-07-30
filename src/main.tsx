import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

/*
 * Instrument Sans, bundled rather than linked.
 *
 * One face for everything — titles, labels, body — which is the design mira
 * arrived at and this app now shares. The voice comes from how it is set
 * (letterspaced uppercase micro-labels, medium-weight tight-tracked titles),
 * not from a second typeface, and one variable woff2 costs less than the two
 * serif subsets it replaces. Served same-origin, which is all `connect-src
 * 'self'` and `font-src 'self'` permit — a font CDN was never an option here.
 */
import '@fontsource-variable/instrument-sans'

import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * Mark this browser as one the app lives in. The landing page at `/` reads
 * this and forwards straight to /app, so a returning user never sees the
 * brochure twice — including anyone who installed the PWA back when the app
 * itself answered at the root.
 */
try {
  localStorage.setItem('df-app-user', '1')
} catch {
  // Storage can be blocked; the landing page's own button still works.
}

/**
 * Register the offline shell.
 *
 * Deliberately after first paint and deliberately failure-tolerant: if the
 * worker cannot register (private browsing, an older browser, a locked-down
 * profile) the app still works completely. Offline support is a promise this
 * app makes, but it is not a dependency any screen relies on.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        /*
         * Ask for a fresh worker on every launch.
         *
         * Browsers only check for an updated worker on their own schedule, which
         * can be hours. Without this a deploy reaches an installed app whenever
         * the browser feels like it — and the first version of this shipped a
         * stale shell that hid two features from a real user.
         */
        void registration.update().catch(() => undefined)

        /*
         * Reload once a *replacement* worker takes control.
         *
         * Without this an installed app can keep serving a cached shell against
         * an asset manifest that has moved on, which presents as a blank screen
         * after a deploy — and on a local-only app a blank screen reads as
         * "my data is gone".
         *
         * The `hadController` check is what distinguishes an update from a first
         * install: on first install `controllerchange` also fires, and reloading
         * then would yank the page out from under someone mid-onboarding.
         */
        const hadController = Boolean(navigator.serviceWorker.controller)
        let reloading = false

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController || reloading) return
          reloading = true
          window.location.reload()
        })
      })
      .catch(() => undefined)
  })
}
