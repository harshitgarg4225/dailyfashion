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
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
