import { useMemo } from 'react'
import type { Entry, Settings } from '../types'
import { copy } from '../lib/copy'
import { addDays, daysBetween, mediumLabel, type DateKey } from '../lib/dates'
import { Photo } from '../app/Photo'

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
const MAX_GAP_CELLS = 21

export function LogScreen({
  entries,
  settings,
  today,
  onOpen,
  onAddPast,
}: {
  entries: readonly Entry[]
  settings: Settings
  today: DateKey
  onOpen: (entry: Entry) => void
  onAddPast: () => void
}) {
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

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.app.name}</span>
        <h1>{copy.log.title}</h1>
        <span className="sub">{copy.log.entryCount(entries.length)}</span>
      </div>

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
                  className={`grid-cell${settings.blur_thumbnails ? ' blurred' : ''}`}
                  onClick={() => onOpen(cell.entry)}
                  aria-label={`${mediumLabel(cell.entry.date)}${
                    cell.entry.felt_score === null ? `, ${copy.log.unrated}` : ''
                  }`}
                >
                  <Photo photoId={cell.entry.photo_id} alt="" />
                  {cell.entry.felt_score !== null ? (
                    <span className="felt-badge">{cell.entry.felt_score}</span>
                  ) : (
                    <span className="unrated-dot" aria-hidden="true" />
                  )}
                </button>
              ),
            )}
          </div>

          <div className="spacer" />
          <button type="button" className="btn btn--ghost btn--block" onClick={onAddPast}>
            {copy.log.addPast}
          </button>

          {ratedCount < entries.length ? (
            <p className="note note--centred">
              {entries.length - ratedCount} waiting for a reflection.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
