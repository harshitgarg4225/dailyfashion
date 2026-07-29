import type { ChipId, ColorFamily, Entry, EntryItem, Item, Outfit, TempBand } from '../types'
import { chipValenceSum } from './chips'
import { agoLabel, daysBetween, type DateKey } from './dates'

/**
 * The insight engine (J7) — "show me the thing I couldn't see myself."
 *
 * This is the product. Everything else in the app is instrumentation for it:
 * a log that never argues back is a chore with a camera attached.
 *
 * Three rules govern everything below, and every one of them costs us cards:
 *
 *  1. **Thresholds are hard.** No comparison surfaces below 14 total entries
 *     and 5 wears of the thing being talked about. An early insight that turns
 *     out to be noise doesn't just mislead — it teaches the user the app makes
 *     things up, and they never trust the good card on day 40.
 *
 *  2. **Confounds suppress.** If every wear of a jacket was a weekend, we do
 *     not get to say the jacket is why those days felt good. We say nothing.
 *     See `isConfounded`.
 *
 *  3. **Means only.** No p-values, no models, no ML. Every card must be
 *     re-derivable by the user with a pen, because "here is proof you already
 *     know what works" is worthless if the proof is a black box.
 */

// --- Thresholds. Hardcoded, per spec. -------------------------------------

/** Total rated entries before any comparison is allowed to surface. */
export const MIN_TOTAL_ENTRIES = 14

/**
 * The provisional tier: one early observation, honestly labelled.
 *
 * Days four to thirteen are the retention valley — the log is working but
 * saying nothing, which teaches people it never will. The compromise is not
 * to lower the bar quietly; it is ONE card, from seven answered evenings and
 * three wears, that says on its face it is early and will either firm up or
 * be withdrawn. Same arithmetic, same confound checks, same delta — only the
 * sample is smaller, and the card says so louder than anything else on it.
 */
export const PROVISIONAL_MIN_ENTRIES = 7
export const PROVISIONAL_MIN_WEARS = 3

/** Wears of a single outfit/item/colour before it can be compared. */
export const MIN_WEARS_PER_SUBJECT = 5

/** Minimum mean-felt gap from baseline before a difference is worth saying. */
export const MIN_FELT_DELTA = 0.6

/** A subject is "underworn" if it has not been reached for in this long. */
export const UNDERWORN_DAYS = 21

/** Share of wears in one context bucket that makes a claim untrustworthy. */
export const CONFOUND_CONCENTRATION = 0.8

/** Baseline gap between a context bucket and the whole log that matters. */
export const CONFOUND_BASELINE_DELTA = 0.3

/** Consecutive low days before the app offers to soften (J8). */
export const SOFTEN_WINDOW_DAYS = 7
export const SOFTEN_MEAN_BELOW = 2.3

// --- Shapes ---------------------------------------------------------------

export type InsightKind =
  | 'underworn_favourite'
  | 'colour_gap'
  | 'quiet_favourite'
  | 'reliable_letdown'
  | 'comfort_signal'

export interface InsightSubject {
  kind: 'outfit' | 'item' | 'colour'
  id: string
  label: string
  /**
   * True when `label` is a word the user themselves supplied, so a card may
   * say it out loud ("the green jacket"). False means the label is a
   * placeholder and the card should lean on the photo instead.
   */
  named: boolean
  /** Representative entry, so the card can show a photo. */
  entryId: string | null
}

export interface Insight {
  id: string
  kind: InsightKind
  /** What we noticed. One sentence, no hedging, no advice. */
  observation: string
  /** The receipts. Always contains the numbers the observation rests on. */
  evidence: string
  /** Handed back to the user. The app does not get the last word. */
  question: string
  /**
   * How this was worked out, in a sentence the user can check.
   *
   * P4a: the product's claim is "proof you already know what works", and proof
   * that cannot be inspected is just assertion with numbers attached. Every
   * card can show its own arithmetic.
   */
  method: string
  /** Sample size. Every card shows this — non-negotiable. */
  n: number
  subject: InsightSubject
  /** Higher surfaces first. */
  priority: number
  /** Early finding from the provisional tier — shown with its own warning. */
  provisional?: boolean
}

export interface InsightGate {
  unlocked: boolean
  /** True in the seven-to-thirteen window, when one early card may show. */
  provisional: boolean
  ratedEntries: number
  needed: number
  /** True when observations are paused because the log has been heavy (J8). */
  softened: boolean
}

export interface InsightResult {
  gate: InsightGate
  insights: Insight[]
}

