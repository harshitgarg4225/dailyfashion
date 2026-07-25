import { useEffect, useRef, useState } from 'react'
import { getPhoto } from '../db/db'

/**
 * Renders a photo out of IndexedDB, loading it only when it comes near the
 * viewport.
 *
 * Two things this has to get right, both of which show up as the app being
 * killed in the background rather than as anything obviously wrong:
 *
 * 1. **Object URLs are revoked on unmount.** Skipping that pins every decoded
 *    image in memory until the tab dies. For a local-only app, being killed in
 *    the background means the user returns to a spinner and reasonably assumes
 *    their log is gone.
 *
 * 2. **Blobs are only read when needed.** `loading="lazy"` does nothing here,
 *    because the src is a blob URL we created ourselves — the browser cannot
 *    defer work we already did. A year's grid is 365 cells, and eagerly
 *    decoding all of them is hundreds of megabytes of bitmap for the dozen
 *    actually on screen.
 */

/** Start fetching this far outside the viewport, so scrolling stays smooth. */
const PRELOAD_MARGIN = '600px'

export function Photo({
  photoId,
  alt,
  className,
  eager = false,
}: {
  photoId: string
  alt: string
  className?: string
  /** Set for the one large photo on a screen, where there is nothing to defer. */
  eager?: boolean
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (visible) return
    const node = holder.current
    if (!node) return

    // No IntersectionObserver (or a test environment): load immediately rather
    // than render nothing forever.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return

    let cancelled = false
    let objectUrl: string | null = null

    void getPhoto(photoId).then((blob) => {
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId, visible])

  if (!url) return <div ref={holder} className={className} aria-hidden="true" />
  return <img className={className} src={url} alt={alt} decoding="async" />
}
