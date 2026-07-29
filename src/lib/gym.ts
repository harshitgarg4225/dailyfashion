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

/**
 * The catalog: enough structure to make logging two taps, never a programme.
 *
 * Chest → bench press, pick, done. Free text stays first-class — the catalog
 * seeds vocabulary, it does not own it — and the app still offers no sets,
 * reps or loads of its own. Structure yes, opinion no.
 */
export const EXERCISE_CATALOG: ReadonlyArray<{ group: string; exercises: readonly string[] }> = [
  {
    group: 'chest',
    exercises: ['bench press', 'incline press', 'dumbbell press', 'cable fly', 'dips', 'push-up'],
  },
  {
    group: 'back',
    exercises: ['deadlift', 'pull-up', 'barbell row', 'lat pulldown', 'seated row', 'shrug'],
  },
  {
    group: 'shoulders',
    exercises: ['overhead press', 'lateral raise', 'front raise', 'face pull', 'rear delt fly'],
  },
  {
    group: 'legs',
    exercises: ['squat', 'front squat', 'leg press', 'romanian deadlift', 'lunge', 'leg curl', 'calf raise'],
  },
  {
    group: 'arms',
    exercises: ['barbell curl', 'dumbbell curl', 'hammer curl', 'tricep pushdown', 'skullcrusher', 'close-grip bench'],
  },
  {
    group: 'core',
    exercises: ['plank', 'hanging leg raise', 'cable crunch', 'ab wheel', 'russian twist'],
  },
]

export interface ExerciseStats {
  sessions: number
  /** The heaviest load ever logged for this exercise. */
  best: number
  /** The most recent row, whatever day it came from. */
  latest: WorkoutSet
}

/**
 * Everything the screen says about one exercise, computed not asserted.
 * Counts and maxima only — the same licence as everywhere else in the app.
 */
export function exerciseStats(rows: readonly WorkoutSet[], exercise: string): ExerciseStats | null {
  const name = normaliseExercise(exercise)
  const matching = rows.filter((row) => row.exercise === name)
  if (matching.length === 0) return null

  const days = new Set(matching.map((row) => row.date))
  let best = matching[0]!
  let latest = matching[0]!
  for (const row of matching) {
    if (row.load > best.load) best = row
    if (row.date > latest.date || (row.date === latest.date && row.created_at > latest.created_at)) {
      latest = row
    }
  }
  return { sessions: days.size, best: best.load, latest }
}

/** Total work in a list of rows: Σ load × reps × sets. One honest number per day. */
export function sessionVolume(rows: readonly WorkoutSet[]): number {
  return rows.reduce((sum, row) => sum + row.load * row.reps * row.sets, 0)
}

/** Days that have sets, newest first, each with its rows — the history list. */
export function sessionsByDay(rows: readonly WorkoutSet[]): Array<{ date: DateKey; rows: WorkoutSet[] }> {
  const byDay = new Map<DateKey, WorkoutSet[]>()
  for (const row of rows) {
    const bucket = byDay.get(row.date) ?? []
    bucket.push(row)
    byDay.set(row.date, bucket)
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayRows]) => ({ date, rows: dayRows }))
}
