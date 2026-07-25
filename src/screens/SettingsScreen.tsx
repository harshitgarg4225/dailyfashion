import { useState } from 'react'
import type { Settings } from '../types'
import { copy } from '../lib/copy'
import { Switch } from '../app/controls'
import { buildExport, triggerDownload } from '../lib/exportData'
import { wipeEverything } from '../db/db'

/**
 * Settings, including the two things J10 insists must exist.
 *
 * Export and delete are plain rows in the same list as everything else — not
 * buried under an "advanced" disclosure, not guarded by a retention plea. The
 * wipe asks the user to type DELETE, which is friction against a mis-tap
 * rather than against the decision, and then it does exactly what it says.
 */
export function SettingsScreen({
  settings,
  onChange,
  onWiped,
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onWiped: () => void
}) {
  const [exporting, setExporting] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const runExport = async () => {
    setExporting(true)
    try {
      const result = await buildExport()
      triggerDownload(result.blob, result.filename)
    } finally {
      setExporting(false)
    }
  }

  const runWipe = async () => {
    await wipeEverything()
    setConfirmWipe(false)
    setTyped('')
    setStatus(copy.settings.wipeDone)
    onWiped()
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{copy.settings.title}</h1>
      </div>

      <div className="card">
        <div className="row">
          <span className="row-text">
            {copy.settings.reminder}
            {settings.consecutive_ignores >= 5 ? <small>{copy.settings.reminderMuted}</small> : null}
          </span>
          <Switch
            checked={settings.reminder_enabled}
            label={copy.settings.reminder}
            onChange={(next) => onChange({ reminder_enabled: next, consecutive_ignores: 0 })}
          />
        </div>

        {settings.reminder_enabled ? (
          <div className="row">
            <span className="row-text">{copy.settings.reminderTime}</span>
            <input
              type="time"
              value={settings.reminder_time}
              style={{ width: 130 }}
              onChange={(event) => onChange({ reminder_time: event.target.value })}
            />
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="row">
          <span className="row-text">
            {copy.settings.blur}
            <small>{copy.settings.blurHint}</small>
          </span>
          <Switch
            checked={settings.blur_thumbnails}
            label={copy.settings.blur}
            onChange={(next) => onChange({ blur_thumbnails: next })}
          />
        </div>

        <div className="row">
          <span className="row-text">
            {settings.softened_at === null
              ? copy.settings.pauseInsights
              : copy.settings.resumeInsights}
          </span>
          <Switch
            checked={settings.softened_at !== null}
            label={copy.settings.pauseInsights}
            onChange={(next) => onChange({ softened_at: next ? Date.now() : null })}
          />
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="row-text">
            {copy.settings.export}
            <small>{copy.settings.exportHint}</small>
          </span>
          <button type="button" className="btn btn--ghost" disabled={exporting} onClick={runExport}>
            {exporting ? copy.settings.exporting : copy.settings.export}
          </button>
        </div>
      </div>

      <div className="card">
        {confirmWipe ? (
          <>
            <p className="note">{copy.settings.wipeConfirmPrompt}</p>
            <input
              type="text"
              value={typed}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label={copy.settings.wipeConfirmPrompt}
              onChange={(event) => setTyped(event.target.value)}
            />
            <div className="spacer" />
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--danger"
                disabled={typed.trim().toUpperCase() !== copy.settings.wipeConfirmWord}
                onClick={runWipe}
              >
                {copy.settings.wipeDo}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  setConfirmWipe(false)
                  setTyped('')
                }}
              >
                {copy.settings.wipeCancel}
              </button>
            </div>
          </>
        ) : (
          <div className="row">
            <span className="row-text">
              {copy.settings.wipe}
              <small>{copy.settings.wipeHint}</small>
            </span>
            <button type="button" className="btn btn--danger" onClick={() => setConfirmWipe(true)}>
              {copy.settings.wipe}
            </button>
          </div>
        )}
      </div>

      {status ? (
        <p className="note" role="status" style={{ textAlign: 'center' }}>
          {status}
        </p>
      ) : null}

      <p className="note" style={{ textAlign: 'center', marginTop: 24 }}>
        {copy.onboarding.privacyTitle}.
      </p>
    </div>
  )
}
