import { useEffect, useMemo } from 'react'
import type { Entry, Settings } from '../types'
import { copy } from '../lib/copy'
import { addDays, daysBetween, mediumLabel, type DateKey } from '../lib/dates'
import { Photo } from '../app/Photo'
import { isInstalled, isIos } from '../lib/storage'
import { SponsorSlot } from '../app/SponsorSlot'
import { shouldShowSponsor } from '../lib/sponsor'

/**
 * The log grid.
 *
 * J9 is the whole design of this screen. A missed day renders as an empty cell
 * — no dotted outline, no grey placeholder, no "you missed this" affordance —
 * so a gap reads as whitespace rather than an accusation. There is no streak
 * counter anywhere, and the header counts days logged rather than days in a
 * row, because those two numbers produce very different feelings about the
 * same week.
 */
/*
 * A gap is whitespace, but it should not be a chore to scroll past. Six blanks
 * reads clearly as "there is a break here" without making a fortnight away feel
 * like a wall — which would turn neutral whitespace into a statement after all.
 */
const MAX_GAP_CELLS = 6

export function LogScreen({
  entries,
  settings,
  today,
  onOpen,
  onAddPast,
  onWrite,
  installNudgeDismissed,
  onDismissInstallNudge,
  sponsorShown,
  onSponsorShown,
}: {
  entries: readonly Entry[]
  settings: Settings
  today: DateKey
  onOpen: (entry: Entry) => void
  onAddPast: () => void
  onWrite: () => void
  installNudgeDismissed: boolean
  onDismissInstallNudge: () => void
  sponsorShown: boolean
  onSponsorShown: () => void
}) {
  /*
   * M2: on iOS this is a data-safety notice, not a growth prompt.
   *
   * Safari applies a seven-day eviction window to sites that are not installed
   * to the home screen, and refuses `storage.persist()` entirely. For a
   * local-only log that means a fortnight away from the app can take the whole
   * history with it. Installing is the only defence, so the app has to say so.
   */
  const showInstallNudge = !installNudgeDismissed && isIos() && !isInstalled() && entries.length > 0
  /**
   * Entries newest-first with placeholder cells for skipped days, so the grid
   * stays calendar-shaped instead of collapsing a fortnight's absence into an
   * invisible seam.
   */
  const cells = useMemo(() => {
    if (entries.length === 0) return []

    const out: Array<{ kind: 'entry'; entry: Entry } | { kind: 'gap'; key: string }> = []
    let cursor: DateKey = entries[0]!.date > today ? entries[0]!.date : today

    for (const entry of entries) {
      // Cap the run of blanks — a six-month pause should not mean scrolling
      // past six months of nothing to reach the log.
      const gap = Math.min(daysBetween(entry.date, cursor), MAX_GAP_CELLS)
      for (let i = 0; i < gap; i++) {
        out.push({ kind: 'gap', key: `${entry.id}-gap-${i}` })
      }
      out.push({ kind: 'entry', entry })
      cursor = addDays(entry.date, -1)
    }

    return out
  }, [entries, today])

  const ratedCount = entries.filter((e) => e.felt_score !== null).length

  const sponsorVisible = shouldShowSponsor({
    entries,
    today,
    slot: 'journal',
    alreadyShownThisSession: sponsorShown,
  })
  useEffect(() => {
    if (sponsorVisible) onSponsorShown()
  }, [sponsorVisible, onSponsorShown])

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.app.name}</span>
        <h1>{copy.log.title}</h1>
        <span className="sub">{copy.log.entryCount(entries.length)}</span>
      </div>

      {showInstallNudge ? (
        <div className="notice">
          <span className="eyebrow">{copy.log.installTitle}</span>
          <p className="note">{copy.log.installBodyIos}</p>
          <button type="button" className="btn btn--quiet" onClick={onDismissInstallNudge}>
            {copy.log.installDismiss}
          </button>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="empty">{copy.log.empty}</p>
      ) : (
        <>
          <div className="grid">
            {cells.map((cell) =>
              cell.kind === 'gap' ? (
                <div key={cell.key} className="grid-gap" aria-hidden="true" />
              ) : (
                <button
                  key={cell.entry.id}
                  type="button"
                  className={[
                    'grid-cell',
                    cell.entry.photo_id === null ? 'grid-cell--written' : '',
                    settings.blur_thumbnails && cell.entry.photo_id !== null ? 'blurred' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onOpen(cell.entry)}
                  aria-label={`${mediumLabel(cell.entry.date)}${
                    cell.entry.photo_id === null ? `, ${copy.log.writtenDay}` : ''
                  }${cell.entry.felt_score === null ? `, ${copy.log.unrated}` : ''}`}
                >
                  {cell.entry.photo_id === null ? (
                    <span>{cell.entry.note}</span>
                  ) : (
                    <Photo photoId={cell.entry.photo_id} alt="" />
                  )}
                  {cell.entry.felt_score !== null ? (
                    <span className="felt-badge">{cell.entry.felt_score}</span>
                  ) : (
                    <span className="unrated-dot" aria-hidden="true" />
                  )}
                </button>
              ),
            )}
          </div>

          {ratedCount < entries.length ? (
            <p className="note note--centred">
              {entries.length - ratedCount} waiting for a reflection.
            </p>
          ) : null}
        </>
      )}

      {/*
        * Backdating sits outside the empty check on purpose. It was previously
        * only rendered once the log had something in it, which locked out the
        * exact person it helps most: someone on day one who wants to enter the
        * few days they remember. J9 says backdating is always available.
        */}
      <div className="spacer" />
      <SponsorSlot
        entries={entries}
        today={today}
        slot="journal"
        alreadyShownThisSession={sponsorShown}
      />

      <div className="stack">
        {/* Typing is offered next to the camera, not buried behind it. */}
        <button type="button" className="btn btn--ghost btn--block" onClick={onWrite}>
          {copy.write.action}
        </button>
        <button type="button" className="btn btn--quiet btn--block" onClick={onAddPast}>
          {copy.log.addPast}
        </button>
      </div>
    </div>
  )
}
