import { describe, expect, it } from 'vitest'
import {
  EXERCISE_CATALOG,
  exerciseStats,
  formatSet,
  knownExercises,
  loadTrend,
  normaliseExercise,
  personalBests,
  previousSession,
  sessionsByDay,
  sessionVolume,
  trainingWeeks,
  type WorkoutSet,
} from './gym'

const row = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: over.id ?? `set_${Math.random().toString(36).slice(2)}`,
  date: over.date ?? '2026-07-29',
  exercise: over.exercise ?? 'bench press',
  load: over.load ?? 60,
  reps: over.reps ?? 8,
  sets: over.sets ?? 3,
  created_at: over.created_at ?? 0,
})

describe('the training log', () => {
  it('formats in lifting order: load × reps × sets', () => {
    expect(formatSet({ load: 60, reps: 8, sets: 3 })).toBe('60 × 8 × 3')
  })

  it('normalises exercise names so "Bench  Press" matches "bench press"', () => {
    expect(normaliseExercise('  Bench  Press ')).toBe('bench press')
  })

  it('finds the previous session, never today', () => {
    const rows = [
      row({ date: '2026-07-22', load: 55, created_at: 1 }),
      row({ date: '2026-07-25', load: 60, created_at: 2 }),
      row({ date: '2026-07-29', load: 62.5, created_at: 3 }),
    ]
    // Today's own set is not "last time".
    expect(previousSession(rows, 'Bench Press', '2026-07-29')?.load).toBe(60)
    expect(previousSession(rows, 'squat', '2026-07-29')).toBeNull()
  })

  it('lists known exercises most recently used first', () => {
    const rows = [
      row({ exercise: 'squat', created_at: 1 }),
      row({ exercise: 'bench press', created_at: 5 }),
      row({ exercise: 'squat', created_at: 9 }),
    ]
    expect(knownExercises(rows)).toEqual(['squat', 'bench press'])
  })
})

describe('the catalog and the analysis', () => {
  it('keeps every catalog name normalised already', () => {
    for (const { exercises } of EXERCISE_CATALOG) {
      for (const name of exercises) {
        expect(name).toBe(normaliseExercise(name))
      }
    }
  })

  it('computes sessions, best and latest for one exercise', () => {
    const rows = [
      row({ date: '2026-07-20', load: 55, created_at: 1 }),
      row({ date: '2026-07-20', load: 57.5, created_at: 2 }),
      row({ date: '2026-07-25', load: 60, created_at: 3 }),
      row({ date: '2026-07-25', load: 52.5, created_at: 4 }),
      row({ date: '2026-07-22', exercise: 'squat', load: 100, created_at: 5 }),
    ]
    const stats = exerciseStats(rows, 'bench press')!
    expect(stats.sessions).toBe(2)
    expect(stats.best).toBe(60)
    expect(stats.latest.load).toBe(52.5)
    expect(exerciseStats(rows, 'unknown lift')).toBeNull()
  })

  it('sums a day of work as load × reps × sets', () => {
    expect(
      sessionVolume([
        row({ load: 60, reps: 8, sets: 3 }),
        row({ load: 100, reps: 5, sets: 5 }),
      ]),
    ).toBe(60 * 8 * 3 + 100 * 5 * 5)
  })

  it('groups history by day, newest first', () => {
    const rows = [
      row({ date: '2026-07-20' }),
      row({ date: '2026-07-25' }),
      row({ date: '2026-07-25' }),
    ]
    const days = sessionsByDay(rows)
    expect(days.map((d) => d.date)).toEqual(['2026-07-25', '2026-07-20'])
    expect(days[0]!.rows).toHaveLength(2)
  })

  it('draws the trend as the top single per day, oldest first', () => {
    const rows = [
      row({ date: '2026-07-25', load: 57.5 }),
      row({ date: '2026-07-20', load: 55 }),
      row({ date: '2026-07-20', load: 50 }),
      row({ date: '2026-07-28', load: 60 }),
      row({ date: '2026-07-22', exercise: 'squat', load: 100 }),
    ]
    expect(loadTrend(rows, 'Bench Press')).toEqual([
      { date: '2026-07-20', top: 55 },
      { date: '2026-07-25', top: 57.5 },
      { date: '2026-07-28', top: 60 },
    ])
  })

  it('compares rolling seven-day windows, not calendar weeks', () => {
    const rows = [
      // This week: two days.
      row({ date: '2026-07-29', load: 60, reps: 8, sets: 3 }),
      row({ date: '2026-07-27', load: 50, reps: 10, sets: 2 }),
      // Last week: one day.
      row({ date: '2026-07-20', load: 40, reps: 10, sets: 3 }),
      // Older than a fortnight: outside both windows.
      row({ date: '2026-07-10', load: 100, reps: 5, sets: 5 }),
    ]
    const { thisWeek, lastWeek } = trainingWeeks(rows, '2026-07-30')
    expect(thisWeek).toEqual({ sessions: 2, volume: 60 * 8 * 3 + 50 * 10 * 2 })
    expect(lastWeek).toEqual({ sessions: 1, volume: 40 * 10 * 3 })
  })

  it('keeps the records board honest: first day a best was hit, newest record first', () => {
    const rows = [
      row({ date: '2026-07-10', load: 60, created_at: 1 }),
      // Matching the best later must not re-stamp the record's date.
      row({ date: '2026-07-25', load: 60, created_at: 2 }),
      row({ date: '2026-07-20', exercise: 'squat', load: 100, created_at: 3 }),
    ]
    expect(personalBests(rows)).toEqual([
      { exercise: 'squat', best: 100, date: '2026-07-20' },
      { exercise: 'bench press', best: 60, date: '2026-07-10' },
    ])
  })
})
