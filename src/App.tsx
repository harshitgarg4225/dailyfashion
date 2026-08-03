import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { LockScreen } from './screens/LockScreen'
import { WriteScreen } from './screens/WriteScreen'
import { GymScreen } from './screens/GymScreen'
import { OffersScreen } from './screens/OffersScreen'
import { WeekScreen } from './screens/WeekScreen'
import { CaptureFollowUp, type FollowUpResult } from './screens/CaptureFollowUp'
import { copy } from './lib/copy'
import { captureContext, launchIntent } from './lib/context'
import { addDays, BACKDATE_LIMIT_DAYS, daysBetween, mediumLabel, toDateKey, type DateKey } from './lib/dates'
import { bestMatch, bestMatchFused, SIMILARITY_WINDOW } from './lib/signature'
import { shouldOfferSoftening } from './lib/insights'
import { SHORTLIST_MIN_ENTRIES } from './lib/shortlist'
import { MIN_DAYS_FOR_WRAP } from './lib/weekWrapped'
import {
  styleSnapshot,
  STYLE_SNAPSHOT_INTERVAL_MS,
  STYLE_SNAPSHOT_MIN_ENTRIES,
} from './lib/styleProfile'
import {
  allEntryItems,
  clonePhoto,
  deleteEntry,
  setOutfitCost,
  getPhoto,
  getThumb,
  relinkEntry,
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
import { refingerprintOldEntries } from './lib/refingerprint'
import { nameEntryPhoto, nameOldEntries } from './lib/garmentNamer'
import { thumbOldEntries } from './lib/thumbs'
import { track } from './lib/telemetry'
import { hasSystemScheduledReminders } from './lib/platform'
import { cancelNativeReminder, onReminderAction, scheduleNativeReminder } from './lib/nativeReminders'
import { getLock } from './db/db'
import type { LockRecord } from './lib/lock'

type Screen =
  | 'camera'
  | 'gym'
  | 'offers'
  | 'write'
  | 'tonight'
  | 'log'
  | 'week'
  | 'summary'
  | 'shortlist'
  | 'insights'
  | 'settings'

/**
 * Tabs appear as the log earns them, so an empty app is not a wall of dead UI.
 *
 * Summary is present from day one on purpose — it is the screen that answers
 * "what is this for?", and hiding it until the log is established would keep it
 * from the only people who still need the question answered.
 */
function visibleTabs(entryCount: number): Screen[] {
  const tabs: Screen[] = ['log']
  if (entryCount >= SHORTLIST_MIN_ENTRIES) tabs.splice(0, 0, 'shortlist')
  // The week sits next to the journal because it is about the same thing at a
  // different zoom, and it appears as soon as there is a week worth recapping —
  // it is the only payoff that arrives before the fortnight is up.
  if (entryCount >= MIN_DAYS_FOR_WRAP) tabs.push('week')
  tabs.push('gym', 'insights', 'settings')
  return tabs
}

const TAB_LABELS: Record<Screen, string> = {
  camera: 'Capture',
  gym: 'Training',
  offers: 'Offers',
  write: 'Write',
  tonight: 'Tonight',
  log: 'Journal',
  week: 'Week',
  summary: 'Progress',
  shortlist: 'Today',
  insights: 'Patterns',
  settings: 'Settings',
}

export default function App() {
  const log = useLog()
  const [screen, setScreen] = useState<Screen | null>(null)
  const [toast, setToast] = useState<
    { message: string; action?: { label: string; onAction: () => void } } | null
  >(null)

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
  const [sponsorShown, setSponsorShown] = useState(false)
  const [lock, setLock] = useState<LockRecord | null | undefined>(undefined)
  const [unlocked, setUnlocked] = useState(false)

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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Entry count before the in-flight capture — the milestone arithmetic. */
  const captureCountRef = useRef(-1)
  const flash = useCallback(
    (message: string, action?: { label: string; onAction: () => void }) => {
      // A second flash must own the clock, or the first one's timer clears it
      // mid-sentence.
      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast(action ? { message, action } : { message })
      // Longer when there is something to undo — a two-second window to notice
      // a mis-tap and react to it is not a window at all.
      toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 1800)
    },
    [],
  )

  /*
   * A toast narrates the screen it was born on. The moment the user moves —
   * a tab, the camera, opening a day — it is stale, and worse than stale it
   * floats over whatever they are now trying to tap. Navigation dismisses it.
   */
  const navigate = useCallback((next: Screen) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(null)
    setScreen(next)
  }, [])

  // The lock is read once per launch, before anything from the log is painted.
  useEffect(() => {
    void getLock().then((record) => setLock(record))
  }, [])

  /*
   * Every screen starts at its own top. Without this, scrolling to the bottom
   * of one tab silently scrolls every other tab too — arrive on Training from
   * the foot of the Week page and the first thing shown is the middle of a
   * form, with the title somewhere above the viewport.
   */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

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
    // A no-op unless the user opted into usage sharing in Settings.
    void track('app_open')
  }, [log.loading, log.settings.onboarded])

  /*
   * The weekly style snapshot: garment words and colours as counts, for
   * consented users only. Weekly on purpose — a live feed of someone's
   * wardrobe would be surveillance; a Sunday-paper summary is analytics.
   */
  useEffect(() => {
    if (log.loading || !log.settings.share_usage) return
    if (log.entries.length < STYLE_SNAPSHOT_MIN_ENTRIES) return
    const last = log.settings.last_style_sent
    if (last !== null && Date.now() - last < STYLE_SNAPSHOT_INTERVAL_MS) return
    void track('style', { ...styleSnapshot(log.entries) })
    void updateSettings({ last_style_sent: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.loading, log.settings.share_usage, log.settings.last_style_sent, log.entries.length])

  /*
   * Bring older photographs onto the current fingerprint format.
   *
   * Signatures written before subject detection cannot be compared with current
   * ones, so without this a user's log would silently split in two at the
   * update — nothing from before could ever be recognised as the same outfit as
   * anything after, and the flagship observation needs five wears of one
   * outfit to appear.
   *
   * Deferred and batched. Someone opening the app to photograph an outfit must
   * not wait on housekeeping.
   */
  useEffect(() => {
    if (log.loading || !log.settings.onboarded) return

    const timer = setTimeout(() => {
      void refingerprintOldEntries().then((result) => {
        if (result.updated > 0) void log.refresh()
      })
      // After fingerprints, names. Same reasoning: photos already on the
      // device deserve features that shipped after they were taken.
      void nameOldEntries().then((result) => {
        if (result.named > 0) void log.refresh()
      })
      // And small renditions, so an old log's grid stops decoding full-size
      // JPEGs. No refresh needed — the grid falls back per-photo until then.
      void thumbOldEntries()
    }, 1500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    /*
     * Packaged builds hand the reminder to the operating system, which is the
     * whole point of packaging: it then arrives whether or not the app was
     * opened that day. The web path stays a page timer, with the limitation
     * stated in Settings rather than hidden.
     */
    if (hasSystemScheduledReminders()) {
      void scheduleNativeReminder(log.settings, {
        title: copy.reminder.notificationTitle,
        body: copy.reminder.notificationBody,
      })
      return cancelNativeReminder
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
      options: {
        date?: DateKey
        felt?: FeltScore | null
        skipPrompts?: boolean
        thumb?: Blob
      } = {},
    ) => {
      const date = options.date ?? today
      const photoId = newId('photo')
      await putPhoto(photoId, blob, options.thumb)

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
      void track('capture')

      // Naming runs after the save, never before it. The entry is already
      // durable; the model's word arrives whenever it arrives.
      const naming = nameEntryPhoto(entry.id, blob).then((updated) => {
        if (updated) void log.refresh()
        return updated
      })

      if (options.skipPrompts) return entry

      /*
       * "Worn before?", on the best ruler available in time.
       *
       * The fused matcher wants the photo's embedding, which the model is
       * computing right now. A warm model answers in well under a second, so
       * the prompt waits briefly for the better answer; a cold start loses
       * the race and the hash-only match goes out as it always did. The
       * entry is already saved either way — this delay is only about which
       * question appears on the follow-up sheet.
       */
      const named = await Promise.race([
        naming.catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ])
      const candidates = log.entries
        .filter((e) => e.id !== entry.id)
        .slice(0, SIMILARITY_WINDOW)
      const match = named?.embedding
        ? bestMatchFused({ signature, embedding: named.embedding }, candidates)
        : bestMatch(signature, candidates)
      setFollowUp({ entryId: entry.id, matchId: match?.entry.id ?? null })

      return entry
    },
    [log, today],
  )

  const onCaptured = useCallback(
    async (blob: Blob, signature: ImageSignature, thumb: Blob) => {
      /*
       * No flash here: the follow-up sheet opens over the log saying "your
       * photo is already saved", and a toast underneath it is clutter. The
       * flash fires when the sheet closes — with "Day one." for the first
       * capture, read before the save so first-ever means what it says.
       */
      captureCountRef.current = log.entries.length
      await saveEntry(blob, signature, { thumb, ...(pendingDate ? { date: pendingDate } : {}) })
      setPendingDate(null)
      setScreen('log')
    },
    [log.entries.length, pendingDate, saveEntry],
  )

  const onPickFile = useCallback(
    async (file: File) => {
      const prepared = await preparePhoto(file)
      captureCountRef.current = log.entries.length
      await saveEntry(prepared.blob, prepared.signature, {
        thumb: prepared.thumb,
        ...(pendingDate ? { date: pendingDate } : {}),
      })
      setPendingDate(null)
      setScreen('log')
    },
    [log.entries.length, pendingDate, saveEntry],
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
      // Only a photographed day can be worn again — there is nothing to repeat
      // about a written one.
      if (!source.photo_id) return
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
        // Same photograph, same garment, same embedding — re-reading a copy
        // would only give the same answers slower.
        garment: source.garment,
        embedding: source.embedding,
      }
      await putEntry(entry)

      // If the source was not yet part of a cluster, this pairing creates one.
      if (!source.outfit_id) await linkEntries(entry.id, source.id)

      await log.refresh()
      // The gym-number moment: the count, said out loud at the rep.
      const wears = log.entries.filter((e) => e.outfit_id === entry.outfit_id).length + 1
      flash(entry.outfit_id ? copy.log.wearCounted(wears) : copy.log.loggedAgain)
      setScreen('log')
    },
    [flash, log, today, todayTempBand],
  )

  /*
   * U2 finished properly: removal is undoable for the length of the toast.
   *
   * The row, its photograph, its thumb and its tag links are captured before
   * the delete, so undo restores the day *exactly* — not a lookalike. The
   * snapshot lives only in this closure; once the toast is gone, so is it,
   * and the delete is what it always claimed to be.
   */
  const removeEntry = useCallback(
    async (entry: Entry) => {
      setConfirmRemove(null)
      setOpenEntry(null)

      const [photo, thumbBlob, links] = await Promise.all([
        entry.photo_id ? getPhoto(entry.photo_id) : Promise.resolve(undefined),
        entry.photo_id ? getThumb(entry.photo_id) : Promise.resolve(undefined),
        allEntryItems().then((rows) => rows.filter((row) => row.entry_id === entry.id)),
      ])

      await deleteEntry(entry.id)
      if (entry.outfit_id) await recomputeOutfit(entry.outfit_id)
      await log.refresh()

      const undo = async () => {
        if (entry.photo_id && photo) await putPhoto(entry.photo_id, photo, thumbBlob)
        await putEntry(entry)
        await relinkEntry(links)
        if (entry.outfit_id) await recomputeOutfit(entry.outfit_id)
        await log.refresh()
        setToast(null)
      }

      flash(copy.tonight.removed, {
        label: copy.tonight.undo,
        onAction: () => void undo(),
      })
      setScreen('log')
    },
    [flash, log],
  )

  const onSeedsDone = useCallback(
    async (seeds: SeedPhoto[]) => {
      for (const seed of seeds) {
        // Seeding normally meets an empty log, but onboarding can also run
        // after an import restored one — a seed must not duplicate a day
        // that already exists.
        if (log.entries.some((e) => e.date === seed.date)) continue
        await saveEntry(seed.blob, seed.signature, {
          date: seed.date,
          felt: seed.felt,
          skipPrompts: true,
          thumb: seed.thumb,
        })
      }
      await updateSettings({ onboarded: true })
      setScreen(seeds.length > 0 ? 'log' : 'camera')
    },
    [saveEntry, updateSettings],
  )

  /**
   * A day recorded in words. Complete in one sitting — there is no morning
   * photograph to come back to tonight — so it saves the felt score and chips
   * alongside the text and never queues an evening prompt.
   */
  const saveWritten = useCallback(
    async (note: string, felt: FeltScore | null, chips: ChipId[]) => {
      const entry: Entry = {
        id: newId('entry'),
        date: pendingDate ?? today,
        photo_id: null,
        felt_score: felt,
        chips,
        outfit_id: null,
        context: captureContext(pendingDate ?? today, todayTempBand),
        note,
        signature: null,
        created_at: Date.now(),
        rated_at: felt !== null ? Date.now() : null,
        backdated: (pendingDate ?? today) !== today,
      }
      await putEntry(entry)
      setPendingDate(null)
      await log.refresh()
      flash(copy.write.savedThanks)
      setScreen('log')
    },
    [flash, log, pendingDate, today, todayTempBand],
  )

  const saveReflection = useCallback(
    async (entry: Entry, felt: FeltScore, chips: ChipId[], note: string | null = null) => {
      const previous: Entry = { ...entry }
      const updated: Entry = { ...entry, felt_score: felt, chips, note, rated_at: Date.now() }
      await putEntry(updated)
      log.patchEntry(updated)
      // Answering resets the ignore run — the nudge worked, so stop counting.
      await saveSettings({ consecutive_ignores: 0, last_reminder_for: null })
      // A rating changes an outfit's aggregates, so the cluster is recomputed
      // rather than left to drift away from its entries.
      if (updated.outfit_id) await recomputeOutfit(updated.outfit_id)
      await log.refresh()
      void track('reflection')

      flash(copy.tonight.savedThanks, {
        label: copy.tonight.undo,
        onAction: () => {
          void (async () => {
            await putEntry(previous)
            log.patchEntry(previous)
            if (previous.outfit_id) await recomputeOutfit(previous.outfit_id)
            await log.refresh()
            setToast(null)
            setOpenEntry(previous)
            setScreen('tonight')
          })()
        },
      })
      setScreen('log')
    },
    [flash, log],
  )

  const applyFollowUp = useCallback(
    async (entryId: string, result: FollowUpResult) => {
      setFollowUp(null)

      const entry = log.entries.find((e) => e.id === entryId)
      if (entry && (result.tempBand !== entry.context.temp_band || result.felt !== null)) {
        await putEntry({
          ...entry,
          context: { ...entry.context, temp_band: result.tempBand },
          // An early answer to the evening question, if one was given.
          ...(result.felt !== null
            ? { felt_score: result.felt, rated_at: Date.now() }
            : {}),
        })
      }

      if (result.linkTo) await linkEntries(entryId, result.linkTo)
      if (result.tag) await tagEntry(entryId, result.tag)

      await log.refresh()

      /*
       * The saved moment, delivered now that nothing is on top of it — and
       * the habit's quiet milestones with it. Day one, day seven, day
       * thirty: the three days a daily practice becomes real, each marked
       * with a sentence rather than a ceremony.
       */
      const nth = captureCountRef.current >= 0 ? captureCountRef.current + 1 : 0
      captureCountRef.current = -1
      flash(
        nth === 1
          ? copy.camera.savedFirst
          : nth === 7
            ? copy.camera.savedWeek
            : nth === 30
              ? copy.camera.savedMonth
              : copy.camera.saved,
      )
    },
    [flash, log],
  )

  /*
   * A rating given from the lock screen, natively.
   *
   * Registered once and kept for the app's lifetime, because the tap can arrive
   * while the app is backgrounded and the handler has to be listening when it
   * resumes.
   */
  useEffect(() => {
    if (log.loading) return

    return onReminderAction((rating) => {
      const target = unrated[0]
      if (!target) return
      if (rating !== null && rating >= 1 && rating <= 5) {
        void saveReflection(target, rating as FeltScore, [])
      } else {
        setOpenEntry(target)
        setScreen('tonight')
      }
    })
  }, [log.loading, saveReflection, unrated])

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

  /*
   * The gate comes before everything, including the loading state — a lock that
   * flashes the log for a frame while it decides is not a lock.
   */
  if (lock === undefined) {
    return <div className="app" />
  }

  if (lock !== null && !unlocked) {
    return <LockScreen record={lock} onUnlocked={() => setUnlocked(true)} />
  }

  // U4: a cold start with a full log used to paint an empty page.
  if (log.loading || screen === null) {
    return (
      <div className="app">
        <p className="loading">{copy.common.loading}</p>
      </div>
    )
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
            onSave={(felt, chips, note) =>
              target && void saveReflection(target, felt, chips, note)
            }
            onSkip={() => {
              setOpenEntry(null)
              setScreen('log')
            }}
            onRemove={openEntry ? () => setConfirmRemove(openEntry) : undefined}
            wears={
              target?.outfit_id
                ? log.entries.filter(
                    (e) => e.outfit_id === target.outfit_id && e.id !== target.id,
                  )
                : undefined
            }
            outfit={
              target?.outfit_id
                ? (log.outfits.find((o) => o.id === target.outfit_id) ?? null)
                : null
            }
            onSetCost={
              target?.outfit_id
                ? (cost) => {
                    void setOutfitCost(target.outfit_id!, cost).then(() => log.refresh())
                  }
                : undefined
            }
            onRename={
              target
                ? (name) => {
                    const updated: Entry = {
                      ...target,
                      garment: { name, source: 'user', confidence: null },
                    }
                    // Keep the open entry current so the rename is visible
                    // immediately, not after the next navigation.
                    if (openEntry?.id === target.id) setOpenEntry(updated)
                    void putEntry(updated).then(() => log.refresh())
                  }
                : undefined
            }
          />
        )
      }

      case 'gym':
        return <GymScreen today={today} />

      case 'offers':
        return <OffersScreen onBack={() => navigate('insights')} />

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
            unanswered={unrated.length}
            onAnswerNow={() => {
              // Oldest first: the day most at risk of being forgotten.
              const oldest = unrated[unrated.length - 1]
              if (oldest) {
                setOpenEntry(oldest)
                navigate('tonight')
              }
            }}
            entriesById={entriesById}
            onDismiss={(id, n) => void dismissInsight(id, n).then(() => log.refresh())}
            onResume={() => void updateSettings({ softened_at: null })}
          />
        )

      case 'settings':
        return (
          <SettingsScreen
            settings={log.settings}
            onChange={(patch) => void updateSettings(patch)}
            outfitCount={log.outfits.length}
            entryCount={log.entries.length}
            lock={lock}
            onLockChange={(record) => {
              setLock(record)
              setUnlocked(true)
            }}
            onImported={() => void log.refresh()}
            onWiped={() => {
              __resetDbForTests()
              window.location.reload()
            }}
          />
        )

      case 'write':
        return (
          <WriteScreen
            date={pendingDate ?? today}
            onSave={(note, felt, chips) => void saveWritten(note, felt, chips)}
            onCancel={() => {
              setPendingDate(null)
              setScreen('log')
            }}
          />
        )

      case 'week':
        return <WeekScreen entries={log.entries} today={today} />


      case 'log':
      default:
        return (
          <LogScreen
            entries={log.entries}
            settings={log.settings}
            today={today}
            items={log.items}
            entryItems={log.entryItems}
            onOpen={(entry) => {
              setOpenEntry(entry)
              navigate('tonight')
            }}
            onAddPast={() => setDatePicker(true)}
            onWrite={() => navigate('write')}
            onOpenOffers={() => navigate('offers')}
            sponsorShown={sponsorShown}
            onSponsorShown={() => setSponsorShown(true)}
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
            onClick={() => navigate('camera')}
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
                  navigate(tab)
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
          suggestions={[
            ...new Set([
              ...log.items.map((item) => item.label),
              // Garment words already in the log are the vocabulary someone
              // is most likely to reach for again — their own corrections
              // first, then the model's.
              ...log.entries
                .filter((e) => e.garment?.source === 'user')
                .map((e) => e.garment!.name),
              ...log.entries
                .filter((e) => e.garment?.source === 'model')
                .map((e) => e.garment!.name),
              // Occasion starters, last. Tags already power search and get
              // their own insight cards, which makes "gym" a first-class use
              // of the log — these words just make that discoverable before
              // anyone has invented their own vocabulary.
              'work',
              'gym',
              'date',
              'home',
              'travel',
            ]),
          ]}
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

      {toast ? <Toast message={toast.message} action={toast.action} /> : null}
    </div>
  )
}
