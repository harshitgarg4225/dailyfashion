import type { ChipId, ColorFamily, Entry, EntryItem, Item } from '../types'
import { CHIPS, chipLabel } from './chips'
import { mediumLabel, shortLabel } from './dates'

/**
 * Finding a day again.
 *
 * The log has had no search at all, which is a real hole once it is a year
 * long: written entries are the most considered thing anybody puts in here —
 * "grey coat again, warmer than it looked" — and until now they could only be
 * found by scrolling to the right month.
 *
 * Deliberately not a semantic model. The obvious reach is an embedding, or a
 * small language model, but almost every real query over one's own log is a
 * word one actually wrote or a fact the app already holds structured: a colour,
 * an event, a date, the word someone tagged an outfit with. Matching those
 * costs a few kilobytes and no download, works offline on the oldest phone that
 * runs the app, and — unlike a model — can show exactly why a day matched.
 *
 * That last part is the same argument the insight engine makes. A search that
 * surfaces a day for reasons it cannot explain is the "trust me" this product
 * refuses everywhere else.
 */

export interface SearchMatch {
  entry: Entry
  /** Higher is better. Relative only — never shown to the user. */
  score: number
  /** Why this day matched, in the user's terms. */
  reasons: string[]
}

export interface SearchIndexInput {
  entries: readonly Entry[]
  items: readonly Item[]
  entryItems: readonly EntryItem[]
}

/**
 * Field weights.
 *
 * A word the user typed themselves outranks anything the app derived. Their
 * note is the only field in the log written deliberately, and a search that
 * ranked an automatic colour guess above it would feel like being argued with.
 */
const WEIGHT_NOTE = 10
const WEIGHT_TAG = 8
const WEIGHT_CHIP = 4
const WEIGHT_COLOUR = 3
const WEIGHT_DATE = 3

/** A whole-word hit beats a prefix hit, so "red" does not rank on "reduce". */
const EXACT_BONUS = 1.6

const COLOURS: ColorFamily[] = [
  'black', 'grey', 'white', 'red', 'orange', 'yellow',
  'green', 'blue', 'purple', 'pink', 'brown',
]

/**
 * Words that carry no signal in a query over one's own clothes.
 *
 * Kept very short on purpose. An aggressive stop list silently drops terms
 * people meant — "the black one" is a real query and "one" is doing work in it.
 */
const NOISE = new Set(['a', 'an', 'and', 'the', 'i', 'my', 'it', 'was', 'is', 'of', 'to', 'in', 'on'])

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((token) => token.length > 1 && !NOISE.has(token))
}

/** Scores one field. Returns 0 when nothing in it matches. */
function scoreField(haystack: string, tokens: readonly string[], weight: number): number {
  if (!haystack) return 0
  const lower = haystack.toLowerCase()
  let score = 0

  for (const token of tokens) {
    const at = lower.indexOf(token)
    if (at === -1) continue
    // A hit at a word boundary is what the user almost certainly meant.
    const before = at === 0 ? ' ' : lower[at - 1]!
    const after = lower[at + token.length] ?? ' '
    const wholeWord = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)
    score += weight * (wholeWord ? EXACT_BONUS : 1)
  }

  return score
}

/** The chips whose label matches, so "compliment" finds complimented days. */
function matchingChips(tokens: readonly string[]): Set<ChipId> {
  const hits = new Set<ChipId>()
  for (const chip of CHIPS) {
    if (scoreField(chip.label, tokens, 1) > 0) hits.add(chip.id)
  }
  return hits
}

export function searchEntries(
  input: SearchIndexInput,
  query: string,
): SearchMatch[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const labelById = new Map(input.items.map((item) => [item.id, item.label]))
  const tagsByEntry = new Map<string, string[]>()
  for (const link of input.entryItems) {
    const label = labelById.get(link.item_id)
    if (!label) continue
    tagsByEntry.set(link.entry_id, [...(tagsByEntry.get(link.entry_id) ?? []), label])
  }

  const wantedChips = matchingChips(tokens)
  const wantedColours = COLOURS.filter((colour) => tokens.includes(colour))

  const matches: SearchMatch[] = []

  for (const entry of input.entries) {
    let score = 0
    const reasons: string[] = []

    const noteScore = scoreField(entry.note ?? '', tokens, WEIGHT_NOTE)
    if (noteScore > 0) {
      score += noteScore
      reasons.push('what you wrote')
    }

    const tags = tagsByEntry.get(entry.id) ?? []
    const tagScore = tags.reduce((total, tag) => total + scoreField(tag, tokens, WEIGHT_TAG), 0)
    if (tagScore > 0) {
      score += tagScore
      reasons.push(tags.join(', '))
    }

    const colour = entry.signature?.color
    if (colour && wantedColours.includes(colour)) {
      score += WEIGHT_COLOUR * EXACT_BONUS
      reasons.push(colour)
    }

    const chipHits = entry.chips.filter((chip) => wantedChips.has(chip))
    if (chipHits.length > 0) {
      score += WEIGHT_CHIP * chipHits.length
      reasons.push(...chipHits.map(chipLabel))
    }

    // "March", "Tue", "14th" — the log is keyed by date, so let people say so.
    const dateScore =
      scoreField(mediumLabel(entry.date), tokens, WEIGHT_DATE) +
      scoreField(shortLabel(entry.date), tokens, WEIGHT_DATE)
    if (dateScore > 0) {
      score += dateScore
      reasons.push(mediumLabel(entry.date))
    }

    if (score > 0) {
      matches.push({ entry, score, reasons: [...new Set(reasons)] })
    }
  }

  return matches.sort(
    // Ties break to the most recent day, which is nearly always the one meant.
    (a, b) => b.score - a.score || (a.entry.date < b.entry.date ? 1 : -1),
  )
}
