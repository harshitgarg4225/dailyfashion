import { useState } from 'react'
import { copy } from '../lib/copy'
import { verifyLock, type LockRecord } from '../lib/lock'

/**
 * The gate in front of the app (J4, F8).
 *
 * Shows nothing about the log — no counts, no thumbnails, no "welcome back,
 * 47 days". The whole point of the lock is that someone holding the phone
 * learns nothing, and a lock screen that leaks the shape of your history is
 * only theatre.
 */
export function LockScreen({ record, onUnlocked }: { record: LockRecord; onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [wrong, setWrong] = useState(false)
  const [checking, setChecking] = useState(false)

  const attempt = async () => {
    if (checking || passcode.length === 0) return
    setChecking(true)
    try {
      if (await verifyLock(record, passcode)) {
        onUnlocked()
      } else {
        setWrong(true)
        setPasscode('')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="onboard">
      <div className="wordmark">
        <span className="name">{copy.lock.title}</span>
      </div>

      <div className="onboard-body">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void attempt()
          }}
        >
          <label className="field">
            <span className="field-label">{copy.lock.prompt}</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value)
                setWrong(false)
              }}
            />
          </label>

          {wrong ? <p className="note">{copy.lock.wrong}</p> : null}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={checking || passcode.length === 0}
          >
            {copy.lock.unlock}
          </button>
        </form>
      </div>
    </div>
  )
}
