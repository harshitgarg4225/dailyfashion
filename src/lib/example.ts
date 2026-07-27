import type { ChipId, ColorFamily, Entry, EntryItem, FeltScore, Item, TempBand } from '../types'
import { addDays, isWeekend, parseDateKey, type DateKey } from './dates'
import { generateInsights, type GenerateInput, type Insight } from './insights'
import { HIST_BINS } from './signature'

/**
 * A worked fortnight, so the wait has something to look at.
 *
 * The Patterns tab says nothing for the first two weeks — deliberately, because
 * an observation drawn from four days is a guess, and a guess told confidently
 * is how an app teaches someone never to believe it again. But that leaves a
 * new user staring at a countdown with no idea what they are counting toward,
 * and "trust me, it is worth it" is exactly the thing this product refuses to
 * say.
 *
 * So: a made-up person's fortnight, run through the real engine. Not a mockup
 * and not a screenshot — `exampleInsights()` calls `generateInsights` on the
 * entries below, which means the example cannot drift from the product. If a
 * threshold moves, or a card's wording changes, or a rule starts suppressing
 * something, the example changes with it. If the engine stops producing cards
 * for a fortnight this good, the test in `example.test.ts` goes red rather than
 * the screen quietly going blank.
 *
 * The calendar here is fixed rather than relative to today. Weekday and weekend
 * are load-bearing — the confound rules suppress a claim when every wear of a
 * thing landed on the same kind of day — so a log pinned to "three weeks before
 * whenever you happen to open this" would produce different cards on different
 * days of the week, and sometimes none at all. None of the three cards this
 * log produces mentions a date, so nothing about the fixed calendar is visible.
 */

/** The example's own "today". Its log runs the three weeks up to here. */
export const EXAMPLE_TODAY: DateKey = '2025-03-23'

/** First day of the example log. Three weeks back, a Monday. */
const EXAMPLE_START: DateKey = '2025-03-03'

const GREEN_OUTFIT = 'example_outfit_green'
const BLACK_OUTFIT = 'example_outfit_black'

interface Draft {
  /** Days after `EXAMPLE_START`. */
  offset: number
  felt: FeltScore | null
  colour: ColorFamily
  temp: TempBand
  chips?: ChipId[]
  outfit?: string
}

/**
 * Sixteen days across three weeks, five of them missed.
 *
 * Shaped to be ordinary rather than impressive: someone who logs most days,
 * skips a few, wears two things repeatedly and a handful of other things once.
 * Two entries have no evening answer, because that is what a real log looks
 * like — the gate counts fourteen answered evenings, not sixteen photographs,
 * and the example should show the same distinction the count does.
 */
const DRAFTS: Draft[] = [
  // The black jumper: worn constantly, and the days in it come out flat.
  { offset: 0, felt: 3, colour: 'black', temp: 'mild', chips: ['wanted_to_change'], outfit: BLACK_OUTFIT },
  { offset: 6, felt: 2, colour: 'black', temp: 'cold', chips: ['wanted_to_change', 'uncomfortable'], outfit: BLACK_OUTFIT },
  { offset: 10, felt: 3, colour: 'black', temp: 'mild', outfit: BLACK_OUTFIT },
  { offset: 12, felt: 2, colour: 'black', temp: 'cold', chips: ['wanted_to_change'], outfit: BLACK_OUTFIT },
  { offset: 16, felt: 3, colour: 'black', temp: 'mild', outfit: BLACK_OUTFIT },

  // The green jacket: worn half as often, and every day in it lands.
  { offset: 1, felt: 5, colour: 'green', temp: 'cold', chips: ['complimented', 'felt_like_myself'], outfit: GREEN_OUTFIT },
  { offset: 5, felt: 4, colour: 'green', temp: 'mild', chips: ['right_for_the_day'], outfit: GREEN_OUTFIT },
  { offset: 9, felt: 5, colour: 'green', temp: 'cold', chips: ['complimented'], outfit: GREEN_OUTFIT },
  { offset: 13, felt: 4, colour: 'green', temp: 'mild', chips: ['felt_like_myself'], outfit: GREEN_OUTFIT },
  { offset: 17, felt: 5, colour: 'green', temp: 'cold', chips: ['complimented', 'right_for_the_day'], outfit: GREEN_OUTFIT },

  // A sixth black day, in something else black. Keeps the colour card about
  // colour rather than quietly restating the outfit card.
  { offset: 3, felt: 4, colour: 'black', temp: 'mild', chips: ['complimented'] },

  // The rest of the log: worn once, no pattern to find in them.
  { offset: 7, felt: 4, colour: 'blue', temp: 'mild', chips: ['right_for_the_day'] },
  { offset: 14, felt: 3, colour: 'brown', temp: 'cold', chips: ['forgot_wearing_it'] },
  { offset: 19, felt: 3, colour: 'white', temp: 'mild' },

  // Two days photographed and never answered. They count as days, not evenings.
  { offset: 18, felt: null, colour: 'blue', temp: 'mild' },
  { offset: 20, felt: null, colour: 'grey', temp: 'cold' },
]