// --- Aggregation ----------------------------------------------------------

interface Aggregate {
  /** Rated wears only — an unrated day tells us nothing about how it went. */
  n: number
  meanFelt: number
  complimentRate: number
  wantedChangeRate: number
  forgotRate: number
  meanValence: number
  lastWorn: DateKey
  wearsLast30: number
  weekendShare: number
  tempShares: Map<TempBand | 'unknown', number>
}

function rated(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => e.felt_score !== null)
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function rateOf(entries: readonly Entry[], chip: ChipId): number {
  if (entries.length === 0) return 0
  return entries.filter((e) => e.chips.includes(chip)).length / entries.length
}

function aggregate(entries: readonly Entry[], today: DateKey): Aggregate {
  const scored = rated(entries)
  const tempShares = new Map<TempBand | 'unknown', number>()
  for (const entry of scored) {
    const key = entry.context.temp_band ?? 'unknown'
    tempShares.set(key, (tempShares.get(key) ?? 0) + 1)
  }
  for (const [key, count] of tempShares) {
    tempShares.set(key, count / Math.max(1, scored.length))
  }

  const dates = entries.map((e) => e.date).sort()

  return {
    n: scored.length,
    meanFelt: mean(scored.map((e) => e.felt_score!)),
    complimentRate: rateOf(scored, 'complimented'),
    wantedChangeRate: rateOf(scored, 'wanted_to_change'),
    forgotRate: rateOf(scored, 'forgot_wearing_it'),
    meanValence: mean(scored.map((e) => chipValenceSum(e.chips))),
    lastWorn: dates[dates.length - 1] ?? today,
    wearsLast30: entries.filter((e) => daysBetween(e.date, today) <= 30).length,
    weekendShare:
      scored.length === 0
        ? 0
        : scored.filter((e) => e.context.is_weekend).length / scored.length,
    tempShares,
  }
}

/**
 * Would context explain this away?
 *
 * The spec's example is the whole idea: if all five wears of a jacket were
 * weekends, and weekends run happier than weekdays across the board, then the
 * jacket may be doing nothing at all. We cannot separate the two with this
 * much data, so we decline to claim anything.
 *
 * Note it only suppresses when the confounding bucket *actually differs* from
 * the log as a whole. Someone whose weekends and weekdays feel identical has
 * no weekend confound, and muting their cards would be superstition.
 */
export function isConfounded(
  subject: Aggregate,
  baseline: { meanFelt: number; weekendMeanFelt: number | null; weekdayMeanFelt: number | null; tempMeans: Map<TempBand | 'unknown', number> },
): boolean {
  // Weekday/weekend concentration.
  if (subject.weekendShare >= CONFOUND_CONCENTRATION && baseline.weekendMeanFelt !== null) {
    if (Math.abs(baseline.weekendMeanFelt - baseline.meanFelt) >= CONFOUND_BASELINE_DELTA) return true
  }
  if (1 - subject.weekendShare >= CONFOUND_CONCENTRATION && baseline.weekdayMeanFelt !== null) {
    if (Math.abs(baseline.weekdayMeanFelt - baseline.meanFelt) >= CONFOUND_BASELINE_DELTA) return true
  }

  // Temperature concentration. "You hate this shirt" vs "you hate 38 degrees".
  for (const [band, share] of subject.tempShares) {
    if (band === 'unknown') continue
    if (share < CONFOUND_CONCENTRATION) continue
    const bandMean = baseline.tempMeans.get(band)
    if (bandMean === undefined) continue
    if (Math.abs(bandMean - baseline.meanFelt) >= CONFOUND_BASELINE_DELTA) return true
  }

  return false
}

function baselineOf(all: readonly Entry[]) {
  const scored = rated(all)
  const weekend = scored.filter((e) => e.context.is_weekend)
  const weekday = scored.filter((e) => !e.context.is_weekend)

  const tempMeans = new Map<TempBand | 'unknown', number>()
  for (const band of ['cold', 'mild', 'hot'] as const) {
    const inBand = scored.filter((e) => e.context.temp_band === band)
    if (inBand.length > 0) tempMeans.set(band, mean(inBand.map((e) => e.felt_score!)))
  }

  return {
    meanFelt: mean(scored.map((e) => e.felt_score!)),
    weekendMeanFelt: weekend.length > 0 ? mean(weekend.map((e) => e.felt_score!)) : null,
    weekdayMeanFelt: weekday.length > 0 ? mean(weekday.map((e) => e.felt_score!)) : null,
    tempMeans,
    complimentRate: rateOf(scored, 'complimented'),
    n: scored.length,
  }
}

