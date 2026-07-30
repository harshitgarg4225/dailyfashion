import type { Entry } from '../types'

/**
 * The style snapshot: what a consented user's wardrobe looks like as
 * analytics, with the photographs left entirely out of it.
 *
 * This is the sponsor-facing answer to "what do our users actually wear" —
 * garment words with day counts ("wool coat, 12 days") and dominant colours.
 * It is derived from the on-device garment naming and the image signature's
 * colour band, both of which already exist for the app's own features; the
 * snapshot only counts them.
 *
 * The caps are the privacy design: ten garment words and five colours,
 * counts only, no dates, no ordering by recency, no photo, no note, no felt
 * score. A snapshot that cannot carry much cannot leak much.
 */

export interface StyleSnapshot {
  garments: Array<{ name: string; days: number }>
  colours: Array<{ colour: string; days: number }>
  days_logged: number
}

const MAX_GARMENTS = 10
const MAX_COLOURS = 5

export function styleSnapshot(entries: readonly Entry[]): StyleSnapshot {
  const garmentDays = new Map<string, number>()
  const colourDays = new Map<string, number>()

  for (const entry of entries) {
    // Multi-garment names arrive as "wool coat + white tee"; each word earns
    // its own count, which is what a per-garment profile means.
    if (entry.garment) {
      for (const part of entry.garment.name.split(' + ')) {
        const name = part.trim()
        if (name) garmentDays.set(name, (garmentDays.get(name) ?? 0) + 1)
      }
    }
    const colour = entry.signature?.color
    if (colour) colourDays.set(colour, (colourDays.get(colour) ?? 0) + 1)
  }

  const top = <K extends string>(counts: Map<string, number>, cap: number, key: K) =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, cap)
      .map(([value, days]) => ({ [key]: value, days }) as Record<K, string> & { days: number })

  return {
    garments: top(garmentDays, MAX_GARMENTS, 'name'),
    colours: top(colourDays, MAX_COLOURS, 'colour'),
    days_logged: entries.length,
  }
}

/** Days between style snapshots — a weekly rhythm, not a live feed. */
export const STYLE_SNAPSHOT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/** A snapshot below this many days would be noise about nobody. */
export const STYLE_SNAPSHOT_MIN_ENTRIES = 5
