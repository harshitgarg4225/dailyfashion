import type { DateKey } from './dates'

/**
 * The training log: sets, in the plainest possible schema.
 *
 * This exists because the people most likely to photograph what they are
 * wearing every day heavily overlap with the people already logging what
 * they lift. The mechanic that keeps a lifting log alive is not the list of
 * exercises — it is seeing *last time's numbers* beside today's empty field,
 * so every session is a comparison with yesterday's self. That mechanic is
 * implemented here; everything else is a list.
 *
 * Vocabulary note: the app-wide ban list forbids the word "weight" in
 * user-facing copy because this product never discusses bodies. Barbell
 * load is not body talk, but the ban list cannot know that, so the UI says
 * "load" — which is also the more precise lifting term.
 *
 * Local like everything else: rows live in IndexedDB, export with the log,
 * and are nobody's business.
 */

export interface WorkoutSet {
  id: string
  /** Local calendar date, YYYY-MM-DD — same keying as the outfit log. */
  date: DateKey
  /** Free text, normalised to lowercase for matching. "bench press". */
  exercise: string
  /** Load in the user's own unit. The app never assumes kg or lb. */
  load: number
  reps: number
  sets: number
  created_at: number
}

/** "60 × 8 × 3" — load, reps, sets, in lifting's conventional order. */
export function formatSet(row: Pick<WorkoutSet, 'load' | 'reps' | 'sets'>): string {
  return `${row.load} × ${row.reps} × ${row.sets}`
}

export function normaliseExercise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The most recent earlier day's entry for this exercise — the number to beat.
 *
 * Same-day rows are excluded on purpose: "last time" means the previous
 * session, not the set logged two minutes ago.
 */
export function previousSession(
  rows: readonly WorkoutSet[],
  exercise: string,
  before: DateKey,
): WorkoutSet | null {
  const name = normaliseExercise(exercise)
  let latest: WorkoutSet | null = null
  for (const row of rows) {
    if (row.exercise !== name) continue
    if (row.date >= before) continue
    if (!latest || row.date > latest.date || (row.date === latest.date && row.created_at > latest.created_at)) {
      latest = row
    }
  }
  return latest
}

/** Distinct exercise names, most recently used first — the datalist. */
export function knownExercises(rows: readonly WorkoutSet[]): string[] {
  const seen = new Map<string, number>()
  for (const row of rows) {
    const at = seen.get(row.exercise)
    if (at === undefined || row.created_at > at) seen.set(row.exercise, row.created_at)
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}
