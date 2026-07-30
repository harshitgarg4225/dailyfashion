import { useEffect, useState } from 'react'
import { copy } from '../lib/copy'
import { track } from '../lib/telemetry'
import { fetchAds, type Ad } from '../app/OffersStrip'

/**
 * Offers: the one page that shows ads, and says so in its first word.
 *
 * The rules that keep this from becoming every other ad surface:
 *
 *  - It is a destination, not an interruption. Nothing here is injected
 *    into the journal, the camera, or the evening questions; the user
 *    walks in and can walk straight back out.
 *  - The ads are rows we placed in our own database, served from our own
 *    origin. No ad network, no third-party script, no pixel — the CSP
 *    still refuses every cross-origin request, so nothing here can track
 *    anyone even if it wanted to.
 *  - Tapping one is a plain link out, the same grammar as the community.
 *
 * On the native builds the bundle's origin has no API, so the fetch fails
 * and the screen honestly says there is nothing to show.
 */

export function OffersScreen({ onBack }: { onBack?: (() => void) | undefined }) {
  const [ads, setAds] = useState<Ad[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAds().then((rows) => {
      if (!cancelled) setAds(rows)
    })
    // Viewing the page is itself a consented event — and the only one here.
    void track('ads_view', { placement: 'page' })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.sponsor.label}</span>
        <h1>{copy.offers.title}</h1>
        <span className="sub">{copy.offers.sub}</span>
      </div>

      {ads === null ? null : ads.length === 0 ? (
        <p className="empty">{copy.offers.empty}</p>
      ) : (
        <div className="stack">
          {ads.map((ad) => (
            <article key={ad.id} className="card">
              <h2>{ad.title}</h2>
              {ad.body ? <p className="note">{ad.body}</p> : null}
              <a
                className="btn btn--ghost"
                href={ad.url}
                target="_blank"
                rel="noreferrer noopener sponsored"
              >
                {copy.offers.open}
              </a>
            </article>
          ))}
        </div>
      )}

      <p className="note">{copy.offers.how}</p>

      {/* The page is a destination off the tab bar, so it names its own exit. */}
      {onBack ? (
        <button type="button" className="btn btn--quiet btn--block" onClick={onBack}>
          {copy.offers.back}
        </button>
      ) : null}
    </div>
  )
}
