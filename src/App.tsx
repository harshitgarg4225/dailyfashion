import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChipId, Entry, FeltScore, ImageSignature, Settings, TempBand } from './types'
import { useLog } from './app/useLog'
import { Sheet, Toast } from './app/controls'
import { Photo } from './app/Photo'
import { CameraScreen } from './screens/CameraScreen'
import { TonightScreen } from './screens/TonightScreen'
import { LogScreen } from './screens/LogScreen'
import { ShortlistScreen } from './screens/ShortlistScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { OnboardingScreen, type SeedPhoto } from './screens/OnboardingScreen'
import { copy } from './lib/copy'
import { captureContext, launchIntent, TEMP_BANDS } from './lib/context'
import { daysBetween, shortLabel, toDateKey, type DateKey } from './lib/dates'
import { bestMatch, SIMILARITY_WINDOW } from './lib/signature'
import { shouldOfferSoftening } from './lib/insights'
import { SHORTLIST_MIN_ENTRIES } from './lib/shortlist'
import {
  dismissInsight,
  linkEntries,
  newId,
  putEntry,
  putPhoto,
  saveSettings,
  tagEntry,
  __resetDbForTests,
} from './db/db'
import { preparePhoto } from './lib/capture'

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
  const [pendingTemp, setPendingTemp] = useState<{ entryId: string } | null>(null)
  const [pendingLink, setPendingLink] = useState<{ entryId: string; matchId: string } | null>(null)
  const [tagFor, setTagFor] = useState<string | null>(null)
  const [tagText, setTagText] = useState('')
  const [openEntry, setOpenEntry] = useState<Entry | null>(null)
  const [softenOffer, setSoftenOffer] = useState(false)

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

      // "Worn before?" against the most recent entries only.
      const match = bestMatch(signature, log.entries.slice(0, SIMILARITY_WINDOW))
      if (match) {
        setPendingLink({ entryId: entry.id, matchId: match.entry.id })
      } else {
        setPendingTemp({ entryId: entry.id })
      }

      return entry
    },
    [log, today],
  )

  const onCaptured = useCallback(
    async (blob: Blob, signature: ImageSignature) => {
      await saveEntry(blob, signature)
      await updateSettings({})
      flash(copy.camera.saved)
      setScreen('log')
    },
    [flash, saveEntry, updateSettings],
  )

  const onPickFile = useCallback(
    async (file: File) => {
      const prepared = await preparePhoto(file)
      await saveEntry(prepared.blob, prepared.signature)
      flash(copy.camera.saved)
      setScreen('log')
    },
    [flash, saveEntry],
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
      await log.refresh()
      flash(copy.tonight.savedThanks)
      setScreen('log')
    },
    [flash, log],
  )

  const setTempBand = useCallback(
    async (entryId: string, band: TempBand | null) => {
      const entry = entriesById.get(entryId) ?? log.entries.find((e) => e.id === entryId)
      if (entry) {
        await putEntry({ ...entry, context: { ...entry.context, temp_band: band } })
        await log.refresh()
      }
      setPendingTemp(null)
    },
    [entriesById, log],
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
        const gapDays =
          log.entries.length > 1 && log.entries[1]
            ? daysBetween(log.entries[1].date, today)
            : 0
        return (
          <TonightScreen
            entry={target}
            showWelcomeBack={gapDays >= 14}
            onSave={(felt, chips) => target && void saveReflection(target, felt, chips)}
            onSkip={() => {
              setOpenEntry(null)
              setScreen('log')
            }}
          />
        )
      }

      case 'shortlist':
        return (
          <ShortlistScreen
            entries={log.entries}
            context={{ today, tempBand: null }}
            onWearAgain={(entry) => {
              setOpenEntry(entry)
              setScreen('camera')
            }}
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
            onAddPast={() => setScreen('camera')}
          />
        )
    }
  })()

  return (
    <div className="app">
      {body}

      {screen !== 'camera' ? (
        <nav className="tabs" aria-label="Sections">
          <button
            type="button"
            className="tab"
            onClick={() => setScreen('camera')}
            aria-label={TAB_LABELS.camera}
          >
            <span className="tab-dot" />
            {TAB_LABELS.camera}
          </button>
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
              <span className="tab-dot" />
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      ) : null}

      {/* J3: one tap links two days into an outfit. Declining is equally fast. */}
      {pendingLink ? (
        <Sheet
          title={copy.link.ask(shortLabel(entriesById.get(pendingLink.matchId)?.date ?? today))}
          onDismiss={() => setPendingLink(null)}
        >
          {entriesById.get(pendingLink.matchId) ? (
            <div style={{ marginBottom: 16 }}>
              <Photo photoId={entriesById.get(pendingLink.matchId)!.photo_id} alt="" />
            </div>
          ) : null}
          <div className="stack">
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                const { entryId, matchId } = pendingLink
                setPendingLink(null)
                setTagFor(entryId)
                void linkEntries(entryId, matchId).then(() => log.refresh())
              }}
            >
              {copy.link.yes}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setPendingLink(null)}
            >
              {copy.link.no}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* Optional one-word tag. Never required, never blocking. */}
      {tagFor ? (
        <Sheet
          title={copy.link.tagPrompt}
          body={copy.link.tagHint}
          onDismiss={() => {
            setTagFor(null)
            setTagText('')
          }}
        >
          <input
            type="text"
            value={tagText}
            list="item-suggestions"
            placeholder="blue jacket"
            onChange={(event) => setTagText(event.target.value)}
          />
          <datalist id="item-suggestions">
            {log.items.map((item) => (
              <option key={item.id} value={item.label} />
            ))}
          </datalist>
          <div className="spacer" />
          <div className="stack">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={tagText.trim().length === 0}
              onClick={() => {
                const id = tagFor
                const label = tagText
                setTagFor(null)
                setTagText('')
                void tagEntry(id, label).then(() => log.refresh())
              }}
            >
              {copy.link.tagSave}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => {
                setTagFor(null)
                setTagText('')
              }}
            >
              {copy.common.close}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* The manual temperature tap — the one thing we ask for, and it is skippable. */}
      {pendingTemp ? (
        <Sheet
          title="What was it like out?"
          body="Optional. It stops the log blaming a jacket for the weather."
          onDismiss={() => void setTempBand(pendingTemp.entryId, null)}
        >
          <div className="btn-row">
            {TEMP_BANDS.map((band) => (
              <button
                key={band.id}
                type="button"
                className="btn btn--ghost"
                style={{ flex: 1 }}
                onClick={() => void setTempBand(pendingTemp.entryId, band.id)}
              >
                {band.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn--quiet btn--block"
            onClick={() => void setTempBand(pendingTemp.entryId, null)}
          >
            {copy.tonight.skip}
          </button>
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
