import { describe, expect, it } from 'vitest'
import {
  formatSet,
  knownExercises,
  normaliseExercise,
  previousSession,
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
