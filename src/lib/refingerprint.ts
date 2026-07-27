import { allEntries, getPhoto, putEntry } from '../db/db'
import { preparePhoto } from './capture'
import { SIGNATURE_VERSION } from './signature'

/**
 * Brings older entries onto the current fingerprint format.
 *
 * When the descriptor changed to describe the subject rather than a fixed crop,
 * every signature already on a device became incomparable with every new one —
 * and `similarity` correctly refuses to compare across versions rather than
 * inventing a number. Left alone, that would silently split each user's log in
 * two: nothing photographed before the update could ever be recognised as the
 * same outfit as anything after it, and the observation the whole product is
 * built around needs five wears of one outfit to appear.
 *
 * So the photographs are re-read and re-fingerprinted. The images are already
 * on the device; nothing is uploaded and nothing is lost — only the derived
 * signature changes.
 *
 * Deliberately unhurried. It runs after launch, a few entries at a time, with
 * the main thread given back between batches, because a user opening the app to
 * photograph an outfit must not wait on housekeeping for a year of history.
 */

/** Entries handled per batch before yielding. */
const BATCH = 4

/** Pause between batches, so the camera and the log stay responsive. */
const BREATH_MS = 60

export interface RefingerprintResult {
  updated: number
  skipped: number
}

let running = false

export async function refingerprintOldEntries(): Promise<RefingerprintResult> {
  // One pass at a time. A second launch mid-run would otherwise read and write
  // the same rows twice.
  if (running) return { updated: 0, skipped: 0 }
  running = true

  let updated = 0
  let skipped = 0

  try {
    const stale = (await allEntries()).filter(
      (entry) =>
        entry.photo_id !== null &&
        entry.signature !== null &&
        (entry.signature.v ?? 1) < SIGNATURE_VERSION,
    )

    for (let index = 0; index < stale.length; index++) {
      const entry = stale[index]!

      try {
        const blob = entry.photo_id ? await getPhoto(entry.photo_id) : undefined
        if (!blob) {
          skipped += 1
          continue
        }

        const prepared = await preparePhoto(blob)
        await putEntry({ ...entry, signature: prepared.signature })
        updated += 1
      } catch {
        // A single unreadable photograph must not stop the pass. The entry keeps
        // its old signature and simply will not match anything — the same
        // position it was already in.
        skipped += 1
      }

      if (index % BATCH === BATCH - 1) {
        await new Promise((resolve) => setTimeout(resolve, BREATH_MS))
      }
    }
  } finally {
    running = false
  }

  return { updated, skipped }
}

/** Test seam, so a suite can run the pass twice. */
export function __resetRefingerprintForTests(): void {
  running = false
}
