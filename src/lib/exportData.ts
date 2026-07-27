import {
  allEntries,
  allEntryItems,
  allItems,
  allOutfits,
  getPhoto,
  newId,
  putEntry,
  putPhoto,
  recomputeOutfit,
} from '../db/db'
import { chipLabel } from './chips'
import { parseDateKey } from './dates'
import { createZip, csvRow, readZip, type ZipEntry } from './zip'
import type { Entry, EntryItem, Item, Outfit } from '../types'

/**
 * J10: "get my stuff out."
 *
 * The export is deliberately boring and complete — a folder of JPEGs you can
 * scroll in any file browser, plus a CSV any spreadsheet opens. No proprietary
 * format, no re-import requirement, nothing that only this app can read. If
 * someone wants to leave, the door opens outward without asking why.
 */

function photoFilename(date: string, index: number, entryId: string): string {
  // Date-prefixed so the folder sorts chronologically anywhere, with a short
  // id suffix to keep multiple entries on one day distinct.
  const suffix = entryId.split('_')[1]?.slice(0, 8) ?? String(index)
  return `photos/${date}_${suffix}.jpg`
}

export interface ExportResult {
  blob: Blob
  filename: string
  entryCount: number
}

export async function buildExport(
  /** Called as each photograph is packed, so the UI can say where it is. */
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const [entries, outfits, items, entryItems] = await Promise.all([
    allEntries(),
    allOutfits(),
    allItems(),
    allEntryItems(),
  ])

  const itemLabels = new Map(items.map((i) => [i.id, i.label]))
  const tagsByEntry = new Map<string, string[]>()
  for (const link of entryItems) {
    const label = itemLabels.get(link.item_id)
    if (!label) continue
    const bucket = tagsByEntry.get(link.entry_id) ?? []
    bucket.push(label)
    tagsByEntry.set(link.entry_id, bucket)
  }

  const files: ZipEntry[] = []

  const header = csvRow([
    'date',
    'time',
    'felt_1_to_5',
    'what_happened',
    'tags',
    'outfit_group',
    'dominant_colour',
    'temperature',
    'day_type',
    'note',
    'photo_file',
  ])

  const rows: string[] = [header]
  /*
   * Recorded explicitly rather than re-derived on import.
   *
   * The filename rule is a detail of this function; making the importer
   * reproduce it means any future change to naming silently orphans every
   * photograph in every archive already in the wild.
   */
  const photoNames: Record<string, string> = {}

  // Oldest first in the CSV — a log reads forwards even though the app shows
  // it newest-first.
  const chronological = [...entries].reverse()

  for (const [index, entry] of chronological.entries()) {
    // A written day has no image; it still gets a full row in the spreadsheet.
    const photoName = entry.photo_id ? photoFilename(entry.date, index, entry.id) : ''
    if (photoName) photoNames[entry.id] = photoName
    const created = new Date(entry.created_at)

    rows.push(
      csvRow([
        entry.date,
        `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`,
        entry.felt_score,
        entry.chips.map(chipLabel).join('; '),
        (tagsByEntry.get(entry.id) ?? []).join('; '),
        entry.outfit_id ?? '',
        entry.signature?.color ?? '',
        entry.context.temp_band ?? '',
        entry.context.is_weekend ? 'weekend' : 'weekday',
        entry.note ?? '',
        photoName,
      ]),
    )

    const blob = entry.photo_id ? await getPhoto(entry.photo_id) : undefined
    if (blob) {
      files.push({
        name: photoName,
        data: new Uint8Array(await blob.arrayBuffer()),
        date: parseDateKey(entry.date),
      })
    }

    onProgress?.(index + 1, chronological.length)
    // Yield between photographs so the progress text actually repaints; a
    // tight loop over 200 images would otherwise freeze the button it replaced.
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const encoder = new TextEncoder()
  files.unshift({ name: 'log.csv', data: encoder.encode(rows.join('\r\n')) })

  /*
   * The CSV is for the user; this is for the app.
   *
   * A spreadsheet cannot round-trip an image fingerprint, an outfit cluster or
   * a stable id, so importing from the CSV alone would silently discard the
   * accumulated knowledge that makes the log worth keeping. The JSON carries
   * everything, and costs a few kilobytes.
   */
  files.unshift({
    name: 'log.json',
    data: encoder.encode(
      JSON.stringify({ version: 1, entries, outfits, items, entryItems, photoNames }, null, 2),
    ),
  })

  files.push({
    name: 'README.txt',
    data: encoder.encode(
      [
        'Daily Fashion export',
        '',
        `${entries.length} day${entries.length === 1 ? '' : 's'} logged.`,
        `${outfits.length} outfit group${outfits.length === 1 ? '' : 's'}.`,
        '',
        'log.csv  — one row per day, oldest first.',
        'photos/  — one image per day, named by date.',
        '',
        'This export was made on your device. Nothing was uploaded to produce it.',
      ].join('\n'),
    ),
  })

  const stamp = new Date().toISOString().slice(0, 10)
  return {
    blob: createZip(files),
    filename: `daily-fashion-${stamp}.zip`,
    entryCount: entries.length,
  }
}

/** Hands the archive to the browser's download path. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the download a moment to start before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// --- import ----------------------------------------------------------------

/**
 * The other half of J10, and the migration story for a product with no sync.
 *
 * Export alone means a user can leave. Without import they cannot come back,
 * cannot move to a new phone, and cannot recover from the browser eviction
 * this app spends real effort trying to prevent. For something whose entire
 * value is accumulated history, that is not a missing nicety.
 *
 * Merges rather than replaces, and skips ids that already exist, so importing
 * the same archive twice is harmless.
 */
export interface ImportResult {
  added: number
  skipped: number
}

interface ExportManifest {
  version: number
  entries: Entry[]
  outfits: Outfit[]
  items: Item[]
  entryItems: EntryItem[]
  photoNames: Record<string, string>
}

export async function importArchive(blob: Blob): Promise<ImportResult> {
  const files = await readZip(blob)

  const manifestFile = files.find((f) => f.name === 'log.json')
  if (!manifestFile) throw new Error('missing log.json')

  const manifest = JSON.parse(new TextDecoder().decode(manifestFile.data)) as ExportManifest
  if (!Array.isArray(manifest.entries)) throw new Error('unreadable log.json')

  const photos = new Map(
    files.filter((f) => f.name.startsWith('photos/')).map((f) => [f.name, f.data]),
  )

  const existing = new Set((await allEntries()).map((entry) => entry.id))

  let added = 0
  let skipped = 0
  const touchedOutfits = new Set<string>()

  for (const entry of manifest.entries) {
    if (existing.has(entry.id)) {
      skipped += 1
      continue
    }

    const name = manifest.photoNames?.[entry.id]
    const image = name ? photos.get(name) : undefined

    /*
     * A photographed day whose image did not survive is not worth restoring —
     * the photo is the record. A written day never had one, and restoring it
     * is the whole point.
     */
    if (name && !image) {
      skipped += 1
      continue
    }

    let photoId: string | null = null
    if (image) {
      photoId = newId('photo')
      await putPhoto(photoId, new Blob([image], { type: 'image/jpeg' }))
    }
    await putEntry({ ...entry, photo_id: photoId })
    if (entry.outfit_id) touchedOutfits.add(entry.outfit_id)
    added += 1
  }

  for (const outfitId of touchedOutfits) await recomputeOutfit(outfitId)

  return { added, skipped }
}
