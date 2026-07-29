import { allEntries, getPhoto, getThumb, putThumb } from '../db/db'
import { makeThumb } from './capture'

/**
 * Thumbs the photos that predate the thumbs store.
 *
 * Same shape as refingerprint and the garment backfill: the full photographs
 * are already on the device, the small rendition is derived data, and the
 * work happens a few entries at a time after launch so that opening the app
 * to take a photo never waits on housekeeping. A photo whose thumb cannot be
 * generated is simply skipped — the grid falls back to the full image for it,
 * which is slower but never wrong.
 */

const BATCH = 4
const BREATH_MS = 80

let running = false

export async function thumbOldEntries(): Promise<{ made: number; skipped: number }> {
  if (running) return { made: 0, skipped: 0 }
  running = true

  let made = 0
  let skipped = 0

  try {
    const withPhotos = (await allEntries()).filter((entry) => entry.photo_id !== null)

    for (let index = 0; index < withPhotos.length; index++) {
      const photoId = withPhotos[index]!.photo_id!

      try {
        if (await getThumb(photoId)) continue
        const blob = await getPhoto(photoId)
        if (!blob) {
          skipped++
          continue
        }
        const thumb = await makeThumb(blob)
        if (!thumb) {
          skipped++
          continue
        }
        await putThumb(photoId, thumb)
        made++
      } catch {
        skipped++
      }

      if ((index + 1) % BATCH === 0) {
        await new Promise((resolve) => setTimeout(resolve, BREATH_MS))
      }
    }
  } finally {
    running = false
  }

  return { made, skipped }
}
