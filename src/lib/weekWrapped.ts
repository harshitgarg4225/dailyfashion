import type { ChipId, ColorFamily, Entry } from '../types'
import { addDays, daysBetween, type DateKey } from './dates'

/**
 * The week, recounted — not analysed.
 *
 * This is the one place the product is allowed to speak before it has earned
 * the right to make claims, and the distinction is the whole design. Patterns
 * says nothing for a fortnight because an observation drawn from five days is a
 * guess. A weekly recap does not have that problem, because **it never makes an
 * observation**. It reports what happened: seven days, what was worn, what was
 * repeated, what was said. Every line is a count of a thing that occurred.
 *
 * The temptation is obvious and must be refused. A "week wrapped" that says
 * "green is clearly your colour" would be a backdoor around the fourteen-day
 * gate, arriving twice as often and with half the evidence — and it would teach
 * exactly the scepticism the gate exists to prevent. So there is no mean felt
 * score in here, no comparison, no superlative that rests on an average. The
 * numbers are frequencies, and frequencies of seven days are simply true.
 *
 * What it *is* for: a reason to come back on a Sunday, and something worth
 * showing somebody. Both matter to a product whose payoff is otherwise a
 * fortnight away.
 */

/** Days in the window. A week, because that is the unit people already live in. */
export const WEEK_DAYS = 7

/**
 * Days that must be logged before the recap appears at all.
 *
 * Three is low on purpose — this is a recap, not a finding, so the bar is
 * "enough to be worth reading" rather than "enough to be fair". Below it the
 * week is just a list of the two days you logged, which nobody wants.
 */
export const MIN_DAYS_FOR_WRAP = 3

export interface WornColour {
  colour: ColorFamily
  days: number
}

export interface RepeatedOutfit {
  outfitId: string
  times: number
  /** An entry to show the photograph from. */
  entryId: string
  photoId: string | null
}

export interface WeekWrapped {
  /** Inclusive window. */
  from: DateKey
  to: DateKey
  daysLogged: number
  eveningsAnswered: number
  photographed: number
  written: number
  /** Colours worn, most days first. Photographed days only. */
  colours: WornColour[]
  /** Outfits worn more than once this week, most worn first. */
  repeats: RepeatedOutfit[]
  /** How many days carried each event, most frequent first. Zero counts dropped. */
  events: { chip: ChipId; days: number }[]
  /** Photographs from the week, newest first — the strip on the card. */
  photoIds: string[]
  /** False when the week is too thin to be worth showing. */
  enough: boolean
}

function inWindow(entry: Entry, from: DateKey, to: DateKey): boolean {
  return daysBetween(from, entry.date) >= 0 && daysBetween(entry.date, to) >= 0
}

/**
 * @param today Anchors the window. The week ends today rather than on a fixed
 *   weekday, so the recap is available whenever someone opens it instead of
 *   being a thing they can miss.
 */
export function buildWeekWrapped(entries: readonly Entry[], today: DateKey): WeekWrapped {
  const from = addDays(today, -(WEEK_DAYS - 1))
  const week = entries
    .filter((entry) => inWindow(entry, from, today))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const byColour = new Map<ColorFamily, number>()
  for (const entry of week) {
    if (!entry.signature) continue
    byColour.set(entry.signature.color, (byColour.get(entry.signature.color) ?? 0) + 1)
  }

  const byOutfit = new Map<string, Entry[]>()
  for (const entry of week) {
    if (!entry.outfit_id) continue
    const bucket = byOutfit.get(entry.outfit_id) ?? []
    bucket.push(entry)
    byOutfit.set(entry.outfit_id, bucket)
  }

  const byChip = new Map<ChipId, number>()
  for (const entry of week) {
    // A chip counts once per day however many times it appears on one.
    for (const chip of new Set(entry.chips)) {
      byChip.set(chip, (byChip.get(chip) ?? 0) + 1)
    }
  }

  return {
    from,
    to: today,
    daysLogged: week.length,
    eveningsAnswered: week.filter((entry) => entry.felt_score !== null).length,
    photographed: week.filter((entry) => entry.photo_id !== null).length,
    written: week.filter((entry) => entry.photo_id === null).length,
    colours: [...byColour]
      .map(([colour, days]) => ({ colour, days }))
      .sort((a, b) => b.days - a.days || a.colour.localeCompare(b.colour)),
    repeats: [...byOutfit]
      .filter(([, group]) => group.length > 1)
      .map(([outfitId, group]) => ({
        outfitId,
        times: group.length,
        entryId: group[0]!.id,
        photoId: group.find((entry) => entry.photo_id !== null)?.photo_id ?? null,
      }))
      .sort((a, b) => b.times - a.times),
    events: [...byChip]
      .map(([chip, days]) => ({ chip, days }))
      .filter((event) => event.days > 0)
      .sort((a, b) => b.days - a.days || a.chip.localeCompare(b.chip)),
    photoIds: week
      .map((entry) => entry.photo_id)
      .filter((id): id is string => id !== null),
    enough: week.length >= MIN_DAYS_FOR_WRAP,
  }
}
