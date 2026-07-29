import { allEntries, getEntry, getPhoto, getSettings, putEntry } from '../db/db'
import { aggregateGarment, type GarmentGuess } from './garments'
import type { Entry } from '../types'

/**
 * The runtime half of garment naming: an on-device vision model, loaded
 * lazily, fed the photograph that was just saved.
 *
 * The model is MobileNet v1 (width 0.75), served from this origin out of
 * `public/models/garment/` — eleven megabytes of weights that ship with the
 * app the same way its fonts do. That is the entire reason `connect-src` says
 * `'self'`: a model is a file, a file has to be fetched, and fetching it from
 * our own origin is what keeps the privacy property intact while still
 * letting the app see. Nothing about the photograph ever leaves the device;
 * the classifier runs in this process, on this hardware, and its output is a
 * word in IndexedDB.
 *
 * Failure here is always silent and never blocks anything. The entry is
 * already saved before naming starts; if the model cannot load (an old
 * browser, a cleared cache in airplane mode before first fetch), the garment
 * field just stays empty, exactly as it would for an unrecognised outfit.
 */

const MODEL_URL = '/models/garment/model.json'

/** Enough classes to catch a garment split across several ImageNet labels. */
const TOP_K = 15

/** MobileNet's input edge; classifying at its native size skips a resize. */
const INPUT_SIZE = 224

type Classifier = {
  classify(
    img: ImageData | HTMLCanvasElement,
    topk?: number,
  ): Promise<Array<{ className: string; probability: number }>>
}

let classifierPromise: Promise<Classifier | null> | null = null

/**
 * Loads tfjs and the weights once, on first use — a dynamic import so the
 * tensor library stays out of the startup bundle. The app must open at
 * camera-speed; naming can afford to warm up in the background.
 */
function loadClassifier(): Promise<Classifier | null> {
  if (classifierPromise) return classifierPromise
  classifierPromise = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs')
      await tf.ready()
      const mobilenet = await import('@tensorflow-models/mobilenet')
      return await mobilenet.load({ version: 1, alpha: 0.75, modelUrl: MODEL_URL })
    } catch {
      // One failed load and we stop trying this session; retrying on every
      // photo would re-download nothing and re-fail identically.
      return null
    }
  })()
  return classifierPromise
}

/** Decode a stored JPEG down to the model's input size. */
async function toInput(blob: Blob): Promise<ImageData | null> {
  try {
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: INPUT_SIZE,
      resizeHeight: INPUT_SIZE,
    })
    try {
      const canvas = document.createElement('canvas')
      canvas.width = INPUT_SIZE
      canvas.height = INPUT_SIZE
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE)
      return context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

/** Classify one photograph. Null means "no name worth offering". */
export async function guessGarment(blob: Blob): Promise<GarmentGuess | null> {
  const classifier = await loadClassifier()
  if (!classifier) return null

  const input = await toInput(blob)
  if (!input) return null

  try {
    const predictions = await classifier.classify(input, TOP_K)
    return aggregateGarment(predictions)
  } catch {
    return null
  }
}

/**
 * Names a saved entry's photo, then patches the entry.
 *
 * Fire-and-forget by design: the caller has already stored the entry and
 * moved on. The entry is re-read before writing because the evening
 * reflection may have landed while the model was thinking, and clobbering a
 * felt score with a stale row would trade a real answer for a word.
 *
 * A user-entered name is never overwritten — their word outranks the model's
 * permanently, the same way their note outranks derived fields in search.
 */
export async function nameEntryPhoto(entryId: string, blob: Blob): Promise<Entry | null> {
  const settings = await getSettings()
  if (!settings.garment_naming) return null

  const guess = await guessGarment(blob)
  if (!guess) return null

  const current = await getEntry(entryId)
  if (!current) return null
  if (current.garment && current.garment.source === 'user') return current

  const updated: Entry = {
    ...current,
    garment: { name: guess.name, source: 'model', confidence: guess.confidence },
  }
  await putEntry(updated)
  return updated
}

/** Entries handled per batch before yielding, as in refingerprint. */
const BATCH = 3

/** Pause between batches; classification is heavier than fingerprinting. */
const BREATH_MS = 250

let backfillRunning = false

/**
 * Names the photos that predate the model, a few at a time after launch.
 *
 * Mirrors `refingerprintOldEntries`: the photographs are already on the
 * device, so a feature that ships later can still reach a log that started
 * earlier. Skips written days, days already named, and stops paying the
 * model's cost entirely when naming is switched off in settings.
 */
export async function nameOldEntries(): Promise<{ named: number; skipped: number }> {
  if (backfillRunning) return { named: 0, skipped: 0 }
  backfillRunning = true

  let named = 0
  let skipped = 0

  try {
    const settings = await getSettings()
    if (!settings.garment_naming) return { named: 0, skipped: 0 }

    const unnamed = (await allEntries()).filter(
      (entry) => entry.photo_id !== null && entry.garment === undefined,
    )

    for (let index = 0; index < unnamed.length; index++) {
      const entry = unnamed[index]!

      try {
        const blob = entry.photo_id ? await getPhoto(entry.photo_id) : undefined
        if (!blob) {
          skipped++
          continue
        }

        const guess = await guessGarment(blob)
        // A null guess is still recorded (as null) so the backfill never
        // re-classifies the same photo on every launch.
        await putEntry({
          ...entry,
          garment: guess ? { name: guess.name, source: 'model', confidence: guess.confidence } : null,
        })
        if (guess) named++
        else skipped++
      } catch {
        skipped++
      }

      if ((index + 1) % BATCH === 0) {
        await new Promise((resolve) => setTimeout(resolve, BREATH_MS))
      }
    }
  } finally {
    backfillRunning = false
  }

  return { named, skipped }
}
