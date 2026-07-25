import type { ChipDef, ChipId } from '../types'

/**
 * The "did anything happen?" answers.
 *
 * These are deliberately events rather than adjectives. "Complimented" is a
 * thing that occurred in the world; "looked good" would be a judgment, and a
 * judgment is exactly what this app refuses to trade in (J8).
 *
 * Valence is what makes the insight engine able to argue. A felt score alone
 * can tell you an average went down; only an event log can tell you *that the
 * days you wanted to change clothes were all the same pair of shoes*.
 *
 * Max 8, as specified — an evening list you can scan without reading.
 */
export const CHIPS: readonly ChipDef[] = [
  { id: 'complimented', label: 'Someone said something nice', valence: 'up' },
  { id: 'felt_like_myself', label: 'Felt like myself', valence: 'up' },
  { id: 'right_for_the_day', label: 'Right for what I was doing', valence: 'up' },
  { id: 'forgot_wearing_it', label: 'Forgot I was wearing it', valence: 'neutral' },
  { id: 'wanted_to_change', label: 'Wanted to change', valence: 'down' },
  { id: 'uncomfortable', label: 'Uncomfortable', valence: 'down' },
  { id: 'overdressed', label: 'Overdressed', valence: 'down' },
  { id: 'underdressed', label: 'Underdressed', valence: 'down' },
] as const

const BY_ID = new Map<ChipId, ChipDef>(CHIPS.map((c) => [c.id, c]))

export function chipDef(id: ChipId): ChipDef | undefined {
  return BY_ID.get(id)
}

export function chipLabel(id: ChipId): string {
  return BY_ID.get(id)?.label ?? id
}

/**
 * "Forgot I was wearing it" is scored as mildly positive on purpose.
 *
 * Not fidgeting with your clothes all day is one of the better signals in the
 * whole log — it usually means the outfit was right and got out of the way.
 * It stays labelled `neutral` in the UI because presenting it as a win would
 * be editorializing, but the engine counts it as a quiet point in favor.
 */
const VALENCE_WEIGHT: Record<ChipDef['valence'], number> = {
  up: 1,
  neutral: 0.25,
  down: -1,
}

/** Net event valence for one entry. Positive = the day went well in it. */
export function chipValenceSum(chips: readonly ChipId[]): number {
  let total = 0
  for (const id of chips) {
    const def = BY_ID.get(id)
    if (def) total += VALENCE_WEIGHT[def.valence]
  }
  return total
}
