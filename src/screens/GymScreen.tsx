import { useEffect, useMemo, useState } from 'react'
import { copy } from '../lib/copy'
import { mediumLabel, type DateKey } from '../lib/dates'
import {
  formatSet,
  knownExercises,
  normaliseExercise,
  previousSession,
  type WorkoutSet,
} from '../lib/gym'
import { allWorkouts, deleteWorkout, newId, putWorkout } from '../db/db'

/**
 * Training: the lifting log, run on the same philosophy as the outfit log.
 *
 * One mechanic carries this screen — last session's numbers shown beside
 * today's empty fields, so every entry is a comparison with a previous self.
 * No plans, no programmes, no coaching text: the app has no opinion about
 * lifting for the same reason it has no opinion about clothes. It hands back
 * the user's own record and gets out of the way.
 */
export function GymScreen({ today }: { today: DateKey }) {
  const [rows, setRows] = useState<WorkoutSet[]>([])
  const [exercise, setExercise] = useState('')
  const [load, setLoad] = useState('')
  const [reps, setReps] = useState('')
  const [sets, setSets] = useState('')

  useEffect(() => {
    void allWorkouts().then(setRows)
  }, [])

  const todays = useMemo(() => rows.filter((row) => row.date === today), [rows, today])
  const names = useMemo(() => knownExercises(rows), [rows])

  // The number to beat, live as the exercise name is typed.
  const last = useMemo(
    () => (exercise.trim() ? previousSession(rows, exercise, today) : null),
    [rows, exercise, today],
  )

  const add = async () => {
    const name = normaliseExercise(exercise)
    const loadN = Number(load)
    const repsN = Number(reps)
    const setsN = Number(sets || '1')
    if (!name || !Number.isFinite(loadN) || loadN <= 0) return
    if (!Number.isInteger(repsN) || repsN <= 0 || !Number.isInteger(setsN) || setsN <= 0) return

    const row: WorkoutSet = {
      id: newId('set'),
      date: today,
      exercise: name,
      load: loadN,
      reps: repsN,
      sets: setsN,
      created_at: Date.now(),
    }
    await putWorkout(row)
    setRows((current) => [...current, row])
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
        <span className="sub">{mediumLabel(today)}</span>
      </div>

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

        {/* Last session, beside the empty fields: the whole mechanic. */}
        {last ? (
          <p className="note">
            {copy.gym.lastTime(formatSet(last), mediumLabel(last.date))}
          </p>
        ) : null}

        <div className="gym-numbers">
          <label className="field">
            <span className="field-label">{copy.gym.load}</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
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
      </form>

      <div className="spacer" />

      {todays.length === 0 ? (
        <p className="empty">{copy.gym.empty}</p>
      ) : (
        <div className="panel">
          {todays.map((row) => (
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
        </div>
      )}

      <p className="note">{copy.gym.why}</p>
    </div>
  )
}
