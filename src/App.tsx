import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChipId, Entry, FeltScore, ImageSignature, Settings, TempBand } from './types'
import { useLog } from './app/useLog'
import { Sheet, Toast } from './app/controls'
import { CameraScreen } from './screens/CameraScreen'
import { TonightScreen } from './screens/TonightScreen'
import { LogScreen } from './screens/LogScreen'
import { ShortlistScreen } from './screens/ShortlistScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { OnboardingScreen, type SeedPhoto } from './screens/OnboardingScreen'
import { CaptureFollowUp, type FollowUpResult } from './screens/CaptureFollowUp'
import { copy } from './lib/copy'
import { captureContext, launchIntent } from './lib/context'
import { addDays, BACKDATE_LIMIT_DAYS, daysBetween, mediumLabel, toDateKey, type DateKey } from './lib/dates'
import { bestMatch, SIMILARITY_WINDOW } from './lib/signature'
import { shouldOfferSoftening } from './lib/insights'
import { SHORTLIST_MIN_ENTRIES } from './lib/shortlist'
import {
  clonePhoto,
  deleteEntry,
  dismissInsight,
  linkEntries,
  newId,
  recomputeOutfit,
  putEntry,
  putPhoto,
  saveSettings,
  tagEntry,
  __resetDbForTests,
} from './db/db'
import { preparePhoto } from './lib/capture'
import {
  cancelReminder,
  countsAsIgnored,
  MAX_CONSECUTIVE_IGNORES,
  msUntilNext,
  scheduleReminder,
} from './lib/reminders'
import { requestPersistence } from './lib/storage'

type Screen = 'camera' | 'tonight' | 'log' | 'shortlist' | 'insights' | 'settings'

/** Tabs appear as the log earns them, so an empty app is not a wall of dead UI. */
function visibleTabs(entryCount: number): Screen[] {
  const tabs: Screen[] = ['log']
  if (entryCount >= SHORTLIST_MIN_ENTRIES) tabs.splice(0, 0, 'shortlist')
  tabs.push('insights', 'settings')
  return tabs
}

const TAB_LABELS: Record<Screen, string> = {
  camera: 'Capture',
  tonight: 'Tonight',
  log: 'Journal',
  shortlist: 'Today',
  insights: 'Patterns',
  settings: 'Settings',
}

