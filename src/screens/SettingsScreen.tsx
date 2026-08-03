import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { copy } from '../lib/copy'
import { Sheet, Switch } from '../app/controls'
import { buildExport, importArchive } from '../lib/exportData'
import { shareArchive } from '../lib/share'
import { AGE_BANDS, disableSharing, enableSharing, sendProfile, track } from '../lib/telemetry'
import { isSealedArchive, sealArchive, unsealArchive } from '../lib/cryptoExport'
import { saveLock, wipeEverything } from '../db/db'
import {
  createLock,
  passcodeIsAcceptable,
  verifyLock,
  type LockRecord,
} from '../lib/lock'
import { permissionState, requestReminderPermission } from '../lib/reminders'
import { isIos } from '../lib/storage'
import { hasSystemScheduledReminders } from '../lib/platform'
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
/** Days-of-log before the export nudge earns its place. */
const EXPORT_NUDGE_MIN_ENTRIES = 30

/** A month since the last export counts as stale. */
const EXPORT_NUDGE_STALE_MS = 30 * 24 * 60 * 60 * 1000

export function SettingsScreen({
  settings,
  onChange,
  onWiped,
  onImported,
  lock,
  onLockChange,
  outfitCount,
  entryCount,
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onWiped: () => void
  onImported: () => void
  lock: LockRecord | null
  onLockChange: (record: LockRecord | null) => void
  outfitCount: number
  entryCount: number
}) {
  const [exporting, setExporting] = useState(false)
  const [confirmExport, setConfirmExport] = useState(false)
  const [sealPass, setSealPass] = useState('')
  const [sealedImport, setSealedImport] = useState<File | null>(null)
  const [unsealPass, setUnsealPass] = useState('')
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported')
  const [used, setUsed] = useState<string | null>(null)
  const [notifications, setNotifications] = useState(permissionState())
  const [lockStep, setLockStep] = useState<'off' | 'set' | 'remove'>('off')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [lockError, setLockError] = useState<string | null>(null)
  const [ageBand, setAgeBand] = useState('')
  const [gender, setGender] = useState('')
  const [location, setLocation] = useState('')
  const [profession, setProfession] = useState('')

  const closeLockForm = () => {
    setLockStep('off')
    setPass1('')
    setPass2('')
    setLockError(null)
  }

  const enableLock = async () => {
    if (!passcodeIsAcceptable(pass1)) {
      setLockError(copy.settings.lockTooShort)
      return
    }
    if (pass1 !== pass2) {
      setLockError(copy.settings.lockMismatch)
      return
    }
    const record = await createLock(pass1)
    await saveLock(record)
    onChange({ passcode_lock: true })
    onLockChange(record)
    closeLockForm()
  }

  const disableLock = async () => {
    if (!lock || !(await verifyLock(lock, pass1))) {
      setLockError(copy.lock.wrong)
      return
    }
    await saveLock(null)
    onChange({ passcode_lock: false })
    onLockChange(null)
    closeLockForm()
  }
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  /**
   * F14: the other half of the door.
   *
   * Export alone lets someone leave. Without import they cannot come back,
   * cannot move to a new phone, and cannot recover from the storage eviction
   * this app works to prevent — which for a log whose whole value is
   * accumulated history is the difference between a product and a demo.
   */
  const runImport = async (file: File) => {
    // A sealed archive needs its passphrase before it is anything at all;
    // park the file and ask, rather than failing with a generic error.
    if (await isSealedArchive(file)) {
      setSealedImport(file)
      setUnsealPass('')
      return
    }
    setImporting(true)
    try {
      const result = await importArchive(file)
      setStatus(copy.settings.importDone(result.added, result.skipped))
      onImported()
    } catch {
      setStatus(copy.settings.importFailed)
    } finally {
      setImporting(false)
    }
  }

  const runSealedImport = async () => {
    const file = sealedImport
    if (!file) return
    setSealedImport(null)
    setImporting(true)
    try {
      const zip = await unsealArchive(file, unsealPass)
      const result = await importArchive(zip)
      setStatus(copy.settings.importDone(result.added, result.skipped))
      onImported()
    } catch {
      // Overwhelmingly a wrong passphrase — GCM fails hard, nothing partial.
      setStatus(copy.settings.unsealFailed)
    } finally {
      setUnsealPass('')
      setImporting(false)
    }
  }

  useEffect(() => {
    void currentPersistence().then(setPersistence)
    void storageUsage().then((usage) => setUsed(usage ? formatBytes(usage.usedBytes) : null))
  }, [])

  const runExport = async (pass = '') => {
    setConfirmExport(false)
    setExporting(true)
    setExportProgress(null)
    try {
      const result = await buildExport((done, total) => setExportProgress({ done, total }))
      const passphrase = pass.trim()
      const [archive, filename] = passphrase
        ? [await sealArchive(result.blob, passphrase), result.filename.replace(/\.zip$/, '.sealed')]
        : [result.blob, result.filename]

      /*
       * The share sheet, not a bare download: it reaches Drive, iCloud Files
       * and email-to-self — the places a backup can outlive the phone — with
       * the app never seeing where the file went. Declining the sheet or a
       * platform that refuses archives both fall back to the download.
       */
      const outcome = await shareArchive(archive, filename)
      // A dismissed sheet exported nothing: no success message, and the
      // export-health clock must not be reset by a backup that never landed.
      if (outcome !== 'dismissed') {
        setStatus(outcome === 'shared' ? copy.settings.exportShared : copy.settings.exportSaved)
        onChange({ last_export_at: Date.now() })
        void track('export')
      }
    } finally {
      setSealPass('')
      setExporting(false)
      setExportProgress(null)
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

      <span className="eyebrow settings-section">{copy.settings.sectionDaily}</span>
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
            {hasSystemScheduledReminders() ? (
              <p className="note">{copy.settings.reminderNative}</p>
            ) : (
              <>
                <p className="note">{copy.settings.reminderCaveat}</p>
                {isIos() ? <p className="note">{copy.settings.reminderIosCaveat}</p> : null}
              </>
            )}
          </>
        ) : null}

        {notifications === 'denied' ? (
          <p className="note">{copy.settings.notificationsBlocked}</p>
        ) : null}
      </div>

      <span className="eyebrow settings-section">{copy.settings.sectionDevice}</span>
      {/* J4's optional lock. Scope stated plainly rather than implied. */}
      <div className="panel">
        <div className="row">
          <span className="row-text">
            {copy.settings.lock}
            <small>{copy.settings.lockHint}</small>
          </span>
          <Switch
            checked={lock !== null}
            label={copy.settings.lock}
            onChange={(next) => {
              setLockError(null)
              setPass1('')
              setPass2('')
              setLockStep(next ? 'set' : 'remove')
            }}
          />
        </div>

        {lockStep === 'set' ? (
          <>
            <label className="field">
              <span className="field-label">{copy.settings.lockSet}</span>
              <input
                type="password"
                inputMode="numeric"
                value={pass1}
                onChange={(event) => setPass1(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{copy.settings.lockSetAgain}</span>
              <input
                type="password"
                inputMode="numeric"
                value={pass2}
                onChange={(event) => setPass2(event.target.value)}
              />
            </label>
            {lockError ? <p className="note">{lockError}</p> : null}
            <div className="btn-row">
              <button type="button" className="btn btn--primary btn--flex" onClick={() => void enableLock()}>
                {copy.settings.lockSave}
              </button>
              <button type="button" className="btn btn--quiet" onClick={closeLockForm}>
                {copy.common.cancel}
              </button>
            </div>
          </>
        ) : null}

        {lockStep === 'remove' ? (
          <>
            <label className="field">
              <span className="field-label">{copy.settings.lockRemovePrompt}</span>
              <input
                type="password"
                inputMode="numeric"
                value={pass1}
                onChange={(event) => setPass1(event.target.value)}
              />
            </label>
            {lockError ? <p className="note">{lockError}</p> : null}
            <div className="btn-row">
              <button type="button" className="btn btn--danger btn--flex" onClick={() => void disableLock()}>
                {copy.settings.lockRemove}
              </button>
              <button type="button" className="btn btn--quiet" onClick={closeLockForm}>
                {copy.common.cancel}
              </button>
            </div>
          </>
        ) : null}

        <p className="note">{copy.settings.lockScope}</p>
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
        <p className="note">{copy.settings.groupsFormed(outfitCount, entryCount)}</p>
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
            {copy.settings.garmentNaming}
            <small>{copy.settings.garmentNamingHint}</small>
          </span>
          <Switch
            checked={settings.garment_naming}
            label={copy.settings.garmentNaming}
            onChange={(next) => onChange({ garment_naming: next })}
          />
        </div>

        {/*
          * Usage sharing: off until this switch, and the hint says exactly
          * what turning it on sends — event names, never the log. The
          * profile form below it is a form, typed by the user, sent once on
          * Save: the most literal version of "the user gives us this".
          */}
        <div className="row">
          <span className="row-text">
            {copy.settings.shareUsage}
            <small>{copy.settings.shareUsageHint}</small>
          </span>
          <Switch
            checked={settings.share_usage}
            label={copy.settings.shareUsage}
            onChange={(next) => {
              void (next ? enableSharing() : disableSharing()).then(() =>
                onChange({ share_usage: next }),
              )
            }}
          />
        </div>

        {settings.share_usage ? (
          <form
            className="stack profile-form"
            onSubmit={(event) => {
              event.preventDefault()
              void sendProfile({
                age_band: ageBand || null,
                gender: gender.trim() || null,
                location: location.trim() || null,
                profession: profession.trim() || null,
              }).then((ok) =>
                setStatus(ok ? copy.settings.profileSaved : copy.settings.profileFailed),
              )
            }}
          >
            <p className="note">{copy.settings.profileIntro}</p>
            <label className="field">
              <span className="field-label">{copy.settings.profileAge}</span>
              <select value={ageBand} onChange={(event) => setAgeBand(event.target.value)}>
                <option value="">{copy.settings.profileSkip}</option>
                {AGE_BANDS.map((band) => (
                  <option key={band.id} value={band.id}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{copy.settings.profileGender}</span>
              <input
                type="text"
                value={gender}
                maxLength={32}
                placeholder={copy.settings.profileSkip}
                onChange={(event) => setGender(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{copy.settings.profileLocation}</span>
              <input
                type="text"
                value={location}
                maxLength={80}
                placeholder={copy.settings.profileSkip}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{copy.settings.profileProfession}</span>
              <input
                type="text"
                value={profession}
                maxLength={80}
                placeholder={copy.settings.profileSkip}
                onChange={(event) => setProfession(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn--ghost btn--block">
              {copy.settings.profileSave}
            </button>
          </form>
        ) : null}

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

      <span className="eyebrow settings-section">{copy.settings.sectionData}</span>
      <div className="panel">
        <div className="row">
          <span className="row-text">
            {copy.settings.export}
            <small>{copy.settings.exportHint}</small>
          </span>
          {/*
            * One tap, straight to the share sheet, where Drive and iCloud
            * live. The interstitial made a backup feel like a procedure;
            * the passphrase path below keeps the sheet for those who want it.
            */}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={exporting}
            onClick={() => void runExport()}
          >
            {exporting
              ? exportProgress
                ? copy.settings.exportProgress(exportProgress.done, exportProgress.total)
                : copy.settings.exporting
              : copy.settings.export}
          </button>
        </div>
        <div className="row">
          <span className="row-text">
            <small>{copy.settings.sealRowHint}</small>
          </span>
          <button
            type="button"
            className="btn btn--quiet"
            disabled={exporting}
            onClick={() => setConfirmExport(true)}
          >
            {copy.settings.sealAction}
          </button>
        </div>

        {/*
          * The export-health nudge: quiet, factual, and only when the gap has
          * become a real exposure. Thirty unlogged-elsewhere days is the point
          * where a browser eviction stops being an annoyance and becomes a
          * loss; below that the nudge would be nagging.
          */}
        {entryCount >= EXPORT_NUDGE_MIN_ENTRIES &&
        (settings.last_export_at === null ||
          Date.now() - settings.last_export_at > EXPORT_NUDGE_STALE_MS) ? (
          <p className="note">
            {settings.last_export_at === null
              ? copy.settings.exportNudgeNever
              : copy.settings.exportNudgeStale}
          </p>
        ) : null}

        <div className="row">
          <span className="row-text">
            {copy.settings.import}
            <small>{copy.settings.importHint}</small>
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            {importing ? copy.settings.importing : copy.settings.import}
          </button>
        </div>

        <input
          ref={importRef}
          type="file"
          accept=".zip,.sealed,application/zip,application/octet-stream"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void runImport(file)
            event.target.value = ''
          }}
        />
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
            {/*
              * The passphrase is optional and the field says exactly what
              * choosing one means: sealed with it, unrecoverable without it.
              * No confirmation field — an export can simply be re-made, which
              * is not true of the things confirmation fields protect.
              */}
            <label className="field">
              <span className="field-label">{copy.settings.sealLabel}</span>
              <span className="field-hint">{copy.settings.sealHint}</span>
              <input
                type="password"
                value={sealPass}
                autoComplete="new-password"
                onChange={(event) => setSealPass(event.target.value)}
              />
            </label>
            <button type="button" className="btn btn--primary btn--block" onClick={() => void runExport(sealPass)}>
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

      {sealedImport ? (
        <Sheet
          title={copy.settings.unsealTitle}
          body={copy.settings.unsealBody}
          onDismiss={() => setSealedImport(null)}
        >
          <div className="stack">
            <label className="field">
              <span className="field-label">{copy.settings.sealLabel}</span>
              <input
                type="password"
                value={unsealPass}
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setUnsealPass(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={unsealPass.length === 0}
              onClick={() => void runSealedImport()}
            >
              {copy.settings.unsealGo}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setSealedImport(null)}
            >
              {copy.settings.wipeCancel}
            </button>
          </div>
        </Sheet>
      ) : null}

      <p className="eyebrow settings-footer">
        <a href="/privacy">{copy.settings.privacyLink}</a>
        {' · '}
        {/* The way back out front. ?stay=1 keeps the brochure from bouncing
            a marked returning user straight back into the app. */}
        <a href="/?stay=1">{copy.settings.aboutLink}</a>
      </p>
    </div>
  )
}
