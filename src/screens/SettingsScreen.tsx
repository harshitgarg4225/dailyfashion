import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { copy } from '../lib/copy'
import { Sheet, Switch } from '../app/controls'
import { buildExport, triggerDownload } from '../lib/exportData'
import { wipeEverything } from '../db/db'
import { permissionState, requestReminderPermission } from '../lib/reminders'
import {
  currentPersistence,
  formatBytes,
  storageUsage,
  type PersistenceState,
} from '../lib/storage'

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
  const [confirmExport, setConfirmExport] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported')
  const [used, setUsed] = useState<string | null>(null)
  const [notifications, setNotifications] = useState(permissionState())

  useEffect(() => {
    void currentPersistence().then(setPersistence)
    void storageUsage().then((usage) => setUsed(usage ? formatBytes(usage.usedBytes) : null))
  }, [])

  const runExport = async () => {
    setConfirmExport(false)
    setExporting(true)
    try {
      const result = await buildExport()
      triggerDownload(result.blob, result.filename)
    } finally {
      setExporting(false)
    }
  }

  /*
   * Turning the reminder on has to ask for the notification permission in the
   * same gesture. Storing `reminder_enabled: true` while the browser refuses to
   * show anything would leave the setting quietly lying about what happens.
   */
  const toggleReminder = async (next: boolean) => {
    if (!next) {
      onChange({ reminder_enabled: false })
      return
    }
    const granted = await requestReminderPermission()
    setNotifications(granted)
    onChange({
      reminder_enabled: granted === 'granted',
      consecutive_ignores: 0,
      last_reminder_for: null,
    })
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

      <div className="panel">
        <div className="row">
          <span className="row-text">
            {copy.settings.reminder}
            {settings.consecutive_ignores >= 5 ? <small>{copy.settings.reminderMuted}</small> : null}
          </span>
          <Switch
            checked={settings.reminder_enabled}
            label={copy.settings.reminder}
            onChange={(next) => void toggleReminder(next)}
          />
        </div>

        {settings.reminder_enabled ? (
          <>
            <div className="row">
              <span className="row-text">{copy.settings.reminderTime}</span>
              <input
                type="time"
                value={settings.reminder_time}
                onChange={(event) => onChange({ reminder_time: event.target.value })}
              />
            </div>
            <p className="note">{copy.settings.reminderCaveat}</p>
          </>
        ) : null}

        {notifications === 'denied' ? (
          <p className="note">{copy.settings.notificationsBlocked}</p>
        ) : null}
      </div>

      {/* C2: storage durability, stated plainly enough to act on. */}
      <div className="panel">
        <div className="row">
          <span className="row-text">
            {copy.settings.storage}
            <small>
              {persistence === 'persisted' ? copy.settings.storageSafe : copy.settings.storageAtRisk}
            </small>
          </span>
        </div>
        {used ? <p className="note">{copy.settings.storageUsed(used)}</p> : null}
      </div>

      <div className="panel">
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

      <div className="panel">
        <div className="row">
          <span className="row-text">
            {copy.settings.export}
            <small>{copy.settings.exportHint}</small>
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={exporting}
            onClick={() => setConfirmExport(true)}
          >
            {exporting ? copy.settings.exporting : copy.settings.export}
          </button>
        </div>
      </div>

      <div className="panel">
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
        <p className="note note--centred" role="status">
          {status}
        </p>
      ) : null}

      {/*
        * S2: the one moment the privacy promise legitimately ends. The zip
        * lands in the downloads folder, outside the app, and many devices sync
        * that folder to a cloud drive. Saying so is not a dark pattern — it is
        * the opposite, and it is the only honest way to offer the button.
        */}
      {confirmExport ? (
        <Sheet
          title={copy.settings.exportWarnTitle}
          body={copy.settings.exportWarnBody}
          onDismiss={() => setConfirmExport(false)}
        >
          <div className="stack">
            <button type="button" className="btn btn--primary btn--block" onClick={runExport}>
              {copy.settings.exportWarnGo}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setConfirmExport(false)}
            >
              {copy.settings.wipeCancel}
            </button>
          </div>
        </Sheet>
      ) : null}

      <p className="eyebrow settings-footer">{copy.onboarding.privacyTitle}</p>
    </div>
  )
}