export default function App() {
  const log = useLog()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Post-capture flow state.
  const [followUp, setFollowUp] = useState<{ entryId: string; matchId: string | null } | null>(null)
  const [openEntry, setOpenEntry] = useState<Entry | null>(null)
  const [softenOffer, setSoftenOffer] = useState(false)
  /**
   * What it is like out today, for J6's shortlist.
   *
   * Taken from today's entry when there is one, since the follow-up already
   * asked. Otherwise the shortlist offers the same three-way tap — someone
   * deciding what to wear has not necessarily photographed anything yet.
   */
  const [tappedTemp, setTappedTemp] = useState<TempBand | null>(null)
  /** Set when the user is adding a day in the past (J9's backdating). */
  const [pendingDate, setPendingDate] = useState<DateKey | null>(null)
  const [datePicker, setDatePicker] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Entry | null>(null)
  const [installNudgeDismissed, setInstallNudgeDismissed] = useState(false)

  const today = toDateKey(new Date())

  const entriesToday = useMemo(
    () => log.entries.filter((e) => e.date === today),
    [log.entries, today],
  )
  const unrated = useMemo(
    () => log.entries.filter((e) => e.felt_score === null),
    [log.entries],
  )
  const entriesById = useMemo(
    () => new Map(log.entries.map((e) => [e.id, e])),
    [log.entries],
  )

  const todayTempBand = entriesToday.find((e) => e.context.temp_band)?.context.temp_band ?? tappedTemp

  const flash = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 1800)
  }, [])

  // --- launch routing (J1) ---------------------------------------------

  useEffect(() => {
    if (log.loading || screen !== null) return

    const intent = launchIntent({
      hasEntryToday: entriesToday.length > 0,
      hasUnrated: unrated.length > 0,
      onboarded: log.settings.onboarded,
    })

    // A notification tap can override the time-of-day guess.
    const params = new URLSearchParams(window.location.search)
    if (params.get('screen') === 'tonight' || params.has('rate')) {
      setScreen('tonight')
      return
    }

    setScreen(intent)
  }, [log.loading, log.settings.onboarded, screen, entriesToday.length, unrated.length])

  /*
   * C2: ask the browser to keep this data.
   *
   * Without it IndexedDB is "best effort" and can be evicted under storage
   * pressure with no prompt and no recovery — which for a local-only log means
   * silently losing someone's year of history. Requested once the user has
   * committed to the app rather than on first paint, since browsers weigh
   * engagement when deciding.
   */
  useEffect(() => {
    if (log.loading || !log.settings.onboarded) return
    void requestPersistence()
  }, [log.loading, log.settings.onboarded])

  /*
   * J2 + J9: arm the evening reminder, and notice when one went unanswered.
   *
   * The ignore check happens on launch rather than live, because the page is
   * almost never running at the moment a notification is dismissed. Five in a
   * row and the app stops asking — J9's rule that the product backs off rather
   * than nudging harder.
   */
  useEffect(() => {
    if (log.loading || !log.settings.onboarded) return

    const pending = unrated[0] ?? null

    const wasIgnored = countsAsIgnored(log.settings.last_reminder_for, pending !== null)
    if (wasIgnored) {
      const ignores = log.settings.consecutive_ignores + 1
      void saveSettings({
        consecutive_ignores: ignores,
        last_reminder_for: null,
        // Auto-mute, with a plain re-opt-in left in Settings.
        reminder_enabled: ignores >= MAX_CONSECUTIVE_IGNORES ? false : log.settings.reminder_enabled,
      }).then(() => log.refresh())
      return
    }

    const armed = scheduleReminder({
      settings: log.settings,
      pendingEntryId: pending?.id ?? null,
      title: copy.reminder.notificationTitle,
      body: copy.reminder.notificationBody,
    })

    if (armed) {
      const delay = msUntilNext(log.settings.reminder_time)
      const firesAt = delay === null ? null : Date.now() + delay
      if (firesAt !== null && firesAt !== log.settings.last_reminder_for) {
        void saveSettings({ last_reminder_for: firesAt })
      }
    }

    return cancelReminder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.loading, log.settings, unrated])

  // --- J8: offer to soften after a low stretch --------------------------

  useEffect(() => {
    if (log.loading || log.settings.softened_at !== null) return
    if (shouldOfferSoftening(log.entries, today)) setSoftenOffer(true)
  }, [log.loading, log.entries, log.settings.softened_at, today])

  // --- writes -----------------------------------------------------------

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      await saveSettings(patch)
      await log.refresh()
    },
    [log],
  )

  /**
   * The save path from J1's shutter.
   *
   * Everything after the write is optional and dismissible: the temperature
   * tap, the "same as Tuesday?" link, the one-word tag. The entry is already
   * safely stored before any of it is shown, so abandoning the app at any
   * point still leaves a complete photo entry in the log.
   */
  const saveEntry = useCallback(
    async (
      blob: Blob,
      signature: ImageSignature,
      options: { date?: DateKey; felt?: FeltScore | null; skipPrompts?: boolean } = {},
    ) => {
      const date = options.date ?? today
      const photoId = newId('photo')
      await putPhoto(photoId, blob)

      const entry: Entry = {
        id: newId('entry'),
        date,
        photo_id: photoId,
        felt_score: options.felt ?? null,
        chips: [],
        outfit_id: null,
        context: captureContext(date, null),
        note: null,
        signature,
        created_at: Date.now(),
        rated_at: options.felt != null ? Date.now() : null,
        backdated: date !== today,
      }
      await putEntry(entry)
      await log.refresh()

      if (options.skipPrompts) return entry

      // "Worn before?" against the most recent entries only. The follow-up is
      // shown either way — temperature must be asked on repeat wears too, since
      // those are exactly the entries J7 needs context for.
      const match = bestMatch(signature, log.entries.slice(0, SIMILARITY_WINDOW))
      setFollowUp({ entryId: entry.id, matchId: match?.entry.id ?? null })

      return entry
    },
    [log, today],
  )

  const onCaptured = useCallback(
    async (blob: Blob, signature: ImageSignature) => {
      await saveEntry(blob, signature, pendingDate ? { date: pendingDate } : {})
      setPendingDate(null)
      flash(copy.camera.saved)
      setScreen('log')
    },
    [flash, pendingDate, saveEntry],
  )

  const onPickFile = useCallback(
    async (file: File) => {
      const prepared = await preparePhoto(file)
      await saveEntry(prepared.blob, prepared.signature, pendingDate ? { date: pendingDate } : {})
      setPendingDate(null)
      flash(copy.camera.saved)
      setScreen('log')
    },
    [flash, pendingDate, saveEntry],
  )

  /**
   * J6's one tap: "wearing this again".
   *
   * Creates today's entry from the chosen day — same photograph, same outfit
   * cluster, same tags — so a repeat wear costs exactly one tap rather than a
   * camera launch. The photo is copied rather than shared so that removing
   * either day cannot blank the other.
   */
  const wearAgain = useCallback(
    async (source: Entry) => {
      const photoId = await clonePhoto(source.photo_id)
      if (!photoId) return

      const entry: Entry = {
        id: newId('entry'),
        date: today,
        photo_id: photoId,
        felt_score: null,
        chips: [],
        outfit_id: source.outfit_id,
        context: captureContext(today, todayTempBand),
        note: null,
        signature: source.signature,
        created_at: Date.now(),
        rated_at: null,
        backdated: false,
      }
      await putEntry(entry)

      // If the source was not yet part of a cluster, this pairing creates one.
      if (!source.outfit_id) await linkEntries(entry.id, source.id)

      await log.refresh()
      flash(copy.log.loggedAgain)
      setScreen('log')
    },
    [flash, log, today, todayTempBand],
  )

  const removeEntry = useCallback(
    async (entry: Entry) => {
      setConfirmRemove(null)
      setOpenEntry(null)
      await deleteEntry(entry.id)
      if (entry.outfit_id) await recomputeOutfit(entry.outfit_id)
      await log.refresh()
      flash(copy.tonight.removed)
      setScreen('log')
    },
    [flash, log],
  )

  const onSeedsDone = useCallback(
    async (seeds: SeedPhoto[]) => {
      for (const seed of seeds) {
        await saveEntry(seed.blob, seed.signature, {
          date: seed.date,
          felt: seed.felt,
          skipPrompts: true,
        })
      }
      await updateSettings({ onboarded: true })
      setScreen(seeds.length > 0 ? 'log' : 'camera')
    },
    [saveEntry, updateSettings],
  )

  const saveReflection = useCallback(
    async (entry: Entry, felt: FeltScore, chips: ChipId[]) => {
      await putEntry({ ...entry, felt_score: felt, chips, rated_at: Date.now() })
      // Answering resets the ignore run — the nudge worked, so stop counting.
      await saveSettings({ consecutive_ignores: 0, last_reminder_for: null })
      await log.refresh()
      flash(copy.tonight.savedThanks)
      setScreen('log')
    },
    [flash, log],
  )

  const applyFollowUp = useCallback(
    async (entryId: string, result: FollowUpResult) => {
      setFollowUp(null)

      const entry = log.entries.find((e) => e.id === entryId)
      if (entry && result.tempBand !== entry.context.temp_band) {
        await putEntry({
          ...entry,
          context: { ...entry.context, temp_band: result.tempBand },
        })
      }

      if (result.linkTo) await linkEntries(entryId, result.linkTo)
      if (result.tag) await tagEntry(entryId, result.tag)

      await log.refresh()
    },
    [log],
  )

  // --- notification tap carrying an inline rating (J2) -------------------

  useEffect(() => {
    if (log.loading) return
    const params = new URLSearchParams(window.location.search)
    const rate = params.get('rate')
    if (!rate) return

    const score = Number(rate) as FeltScore
    const target = unrated[0]
    if (target && score >= 1 && score <= 5) {
      void saveReflection(target, score, [])
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, [log.loading, saveReflection, unrated])

  // --- render -----------------------------------------------------------

  if (log.loading || screen === null) {
    return <div className="app" />
  }

  if (!log.settings.onboarded) {
    return <OnboardingScreen onDone={onSeedsDone} />
  }

  const tabs = visibleTabs(log.entries.length)

  const body = (() => {
    switch (screen) {
      case 'camera':
        return (
          <CameraScreen
            settings={log.settings}
            alreadyLoggedToday={entriesToday.length > 0}
            onCaptured={onCaptured}
            onPickFile={onPickFile}
            onExit={() => setScreen('log')}
          />
        )

      case 'tonight': {
        const target = openEntry ?? unrated[0] ?? null
        /*
         * The gap before *this* entry, not the gap between the two newest.
         * The old form compared the second-newest to today, which fires the
         * welcome-back message at essentially arbitrary moments.
         */
        const previous = target
          ? log.entries.find((e) => e.date < target.date)
          : undefined
        const gapDays = target && previous ? daysBetween(previous.date, target.date) : 0
        return (
          <TonightScreen
            entry={target}
            showWelcomeBack={gapDays >= 14}
            onSave={(felt, chips) => target && void saveReflection(target, felt, chips)}
            onSkip={() => {
              setOpenEntry(null)
              setScreen('log')
            }}
            onRemove={openEntry ? () => setConfirmRemove(openEntry) : undefined}
          />
        )
      }

      case 'shortlist':
        return (
          <ShortlistScreen
            entries={log.entries}
            context={{ today, tempBand: todayTempBand }}
            tempBand={todayTempBand}
            onTempBand={setTappedTemp}
            onWearAgain={(entry) => void wearAgain(entry)}
          />
        )

      case 'insights':
        return (
          <InsightsScreen
            input={{
              entries: log.entries,
              outfits: log.outfits,
              items: log.items,
              entryItems: log.entryItems,
              today,
              softened: log.settings.softened_at !== null,
              dismissed: log.dismissed,
            }}
            entriesById={entriesById}
            onDismiss={(id) => void dismissInsight(id).then(() => log.refresh())}
            onResume={() => void updateSettings({ softened_at: null })}
          />
        )

      case 'settings':
        return (
          <SettingsScreen
            settings={log.settings}
            onChange={(patch) => void updateSettings(patch)}
            onWiped={() => {
              __resetDbForTests()
              window.location.reload()
            }}
          />
        )

      case 'log':
      default:
        return (
          <LogScreen
            entries={log.entries}
            settings={log.settings}
            today={today}
            onOpen={(entry) => {
              setOpenEntry(entry)
              setScreen('tonight')
            }}
            onAddPast={() => setDatePicker(true)}
            installNudgeDismissed={installNudgeDismissed}
            onDismissInstallNudge={() => setInstallNudgeDismissed(true)}
          />
        )
    }
  })()

  return (
    <div className="app">
      {body}

      {screen !== 'camera' ? (
        <>
          <button
            type="button"
            className="capture-bar"
            onClick={() => setScreen('camera')}
          >
            {TAB_LABELS.camera}
          </button>
          <nav className="tabs" aria-label="Sections">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className="tab"
                aria-current={screen === tab ? 'page' : undefined}
                onClick={() => {
                  setOpenEntry(null)
                  setScreen(tab)
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>
        </>
      ) : null}

      {/* J3 + context capture, on one surface. Dismissing costs nothing. */}
      {followUp ? (
        <CaptureFollowUp
          match={followUp.matchId ? (entriesById.get(followUp.matchId) ?? null) : null}
          suggestions={log.items.map((item) => item.label)}
          onDone={(result) => void applyFollowUp(followUp.entryId, result)}
        />
      ) : null}

      {/* J9: backdating, up to a week. Always available, never nagged about. */}
      {datePicker ? (
        <Sheet
          title={copy.log.pickDate}
          body={copy.log.pickDateHint}
          onDismiss={() => setDatePicker(false)}
        >
          <div className="stack">
            {Array.from({ length: BACKDATE_LIMIT_DAYS }, (_, offset) => addDays(today, -(offset + 1))).map(
              (date) => (
                <button
                  key={date}
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => {
                    setPendingDate(date)
                    setDatePicker(false)
                    setScreen('camera')
                  }}
                >
                  {mediumLabel(date)}
                </button>
              ),
            )}
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setDatePicker(false)}
            >
              {copy.common.cancel}
            </button>
          </div>
        </Sheet>
      ) : null}

      {confirmRemove ? (
        <Sheet
          title={copy.tonight.removeConfirm}
          onDismiss={() => setConfirmRemove(null)}
        >
          <div className="stack">
            <button
              type="button"
              className="btn btn--danger btn--block"
              onClick={() => void removeEntry(confirmRemove)}
            >
              {copy.tonight.removeGo}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setConfirmRemove(null)}
            >
              {copy.common.cancel}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* J8: after a low stretch, offer less rather than more. */}
      {softenOffer ? (
        <Sheet title={copy.soften.title} body={copy.soften.body} onDismiss={() => setSoftenOffer(false)}>
          <div className="stack">
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                setSoftenOffer(false)
                void updateSettings({ reminder_enabled: false })
              }}
            >
              {copy.soften.pauseReminders}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                setSoftenOffer(false)
                void updateSettings({ softened_at: Date.now() })
              }}
            >
              {copy.soften.pauseInsights}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setSoftenOffer(false)}
            >
              {copy.soften.keepGoing}
            </button>
          </div>
        </Sheet>
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  )
}
