import type { Entry, TempBand } from '../types'
import { daysBetween, isWeekend, type DateKey } from './dates'

/**
 * J6: "help me decide what to wear today, from what already worked."
 *
 * A shortlist, not advice. Three photographs of days that went well in
 * conditions like today's, ranked by how they actually felt. The app has no
 * opinion about clothes and never generates a sentence of styling text — it
 * just hands back the user's own evidence and gets out of the way.
 */

/** Entries required before the tab appears at all. */
export const SHORTLIST_MIN_ENTRIES = 10

export const SHORTLIST_SIZE = 3

/** Anything worn this recently is not a suggestion, it is a memory. */
const TOO_RECENT_DAYS = 3

export interface ShortlistContext {
  today: DateKey
  tempBand: TempBand | null
}

export interface ShortlistResult {
  unlocked: boolean
  entriesNeeded: number
  /** True when the picks were filtered by matching temperature. */
  weatherMatched: boolean
  picks: Entry[]
}

/**
 * Ranking is intentionally simple and legible: how the day felt, with a small
 * nudge toward things not worn lately.
 *
 * The recency nudge is the same instinct behind J7's killer card — the log
 * consistently shows people rate things highly and then fail to reach for
 * them. Surfacing only the top three by felt-score would keep handing back the
 * same two outfits forever.
 */
function rank(entry: Entry, today: DateKey): number {
  const felt = entry.felt_score ?? 0
  const idle = Math.min(daysBetween(entry.date, today), 60)
  return felt * 10 + idle / 30
}

export function buildShortlist(
  entries: readonly Entry[],
  context: ShortlistContext,
): ShortlistResult {
  if (entries.length < SHORTLIST_MIN_ENTRIES) {
    return {
      unlocked: false,
      entriesNeeded: SHORTLIST_MIN_ENTRIES - entries.length,
      weatherMatched: false,
      picks: [],
    }
  }

  const weekendToday = isWeekend(context.today)

  const eligible = entries.filter((entry) => {
    if (entry.felt_score === null) return false
    // Only surface days that actually went well. A shortlist of mediocre days
    // is worse than no shortlist.
    if (entry.felt_score < 4) return false
    if (daysBetween(entry.date, context.today) < TOO_RECENT_DAYS) return false
    return true
  })

  const sameDayType = eligible.filter((e) => e.context.is_weekend === weekendToday)

  // Prefer same-temperature days, then same day-type, then anything good.
  // Each fallback is only taken when the tighter filter cannot fill the list,
  // so the header can honestly describe what the user is looking at.
  let pool = sameDayType
  let weatherMatched = false

  if (context.tempBand) {
    const sameWeather = sameDayType.filter((e) => e.context.temp_band === context.tempBand)
    if (sameWeather.length >= SHORTLIST_SIZE) {
      pool = sameWeather
      weatherMatched = true
    }
  }

  if (pool.length < SHORTLIST_SIZE) pool = eligible

  const picks = [...pool].sort((a, b) => rank(b, context.today) - rank(a, context.today))

  // One entry per outfit cluster — three photos of the same jacket is not a
  // shortlist, it is a stutter.
  const seenOutfits = new Set<string>()
  const deduped: Entry[] = []
  for (const entry of picks) {
    if (entry.outfit_id) {
      if (seenOutfits.has(entry.outfit_id)) continue
      seenOutfits.add(entry.outfit_id)
    }
    deduped.push(entry)
    if (deduped.length === SHORTLIST_SIZE) break
  }

  return {
    unlocked: true,
    entriesNeeded: 0,
    weatherMatched: weatherMatched && deduped.length === SHORTLIST_SIZE,
    picks: deduped,
  }
}

export interface TrackRecord {
  /** Times this outfit cluster has been worn, this entry included. */
  wears: number
  /** Of the rated wears, how many were felt 4 or 5. */
  goodDays: number
}

/**
 * The pick's evidence, computed rather than asserted.
 *
 * This is what turns the morning screen from "the app suggests" into "your
 * own record says": worn four times, three went well. Counts only — the same
 * licence as the week recap — and null for an unclustered entry, because a
 * single day is a memory, not a record, and a "record" of one would dress
 * anecdote as evidence.
 */
export function trackRecord(entry: Entry, entries: readonly Entry[]): TrackRecord | null {
  if (!entry.outfit_id) return null
  const wears = entries.filter((e) => e.outfit_id === entry.outfit_id)
  if (wears.length < 2) return null
  return {
    wears: wears.length,
    goodDays: wears.filter((e) => e.felt_score !== null && e.felt_score >= 4).length,
  }
}