/**
 * A one-word tag on two wears of each repeated outfit.
 *
 * Enough for the cards to name the thing out loud — which is most of what makes
 * them feel like they are about a wardrobe rather than about a database row —
 * and true to how tagging actually happens: once or twice, in passing, never as
 * a cataloguing chore.
 */
const TAGS: { label: string; offsets: number[] }[] = [
  { label: 'green jacket', offsets: [1, 9] },
  { label: 'black jumper', offsets: [0, 10] },
]

function draftDate(draft: Draft): DateKey {
  return addDays(EXAMPLE_START, draft.offset)
}

function entryId(offset: number): string {
  return `example_entry_${offset}`
}

function toEntry(draft: Draft): Entry {
  const date = draftDate(draft)
  return {
    id: entryId(draft.offset),
    date,
    // No photograph. The example has no images to show and inventing some
    // would be the one dishonest thing on an otherwise honest screen.
    photo_id: null,
    felt_score: draft.felt,
    chips: draft.chips ?? [],
    outfit_id: draft.outfit ?? null,
    context: {
      weekday: parseDateKey(date).getDay(),
      is_weekend: isWeekend(date),
      temp_band: draft.temp,
      logged_hour: 8,
    },
    note: null,
    // The colour family is the only part of the signature any card reads.
    signature: {
      v: 2,
      dhash: '0000000000000000',
      hist: new Array(HIST_BINS).fill(1 / HIST_BINS),
      color: draft.colour,
    },
    created_at: Date.parse(`${date}T08:00:00`),
    rated_at: draft.felt === null ? null : Date.parse(`${date}T21:00:00`),
    backdated: false,
  }
}

export function exampleEntries(): Entry[] {
  return DRAFTS.map(toEntry).sort((a, b) => (a.date < b.date ? 1 : -1))
}

function exampleItems(): Item[] {
  return TAGS.map((tag, index) => ({
    id: `example_item_${index}`,
    label: tag.label,
    created_at: 0,
  }))
}

function exampleEntryItems(): EntryItem[] {
  return TAGS.flatMap((tag, index) =>
    tag.offsets.map((offset) => ({
      entry_id: entryId(offset),
      item_id: `example_item_${index}`,
    })),
  )
}

export function exampleInput(): GenerateInput {
  return {
    entries: exampleEntries(),
    outfits: [],
    items: exampleItems(),
    entryItems: exampleEntryItems(),
    today: EXAMPLE_TODAY,
  }
}

/** What the fortnight adds up to, for the figures above the cards. */
export interface ExampleShape {
  days: number
  evenings: number
  outfits: number
}

export function exampleShape(): ExampleShape {
  const entries = exampleEntries()
  return {
    days: entries.length,
    evenings: entries.filter((entry) => entry.felt_score !== null).length,
    outfits: new Set(entries.map((entry) => entry.outfit_id).filter(Boolean)).size,
  }
}

/** The real cards, from the real engine. */
export function exampleInsights(): Insight[] {
  return generateInsights(exampleInput()).insights
}
