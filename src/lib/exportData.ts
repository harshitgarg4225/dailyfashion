import { allEntries, allEntryItems, allItems, allOutfits, getPhoto } from '../db/db'
import { chipLabel } from './chips'
import { parseDateKey } from './dates'
import { createZip, csvRow, type ZipEntry } from './zip'

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

export async function buildExport(): Promise<ExportResult> {
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

  // Oldest first in the CSV — a log reads forwards even though the app shows
  // it newest-first.
  const chronological = [...entries].reverse()

  for (const [index, entry] of chronological.entries()) {
    const photoName = photoFilename(entry.date, index, entry.id)
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

    const blob = await getPhoto(entry.photo_id)
    if (blob) {
      files.push({
        name: photoName,
        data: new Uint8Array(await blob.arrayBuffer()),
        date: parseDateKey(entry.date),
      })
    }
  }

  const encoder = new TextEncoder()
  files.unshift({ name: 'log.csv', data: encoder.encode(rows.join('\r\n')) })

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