// --- Grouping -------------------------------------------------------------

interface Group {
  subject: InsightSubject
  entries: Entry[]
}

/**
 * Best available name for an outfit cluster.
 *
 * If the user ever bothered to tag one of its entries — "green jacket" — that
 * word is worth far more than an id, because it lets the card name the thing
 * out loud. Most clusters have no tag at all, and that is fine: the card shows
 * the photo, and a photo identifies an outfit better than any label could.
 */
function outfitLabel(
  group: readonly Entry[],
  items: readonly Item[],
  entryItems: readonly EntryItem[],
): string | null {
  const itemLabels = new Map(items.map((i) => [i.id, i.label]))
  const ids = new Set(group.map((e) => e.id))
  const counts = new Map<string, number>()

  for (const link of entryItems) {
    if (!ids.has(link.entry_id)) continue
    const label = itemLabels.get(link.item_id)
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  if (best) return best

  /*
   * Failing a tag, a garment name the user *confirmed* — typed or corrected
   * themselves — can name the cluster. The model's own guesses deliberately
   * cannot: a card that says "the black cardigan" is making a claim in the
   * user's voice, and only the user's word is licensed to do that. Two wears
   * under the same user-given name is the floor, so one hasty rename cannot
   * caption a whole cluster.
   */
  const named = new Map<string, number>()
  for (const entry of group) {
    if (entry.garment?.source !== 'user') continue
    named.set(entry.garment.name, (named.get(entry.garment.name) ?? 0) + 1)
  }
  for (const [name, count] of named) {
    if (count >= 2 && (best === null || count > bestCount)) {
      best = name
      bestCount = count
    }
  }
  return best
}

function groupByOutfit(
  entries: readonly Entry[],
  items: readonly Item[],
  entryItems: readonly EntryItem[],
): Group[] {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    if (!entry.outfit_id) continue
    const bucket = groups.get(entry.outfit_id) ?? []
    bucket.push(entry)
    groups.set(entry.outfit_id, bucket)
  }

  return [...groups].map(([id, group]) => {
    const label = outfitLabel(group, items, entryItems)
    return {
      subject: {
        kind: 'outfit' as const,
        id,
        label: label ?? 'this one',
        named: label !== null,
        entryId: group[0]?.id ?? null,
      },
      entries: group,
    }
  })
}

function groupByItem(
  entries: readonly Entry[],
  items: readonly Item[],
  entryItems: readonly EntryItem[],
): Group[] {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const itemLabels = new Map(items.map((i) => [i.id, i.label]))
  const groups = new Map<string, Entry[]>()

  for (const link of entryItems) {
    const entry = byId.get(link.entry_id)
    if (!entry) continue
    const bucket = groups.get(link.item_id) ?? []
    bucket.push(entry)
    groups.set(link.item_id, bucket)
  }

  return [...groups]
    .filter(([id]) => itemLabels.has(id))
    .map(([id, group]) => ({
      subject: {
        kind: 'item' as const,
        id,
        label: itemLabels.get(id)!,
        named: true,
        entryId: group[0]?.id ?? null,
      },
      entries: group,
    }))
}

/**
 * Drops item groups that say nothing an outfit group is not already saying.
 *
 * Someone who tags every wear of a jacket "green jacket" creates two groups
 * over the identical set of days — the outfit cluster and the item — and the
 * engine happily writes the same card about each, so the screen reads "1 of 2"
 * and shows one observation twice. That does not look like thoroughness; it
 * looks like the app cannot count.
 *
 * The test is subset, not equality, because a tag on three of five wears is
 * also strictly less evidence about the same thing. An item genuinely worth
 * its own card is one worn across *different* outfits — black jeans under
 * three different tops — and that group is not a subset of any one of them, so
 * it survives.
 */
function withoutRedundantItems(outfitGroups: readonly Group[], itemGroups: readonly Group[]): Group[] {
  const outfitSets = outfitGroups.map((group) => new Set(group.entries.map((entry) => entry.id)))

  return itemGroups.filter((group) => {
    const ids = group.entries.map((entry) => entry.id)
    return !outfitSets.some((outfit) => ids.every((id) => outfit.has(id)))
  })
}

const COLOUR_LABELS: Record<ColorFamily, string> = {
  black: 'black',
  grey: 'grey',
  white: 'white',
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
  brown: 'brown',
}

