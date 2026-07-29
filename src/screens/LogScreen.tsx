import { useEffect, useMemo, useRef, useState } from 'react'
import type { Entry, Settings } from '../types'
import { copy } from '../lib/copy'
import { addDays, daysBetween, mediumLabel, type DateKey } from '../lib/dates'
import { Photo } from '../app/Photo'
import { isInstalled, isIos } from '../lib/storage'
import { SponsorSlot } from '../app/SponsorSlot'
import { shouldShowSponsor } from '../lib/sponsor'
import { searchEntries } from '../lib/search'
import type { EntryItem, Item } from '../types'

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

/**
 * Days in the log before search is offered.
 *
 * Below this the grid fits on a screen and a search field is a control that
 * offers to find one of the four things already visible — clutter dressed as
 * capability. Search earns its place when scrolling has become the problem.
 */
const SEARCH_MIN_ENTRIES = 12

/** Cells rendered per slice; the sentinel extends the window on approach. */
const GRID_SLICE = 120

/** Below this the whole log is one screen and month headers are furniture. */
const MONTH_HEADER_MIN_ENTRIES = 30

/** "July 2026", from a YYYY-MM-DD key, in the user's locale. */
function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function LogScreen({
  entries,
  settings,
  today,
  items,
  entryItems,
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
  items: readonly Item[]
  entryItems: readonly EntryItem[]
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

    const out: Array<
      | { kind: 'entry'; entry: Entry }
      | { kind: 'gap'; key: string }
      | { kind: 'month'; key: string; label: string }
    > = []
    let cursor: DateKey = entries[0]!.date > today ? entries[0]!.date : today

    // Month headers appear once the grid is long enough that "when was that?"
    // has become a scrolling question. Below that they are furniture.
    const withMonths = entries.length > MONTH_HEADER_MIN_ENTRIES
    let lastMonth: string | null = null

    for (const entry of entries) {
      const month = entry.date.slice(0, 7)
      if (withMonths && month !== lastMonth) {
        out.push({ kind: 'month', key: month, label: monthLabel(entry.date) })
        lastMonth = month
      }

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

  /*
   * The grid renders in slices. A year of cells mounted at once is hundreds
   * of IntersectionObservers and thousands of DOM nodes for the dozen tiles
   * on screen; the sentinel below extends the window as it approaches.
   */
  const [limit, setLimit] = useState(GRID_SLICE)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cells.length <= limit) return
    const node = sentinel.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setLimit(cells.length)
      return
    }
    const observer = new IntersectionObserver(
      (hits) => {
        if (hits.some((hit) => hit.isIntersecting)) {
          setLimit((current) => current + GRID_SLICE)
        }
      },
      { rootMargin: '900px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [cells.length, limit])

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

  const [query, setQuery] = useState('')
  const searchable = entries.length >= SEARCH_MIN_ENTRIES
  const results = useMemo(
    () => (searchable && query.trim() ? searchEntries({ entries, items, entryItems }, query) : null),
    [searchable, query, entries, items, entryItems],
  )

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.app.name}</span>
        <h1>{copy.log.title}</h1>
        <span className="sub">{copy.log.entryCount(entries.length)}</span>
      </div>

      {searchable ? (
        <div className="search">
          <label className="visually-hidden" htmlFor="log-search">
            {copy.log.searchLabel}
          </label>
          <input
            id="log-search"
            className="search-input"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder={copy.log.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="btn btn--quiet" onClick={() => setQuery('')}>
              {copy.log.searchClear}
            </button>
          ) : null}
        </div>
      ) : null}

      {showInstallNudge ? (
        <div className="notice">
          <span className="eyebrow">{copy.log.installTitle}</span>
          <p className="note">{copy.log.installBodyIos}</p>
          <button type="button" className="btn btn--quiet" onClick={onDismissInstallNudge}>
            {copy.log.installDismiss}
          </button>
        </div>
      ) : null}

      {results !== null ? (
        results.length === 0 ? (
          <p className="empty">{copy.log.searchNone}</p>
        ) : (
          <>
            <p className="note">{copy.log.searchCount(results.length)}</p>
            <div className="stack">
              {results.map((match) => (
                <button
                  key={match.entry.id}
                  type="button"
                  className="result"
                  onClick={() => onOpen(match.entry)}
                >
                  <span className="result-photo">
                    <Photo photoId={match.entry.photo_id} alt="" className="result-image" thumb />
                  </span>
                  <span className="result-text">
                    <strong>{mediumLabel(match.entry.date)}</strong>
                    {match.entry.note ? <span className="result-note">{match.entry.note}</span> : null}
                    {/*
                      * Why it matched, in the user's terms. The same argument the
                      * insight engine makes: a result surfaced for reasons it
                      * cannot explain is the "trust me" this product refuses.
                      */}
                    <small>{copy.log.searchWhy(match.reasons.join(', '))}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )
      ) : entries.length === 0 ? (
        <p className="empty">{copy.log.empty}</p>
      ) : (
        <>
          <div className="grid">
            {cells.slice(0, limit).map((cell) =>
              cell.kind === 'gap' ? (
                <div key={cell.key} className="grid-gap" aria-hidden="true" />
              ) : cell.kind === 'month' ? (
                <div key={cell.key} className="grid-month">
                  {cell.label}
                </div>
              ) : (
                <button
                  key={cell.entry.id}
                  type="button"
                  className={[
                    'grid-cell',
                    settings.blur_thumbnails && cell.entry.photo_id !== null ? 'blurred' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onOpen(cell.entry)}
                  aria-label={`${mediumLabel(cell.entry.date)}${
                    cell.entry.photo_id === null ? `, ${copy.log.writtenDay}` : ''
                  }${cell.entry.felt_score === null ? `, ${copy.log.unrated}` : ''}`}
                >
                  <span
                    className={
                      cell.entry.photo_id === null
                        ? 'cell-frame cell-frame--written'
                        : 'cell-frame'
                    }
                  >
                    {cell.entry.photo_id === null ? (
                      <span>{cell.entry.note}</span>
                    ) : (
                      <Photo photoId={cell.entry.photo_id} alt="" thumb />
                    )}
                    {cell.entry.felt_score !== null ? (
                      <span className="felt-badge">{cell.entry.felt_score}</span>
                    ) : (
                      <span className="unrated-dot" aria-hidden="true" />
                    )}
                  </span>
                  {cell.entry.garment ? (
                    <span className="cell-word">{cell.entry.garment.name}</span>
                  ) : null}
                </button>
              ),
            )}
          </div>

          {cells.length > limit ? <div ref={sentinel} aria-hidden="true" /> : null}

          {ratedCount < entries.length ? (
            /*
              * Not a status line — the next step, tappable. The evening
              * answer is the whole product's fuel, and the person most
              * likely to skip it is the one who only sees a passive count.
              */
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                const unanswered = entries.find((e) => e.felt_score === null)
                if (unanswered) onOpen(unanswered)
              }}
            >
              {copy.log.answerNow(entries.length - ratedCount)}
            </button>
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
