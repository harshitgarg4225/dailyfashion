import type { ChipId, ColorFamily, Entry, FeltScore, TempBand } from '../types'
import { addDays, isWeekend } from '../lib/dates'
import { HIST_BINS } from '../lib/signature'

/** Test fixtures. Deterministic — no random data in assertions about thresholds. */

let counter = 0

export function resetFactory(): void {
  counter = 0
}

export interface EntryOverrides {
  date?: string
  felt?: FeltScore | null
  chips?: ChipId[]
  outfitId?: string | null
  colour?: ColorFamily
  temp?: TempBand | null
  weekend?: boolean
}

export function makeEntry(overrides: EntryOverrides = {}): Entry {
  counter += 1
  const date = overrides.date ?? addDays('2025-01-06', counter)
  const felt = overrides.felt === undefined ? 3 : overrides.felt

  return {
    id: `entry_${counter}`,
    date,
    photo_id: `photo_${counter}`,
    felt_score: felt,
    chips: overrides.chips ?? [],
    outfit_id: overrides.outfitId ?? null,
    context: {
      weekday: 1,
      is_weekend: overrides.weekend ?? isWeekend(date),
      temp_band: overrides.temp === undefined ? 'mild' : overrides.temp,
      logged_hour: 8,
    },
    note: null,
    signature: {
      dhash: '0123456789abcdef',
      hist: new Array(HIST_BINS).fill(1 / HIST_BINS),
      color: overrides.colour ?? 'grey',
    },
    created_at: Date.parse(`${date}T08:00:00`),
    rated_at: felt === null ? null : Date.parse(`${date}T21:00:00`),
    backdated: false,
  }
}

/** N entries on consecutive days, all alike. Useful for filling a baseline. */
export function makeEntries(count: number, overrides: EntryOverrides = {}): Entry[] {
  return Array.from({ length: count }, () => makeEntry(overrides))
}