function groupByColour(entries: readonly Entry[]): Group[] {
  const groups = new Map<ColorFamily, Entry[]>()
  for (const entry of entries) {
    if (!entry.signature) continue
    const bucket = groups.get(entry.signature.color) ?? []
    bucket.push(entry)
    groups.set(entry.signature.color, bucket)
  }
  return [...groups].map(([colour, group]) => ({
    subject: {
      kind: 'colour' as const,
      id: colour,
      label: COLOUR_LABELS[colour],
      named: true,
      entryId: group[0]?.id ?? null,
    },
    entries: group,
  }))
}

// --- Card writers ---------------------------------------------------------
//
// Templated, never generated. Every number in a sentence is passed in from an
// aggregate above, so nothing here can say something the data does not.

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function round1(value: number): string {
  return value.toFixed(1)
}

/**
 * The killer card: you rate it highly and you never reach for it.
 *
 * This is the one that earns the whole product, because it is genuinely
 * invisible from the inside — nobody tracks their own avoidance.
 */
function underwornFavourite(group: Group, agg: Aggregate, baselineMean: number, today: DateKey): Insight | null {
  const delta = agg.meanFelt - baselineMean
  if (delta < MIN_FELT_DELTA) return null

  const idle = daysBetween(agg.lastWorn, today)
  if (idle < UNDERWORN_DAYS && agg.wearsLast30 > 2) return null

  const name = group.subject.named ? `The ${group.subject.label}` : 'This one'
  return {
    id: `underworn:${group.subject.kind}:${group.subject.id}`,
    kind: 'underworn_favourite',
    observation: `${name} sits at the top of your log, and you almost never reach for it.`,
    evidence:
      `${round1(agg.meanFelt)} average across ${agg.n} days, against ${round1(baselineMean)} for everything else. ` +
      `Last worn ${agoLabel(idle)}${agg.wearsLast30 > 0 ? `, and ${agg.wearsLast30} time${agg.wearsLast30 === 1 ? '' : 's'} in the past month` : ''}.`,
    question: 'Worth putting on this week?',
    method: `Compared the average of your ${agg.n} days in it against the average of every other day you have rated. Shown because the gap is at least ${MIN_FELT_DELTA} and it has been a while.`,
    n: agg.n,
    subject: group.subject,
    priority: 100 + delta * 10 + Math.min(idle, 90) / 10,
  }
}

/**
 * The reframe's card: what draws comment vs what you actually reach for.
 *
 * Free to compute — the colour family already falls out of the similarity
 * fingerprint — and it fires early, because colours accumulate wears far
 * faster than any individual garment does.
 */
function colourGap(
  groups: readonly Group[],
  aggregates: Map<string, Aggregate>,
  totalRated: number,
): Insight | null {
  const eligible = groups.filter((g) => {
    const agg = aggregates.get(g.subject.id)
    return agg && agg.n >= MIN_WEARS_PER_SUBJECT
  })
  if (eligible.length < 2) return null

  let bestByCompliment: Group | null = null
  let mostWorn: Group | null = null

  for (const group of eligible) {
    const agg = aggregates.get(group.subject.id)!
    if (!bestByCompliment || agg.complimentRate > aggregates.get(bestByCompliment.subject.id)!.complimentRate) {
      bestByCompliment = group
    }
    if (!mostWorn || agg.n > aggregates.get(mostWorn.subject.id)!.n) {
      mostWorn = group
    }
  }

  if (!bestByCompliment || !mostWorn) return null
  // No gap if the colour that draws comment is already the one you live in.
  if (bestByCompliment.subject.id === mostWorn.subject.id) return null

  const liked = aggregates.get(bestByCompliment.subject.id)!
  const worn = aggregates.get(mostWorn.subject.id)!

  // Needs a real difference in comment rate, not a rounding artefact.
  if (liked.complimentRate - worn.complimentRate < 0.2) return null
  if (liked.complimentRate === 0) return null

  return {
    id: `colour_gap:${bestByCompliment.subject.id}:${mostWorn.subject.id}`,
    kind: 'colour_gap',
    observation: `Compliments cluster on ${bestByCompliment.subject.label}. What you actually wear is ${mostWorn.subject.label}.`,
    evidence:
      `Someone said something nice on ${pct(liked.complimentRate)} of your ${liked.n} ${bestByCompliment.subject.label} days, ` +
      `against ${pct(worn.complimentRate)} of ${worn.n} in ${mostWorn.subject.label}. ` +
      // "That is", not the colour name: a colour label is lower-case by
      // definition, and starting the sentence with one reads as a typo.
      `That is ${worn.n} of your ${totalRated} logged days.`,
    question: `What is keeping the ${bestByCompliment.subject.label} at the back?`,
    method: `Counted how often "someone said something nice" appears on days in each colour, across at least ${MIN_WEARS_PER_SUBJECT} days per colour. The colour you wear most is whichever has the most days.`,
    n: liked.n + worn.n,
    subject: bestByCompliment.subject,
    priority: 90 + (liked.complimentRate - worn.complimentRate) * 20,
  }
}

