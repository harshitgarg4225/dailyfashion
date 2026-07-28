import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

/*
 * Bodoni Moda, bundled rather than linked.
 *
 * The display face was a platform stack — Didot on Apple devices, Noto Serif on
 * Android — which meant the brand was literally a different typeface depending
 * on the phone, on the two platforms we are shipping to. For a product sold on
 * how considered it looks, that is not a detail to leave to chance.
 *
 * Bodoni Moda is a true Didone, which is the register the whole design is
 * reaching for, and it is open-licensed. Bundled as two variable woff2 subsets
 * (~56KB) so it is served same-origin, which is all `connect-src 'self'` and
 * `font-src 'self'` permit — a font CDN was never an option here, and it turns
 * out not to be a loss.
 */
import '@fontsource-variable/bodoni-moda/wght.css'
import '@fontsource-variable/bodoni-moda/wght-italic.css'

import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
