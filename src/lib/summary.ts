import type { ColorFamily, Entry } from '../types'
import { daysBetween, type DateKey } from './dates'
import { MIN_TOTAL_ENTRIES } from './insights'
import { SHORTLIST_MIN_ENTRIES } from './shortlist'

/**
 * What the log has actually built, stated plainly.
 *
 * This exists because the product asks for a fortnight of effort before it says
 * anything, and "trust me, it gets good" is not a thing a person should have to
 * accept from an app. The answer is to show the accumulation itself: how much
 * is recorded, what it can already tell, and what the next thing to unlock is.
 *
 * Every number here is a count of something the user did, never a judgement of
 * how well they did it. There is no streak, no completion percentage presented
 * as a target, and nothing that goes down when someone misses a week (J9).
 */

export interface Milestone {
  /** Entries needed. */
  at: number
  /** What arrives at that point, in the user's terms. */
  unlocks: string
  reached: boolean
  remaining: number
}

export interface ColourShare {
  colour: ColorFamily
  days: number
  complimentedDays: number
}

export interface Summary {
  daysLogged: number
  eveningsAnswered: number
  /** Photographed vs written — both are days, shown so neither looks like the "real" one. */
  photographed: number
  written: number
  /** Span from the first entry to today, in days. Null on an empty log. */
  spanDays: number | null
  firstEntry: DateKey | null
  outfitsRecognised: number
  itemsNamed: number
  /**
   * Share of days that received an evening answer.
   *
   * The single number that decides whether this product works — without the
   * evening half there is nothing to observe. Shown to the user as information,
   * never as a target to hit.
   */
  loopCompletion: number
  colours: ColourShare[]
  /** The next thing the log will be able to do, or null once all are reached. */
  nextMilestone: Milestone | null
  milestones: Milestone[]
}

/** Milestones in the order they arrive. */
export const MILESTONE_REVIEW = 30

function milestone(at: number, unlocks: string, have: number): Milestone {
  return { at, unlocks, reached: have >= at, remaining: Math.max(0, at - have) }
}

export interface SummaryInput {
  entries: readonly Entry[]
  outfitCount: number
  itemCount: number
  today: DateKey
}

export function buildSummary(input: SummaryInput): Summary {
  const { entries, outfitCount, itemCount, today } = input

  const answered = entries.filter((entry) => entry.felt_score !== null)
  const dates = entries.map((entry) => entry.date).sort()
  const first = dates[0] ?? null

  // Colour is only known for photographed days; written days simply do not
  // participate rather than being counted as a missing colour.
  const byColour = new Map<ColorFamily, { days: number; complimentedDays: number }>()
  for (const entry of entries) {
    if (!entry.signature) continue
    const bucket = byColour.get(entry.signature.color) ?? { days: 0, complimentedDays: 0 }
    bucket.days += 1
    if (entry.chips.includes('complimented')) bucket.complimentedDays += 1
    byColour.set(entry.signature.color, bucket)
  }

  const colours: ColourShare[] = [...byColour]
    .map(([colour, counts]) => ({ colour, ...counts }))
    .sort((a, b) => b.days - a.days)

  const milestones = [
    milestone(SHORTLIST_MIN_ENTRIES, 'a shortlist of what already worked', entries.length),
    milestone(MIN_TOTAL_ENTRIES, 'observations drawn from your own days', answered.length),
    milestone(MILESTONE_REVIEW, 'a month worth looking back over', entries.length),
  ]

  return {
    daysLogged: entries.length,
    eveningsAnswered: answered.length,
    photographed: entries.filter((entry) => entry.photo_id !== null).length,
    written: entries.filter((entry) => entry.photo_id === null).length,
    spanDays: first ? daysBetween(first, today) : null,
    firstEntry: first,
    outfitsRecognised: outfitCount,
    itemsNamed: itemCount,
    loopCompletion: entries.length === 0 ? 0 : answered.length / entries.length,
    colours,
    nextMilestone: milestones.find((m) => !m.reached) ?? null,
    milestones,
  }
}