/** You rate it high and you do wear it. Quieter card, still worth saying. */
function quietFavourite(group: Group, agg: Aggregate, baselineMean: number): Insight | null {
  const delta = agg.meanFelt - baselineMean
  if (delta < MIN_FELT_DELTA) return null

  const name = group.subject.named ? `The ${group.subject.label}` : 'This one'
  return {
    id: `favourite:${group.subject.kind}:${group.subject.id}`,
    kind: 'quiet_favourite',
    observation: `${name} is the steadiest thing in your log.`,
    evidence: `${round1(agg.meanFelt)} average across ${agg.n} days, against ${round1(baselineMean)} across everything else.`,
    question: 'Does that match how you remember it?',
    method: `Compared the average of your ${agg.n} days in it against the average of every other day you have rated.`,
    n: agg.n,
    subject: group.subject,
    priority: 60 + delta * 10,
  }
}

/**
 * The thing that reliably disappoints.
 *
 * Phrased entirely about the garment and the day, never the wearer. "Days in
 * this one come out lower" is a fact about a jacket. Anything closer to the
 * person than that does not ship.
 */
function reliableLetdown(group: Group, agg: Aggregate, baselineMean: number): Insight | null {
  const delta = baselineMean - agg.meanFelt
  if (delta < MIN_FELT_DELTA) return null

  const name = group.subject.named ? `the ${group.subject.label}` : 'this one'
  const changed = agg.wantedChangeRate >= 0.4
    ? ` You wanted to change on ${pct(agg.wantedChangeRate)} of them.`
    : ''

  return {
    id: `letdown:${group.subject.kind}:${group.subject.id}`,
    kind: 'reliable_letdown',
    observation: `Days in ${name} come out lower than your usual.`,
    evidence: `${round1(agg.meanFelt)} average across ${agg.n} days, against ${round1(baselineMean)} otherwise.${changed}`,
    question: 'Is it the clothes, or is it what those days tend to be?',
    method: `Compared the average of your ${agg.n} days in it against the average of every other day you have rated. Suppressed entirely if those days were mostly one kind of day.`,
    n: agg.n,
    subject: group.subject,
    priority: 70 + delta * 10,
  }
}

/** Forgetting you are wearing something is the sleeper signal in the log. */
function comfortSignal(group: Group, agg: Aggregate, baselineForgot: number): Insight | null {
  if (agg.forgotRate < 0.5) return null
  if (agg.forgotRate - baselineForgot < 0.25) return null

  const name = group.subject.named ? `the ${group.subject.label}` : 'this one'
  return {
    id: `comfort:${group.subject.kind}:${group.subject.id}`,
    kind: 'comfort_signal',
    observation: `You stop noticing ${name} once it is on.`,
    evidence: `You marked "forgot I was wearing it" on ${pct(agg.forgotRate)} of ${agg.n} days in it, against ${pct(baselineForgot)} across the log.`,
    question: 'Is that the day you want more of?',
    method: `Counted how often you marked "forgot I was wearing it" on days in it, against how often you mark it at all.`,
    n: agg.n,
    subject: group.subject,
    priority: 50,
  }
}

// --- Entry point ----------------------------------------------------------

/**
 * A dismissal, with the sample size it was dismissed at.
 *
 * F11: "got it" should not mean "never mention this again". A card about a
 * jacket you have since worn twenty more times is a different claim resting on
 * different evidence, and suppressing it forever means the log gets quieter the
 * longer you use it — the exact opposite of the promise.
 */
export interface Dismissal {
  id: string
  /** Sample size when the user dismissed it. */
  n: number
}

/** Extra wears before a dismissed card is allowed to return. */
export const RESURFACE_AFTER_WEARS = 3

export interface GenerateInput {
  entries: readonly Entry[]
  outfits: readonly Outfit[]
  items: readonly Item[]
  entryItems: readonly EntryItem[]
  today: DateKey
  /** Set when the user has paused observations (J8). */
  softened?: boolean
  /** Cards the user has already dismissed, and the evidence at the time. */
  dismissed?: readonly Dismissal[]
}

