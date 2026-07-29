import { useEffect, useMemo, useState } from 'react'
import { copy } from '../lib/copy'
import { addDays, mediumLabel, type DateKey } from '../lib/dates'
import {
  EXERCISE_CATALOG,
  exerciseStats,
  formatSet,
  knownExercises,
  normaliseExercise,
  previousSession,
  sessionsByDay,
  sessionVolume,
  type WorkoutSet,
} from '../lib/gym'
import { allWorkouts, deleteWorkout, newId, putWorkout } from '../db/db'
import { track } from '../lib/telemetry'

/**
 * Training: the lifting log, run on the same philosophy as the outfit log.
 *
 * Three mechanics carry this screen, all computed and none opinionated:
 *
 *  - **Last time, beside the empty fields.** Type or pick an exercise and the
 *    previous session's numbers appear — every entry is a comparison with a
 *    previous self. Best-ever and session count ride along.
 *  - **The catalog.** Chest → bench press: two taps instead of typing. It
 *    seeds vocabulary, it does not own it; free text stays first-class, and
 *    the app still offers no programme, no target and no coaching line.
 *  - **Days, not just today.** The date steps backward for the session that
 *    did not get logged at the rack, and the history below shows every
 *    training day with its sets and its one honest number — total work.
 */
export function GymScreen({ today }: { today: DateKey }) {
  const [rows, setRows] = useState<WorkoutSet[]>([])
  const [date, setDate] = useState<DateKey>(today)
  const [group, setGroup] = useState<string | null>(null)
  const [exercise, setExercise] = useState('')
  const [load, setLoad] = useState('')
  const [reps, setReps] = useState('')
  const [sets, setSets] = useState('')
  const [bestNote, setBestNote] = useState<string | null>(null)

  useEffect(() => {
    void allWorkouts().then(setRows)
  }, [])

  const dayRows = useMemo(() => rows.filter((row) => row.date === date), [rows, date])
  const names = useMemo(() => knownExercises(rows), [rows])
  const history = useMemo(() => sessionsByDay(rows), [rows])

  // The numbers to beat, live as the exercise name is typed or picked.
  const last = useMemo(
    () => (exercise.trim() ? previousSession(rows, exercise, date) : null),
    [rows, exercise, date],
  )
  const stats = useMemo(
    () => (exercise.trim() ? exerciseStats(rows, exercise) : null),
    [rows, exercise],
  )

  const add = async () => {
    const name = normaliseExercise(exercise)
    const loadN = Number(load)
    const repsN = Number(reps)
    const setsN = Number(sets || '1')
    if (!name || !Number.isFinite(loadN) || loadN <= 0) return
    if (!Number.isInteger(repsN) || repsN <= 0 || !Number.isInteger(setsN) || setsN <= 0) return

    // Read before the insert, so "new best" means beating a previous day —
    // not beating the set logged thirty seconds ago.
    const prevBest = exerciseStats(rows, name)?.best ?? null

    const row: WorkoutSet = {
      id: newId('set'),
      date,
      exercise: name,
      load: loadN,
      reps: repsN,
      sets: setsN,
      created_at: Date.now(),
    }
    await putWorkout(row)
    setRows((current) => [...current, row])
    setBestNote(prevBest !== null && loadN > prevBest ? copy.gym.newBest(name) : null)
    void track('workout')
    // Keep the exercise; a session is usually several entries of the same one.
    setLoad('')
    setReps('')
    setSets('')
  }

  const remove = async (id: string) => {
    await deleteWorkout(id)
    setRows((current) => current.filter((row) => row.id !== id))
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.gym.tab}</span>
        <h1>{copy.gym.title}</h1>

        {/* Day-wise logging: the session that did not get logged at the rack
            can still land on the day it happened. Never the future. */}
        <div className="gym-daynav">
          <button
            type="button"
            className="btn btn--quiet"
            aria-label={copy.gym.previousDay}
            onClick={() => setDate(addDays(date, -1))}
          >
            ←
          </button>
          <span className="sub">{date === today ? copy.gym.today : mediumLabel(date)}</span>
          <button
            type="button"
            className="btn btn--quiet"
            aria-label={copy.gym.nextDay}
            disabled={date === today}
            onClick={() => setDate(addDays(date, 1))}
          >
            →
          </button>
        </div>
      </div>

      {/* The catalog: chest → bench press, two taps. Seeds the field below. */}
      <div className="gym-groups">
        {EXERCISE_CATALOG.map((entry) => (
          <button
            key={entry.group}
            type="button"
            className="btn btn--quiet"
            aria-pressed={group === entry.group}
            onClick={() => setGroup(group === entry.group ? null : entry.group)}
          >
            {entry.group}
          </button>
        ))}
      </div>
      {group ? (
        <div className="gym-groups gym-exercises">
          {EXERCISE_CATALOG.find((entry) => entry.group === group)!.exercises.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn--quiet"
              aria-pressed={normaliseExercise(exercise) === name}
              onClick={() => setExercise(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label className="field">
          <span className="field-label">{copy.gym.exercise}</span>
          <input
            type="text"
            value={exercise}
            maxLength={40}
            list="exercise-names"
            placeholder={copy.gym.exercisePlaceholder}
            onChange={(event) => setExercise(event.target.value)}
          />
          <datalist id="exercise-names">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        {/* The analysis, at the moment it matters: last session's numbers
            beside today's empty fields, with best-ever and the day count. */}
        {last ? (
          <p className="note">
            {copy.gym.lastTime(formatSet(last), mediumLabel(last.date))}
            {stats ? ` ${copy.gym.record(stats.best, stats.sessions)}` : ''}
          </p>
        ) : stats ? (
          <p className="note">{copy.gym.record(stats.best, stats.sessions)}</p>
        ) : null}

        <div className="gym-numbers">
          <label className="field">
            <span className="field-label">{copy.gym.load}</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={load}
              onChange={(event) => setLoad(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{copy.gym.reps}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={reps}
              onChange={(event) => setReps(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{copy.gym.sets}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={sets}
              placeholder="1"
              onChange={(event) => setSets(event.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn btn--primary btn--block">
          {copy.gym.add}
        </button>

        {/* The delight beat: earned by the numbers, stated once, no confetti. */}
        {bestNote ? (
          <p className="note" role="status">
            {bestNote}
          </p>
        ) : null}
      </form>

      <div className="spacer" />

      {dayRows.length === 0 ? (
        <p className="empty">{copy.gym.empty}</p>
      ) : (
        <div className="panel">
          {dayRows.map((row) => (
            <div key={row.id} className="row">
              <span className="row-text">
                {row.exercise}
                <small>{formatSet(row)}</small>
              </span>
              <button type="button" className="btn btn--quiet" onClick={() => void remove(row.id)}>
                {copy.gym.remove}
              </button>
            </div>
          ))}
          <div className="row">
            <span className="row-text">
              {copy.gym.volumeLabel}
              <small>{copy.gym.volumeHint}</small>
            </span>
            <span className="sub">{sessionVolume(dayRows)}</span>
          </div>
        </div>
      )}

      {/* Every training day, with its sets and its one honest number. */}
      {history.length > 1 ? (
        <>
          <hr className="rule" />
          <h2 className="summary-heading">{copy.gym.historyTitle}</h2>
          {history.slice(0, 30).map((day) => (
            <button
              key={day.date}
              type="button"
              className="row row--full"
              onClick={() => setDate(day.date)}
            >
              <span className="row-text">
                {mediumLabel(day.date)}
                <small>
                  {[...new Set(day.rows.map((row) => row.exercise))].join(', ')}
                </small>
              </span>
              <span className="sub">{sessionVolume(day.rows)}</span>
            </button>
          ))}
        </>
      ) : null}

      <p className="note">{copy.gym.why}</p>
    </div>
  )
}
