import { useEffect, useState } from 'react'
import { copy } from '../lib/copy'
import { track } from '../lib/telemetry'

/**
 * Offers, where the eyes are: a labelled card on the journal itself.
 *
 * The rules that keep this from becoming every other ad surface still hold —
 * the rows are ours, served from our own origin, with no network, script or
 * pixel behind them — but the placement changed on purpose: a page nobody
 * opens sells nothing. What is non-negotiable is the grammar: the card says
 * "Sponsored" in its first word, sits below the user's own photographs,
 * renders nothing at all when unsold, and taps out as a plain link.
 */

export interface Ad {
  id: number
  title: string
  body: string
  url: string
}

/*
 * One fetch per session, shared by every surface that shows offers. Ads
 * change daily at most; refetching per screen visit would be traffic with
 * no information in it.
 */
let cache: Promise<Ad[]> | null = null

export function fetchAds(): Promise<Ad[]> {
  cache ??= fetch('/api/ads')
    .then((response) => (response.ok ? response.json() : { ads: [] }))
    .then((data: { ads: Ad[] }) => (Array.isArray(data.ads) ? data.ads : []))
    .catch(() => [])
  return cache
}

/** Test hook: the cache is per-session state and tests get fresh sessions. */
export function __resetAdsForTests(): void {
  cache = null
}

export function OffersStrip({
  placement,
  limit = 1,
  onMore,
}: {
  placement: string
  limit?: number
  onMore?: (() => void) | undefined
}) {
  const [ads, setAds] = useState<Ad[]>([])

  useEffect(() => {
    let cancelled = false
    void fetchAds().then((rows) => {
      if (!cancelled) setAds(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The whole strip only counts as seen once there is something to see.
  useEffect(() => {
    if (ads.length > 0) void track('ads_view', { placement })
  }, [ads.length, placement])

  if (ads.length === 0) return null

  return (
    <aside className="offers-strip" aria-label={copy.sponsor.label}>
      {ads.slice(0, limit).map((ad) => (
        <a
          key={ad.id}
          className="offers-card"
          href={ad.url}
          target="_blank"
          rel="noreferrer noopener sponsored"
          referrerPolicy="no-referrer"
        >
          <span className="eyebrow">{copy.sponsor.label}</span>
          <strong>{ad.title}</strong>
          {ad.body ? <span className="note">{ad.body}</span> : null}
        </a>
      ))}
      {onMore && ads.length > limit ? (
        <button type="button" className="btn btn--quiet btn--block" onClick={onMore}>
          {copy.offers.more(ads.length)}
        </button>
      ) : null}
    </aside>
  )
}