export function generateInsights(input: GenerateInput): InsightResult {
  const { entries, items, entryItems, today } = input
  const scored = rated(entries)

  const gate: InsightGate = {
    unlocked: scored.length >= MIN_TOTAL_ENTRIES,
    provisional:
      scored.length >= PROVISIONAL_MIN_ENTRIES && scored.length < MIN_TOTAL_ENTRIES,
    ratedEntries: scored.length,
    needed: MIN_TOTAL_ENTRIES,
    softened: input.softened === true,
  }

  if ((!gate.unlocked && !gate.provisional) || gate.softened) return { gate, insights: [] }

  // The provisional window relaxes the sample floors — never the delta or
  // the confound checks — and surfaces at most one card, marked as early.
  const minWears = gate.unlocked ? MIN_WEARS_PER_SUBJECT : PROVISIONAL_MIN_WEARS

  const baseline = baselineOf(entries)
  const dismissedAt = new Map((input.dismissed ?? []).map((d) => [d.id, d.n]))
  const insights: Insight[] = []

  const outfitGroups = groupByOutfit(entries, items, entryItems)
  const groups = [
    ...outfitGroups,
    ...withoutRedundantItems(outfitGroups, groupByItem(entries, items, entryItems)),
  ]

  for (const group of groups) {
    const agg = aggregate(group.entries, today)
    if (agg.n < minWears) continue
    if (isConfounded(agg, baseline)) continue

    // A "baseline" that includes the subject drags toward it and shrinks every
    // delta. Compare against the rest of the log instead.
    const others = entries.filter((e) => !group.entries.some((g) => g.id === e.id))
    const otherScored = rated(others)
    if (otherScored.length < minWears) continue
    const otherMean = mean(otherScored.map((e) => e.felt_score!))
    const otherForgot = rateOf(otherScored, 'forgot_wearing_it')

    const candidates = [
      underwornFavourite(group, agg, otherMean, today),
      quietFavourite(group, agg, otherMean),
      reliableLetdown(group, agg, otherMean),
      comfortSignal(group, agg, otherForgot),
    ].filter((card): card is Insight => card !== null)

    // Underworn and quiet-favourite are the same finding at different volumes.
    // Never show both about one subject.
    const hasUnderworn = candidates.some((c) => c.kind === 'underworn_favourite')
    for (const card of candidates) {
      if (hasUnderworn && card.kind === 'quiet_favourite') continue
      insights.push(card)
    }
  }

  // Colour is computed over the whole log rather than per group, since the
  // comparison is between colours.
  const colourGroups = groupByColour(entries)
  const colourAggregates = new Map<string, Aggregate>()
  for (const group of colourGroups) {
    const agg = aggregate(group.entries, today)
    if (isConfounded(agg, baseline)) continue
    colourAggregates.set(group.subject.id, agg)
  }
  const colourCard = colourGap(colourGroups, colourAggregates, scored.length)
  if (colourCard) insights.push(colourCard)

  const surfaced = insights
    .filter((card) => {
      const at = dismissedAt.get(card.id)
      if (at === undefined) return true
      // Only return once there is meaningfully more evidence than last time.
      return card.n >= at + RESURFACE_AFTER_WEARS
    })
    .sort((a, b) => b.priority - a.priority)

  if (!gate.unlocked) {
    // Provisional: the single best card, wearing its earliness openly.
    return {
      gate,
      insights: surfaced.slice(0, 1).map((card) => ({ ...card, provisional: true })),
    }
  }

  return { gate, insights: surfaced }
}

/**
 * J8's softening trigger.
 *
 * When the log has been heavy for a week or more, the correct response is to
 * ask for less — pause the nudges, drop the cards — not to nudge harder. An
 * app that pushes into a low stretch is doing damage, and no retention number
 * makes that an acceptable trade.
 */
export function shouldOfferSoftening(entries: readonly Entry[], today: DateKey): boolean {
  const recent = rated(entries).filter((e) => daysBetween(e.date, today) <= SOFTEN_WINDOW_DAYS)
  if (recent.length < 4) return false
  return mean(recent.map((e) => e.felt_score!)) <= SOFTEN_MEAN_BELOW
}

/** Used by the log header. Neutral count, never a run or a target. */
export function loopCompletion(entries: readonly Entry[]): number {
  if (entries.length === 0) return 0
  return rated(entries).length / entries.length
}
