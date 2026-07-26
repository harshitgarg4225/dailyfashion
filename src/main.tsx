import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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
      .then(() => {
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
