import { useEffect, useState } from 'react'
import { getPhoto } from '../db/db'

/**
 * Renders a photo out of IndexedDB.
 *
 * Object URLs are created per mount and revoked on unmount. Skipping the
 * revoke is the classic leak here: a grid of 200 entries scrolled a few times
 * pins every decoded image in memory until the tab dies, and on a phone that
 * shows up as the app being killed in the background — which for a local-only
 * app means the user comes back to a spinner and assumes their log is gone.
 */
export function Photo({
  photoId,
  alt,
  className,
}: {
  photoId: string
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null

    void getPhoto(photoId).then((blob) => {
      if (!blob || revoked) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId])

  if (!url) return <div className={className} aria-hidden="true" />
  return <img className={className} src={url} alt={alt} loading="lazy" decoding="async" />
}
