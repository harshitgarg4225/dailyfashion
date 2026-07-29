import type { Entry } from '../types'
import { copy } from '../lib/copy'
import { agoLabel, daysBetween, mediumLabel, type DateKey } from '../lib/dates'
import { buildShortlist, type ShortlistContext, trackRecord } from '../lib/shortlist'
import { TEMP_BANDS } from '../lib/context'
import type { TempBand } from '../types'
import { Photo } from '../app/Photo'

/**
 * J6: a shortlist, not advice.
 *
 * Three photographs of days that went well, and a header that says exactly
 * what filtered them. There is no generated sentence anywhere on this screen
 * and no opinion about clothes — the app is handing back the user's own
 * evidence, which is the only thing it is qualified to do.
 *
 * The header is chosen from what the query could actually honour: it claims a
 * weather match only when the picks really were filtered by temperature.
 */
export function ShortlistScreen({
  entries,
  context,
  tempBand,
  onTempBand,
  onWearAgain,
}: {
  entries: readonly Entry[]
  context: ShortlistContext
  tempBand: TempBand | null
  onTempBand: (band: TempBand | null) => void
  onWearAgain: (entry: Entry) => void
}) {
  const result = buildShortlist(entries, context)

  if (!result.unlocked) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>{copy.shortlist.title}</h1>
        </div>
        <p className="empty">
          {copy.shortlist.locked}
          <br />
          <span className="note">{copy.shortlist.remaining(result.entriesNeeded)}</span>
        </p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.app.name}</span>
        <h1>{copy.shortlist.title}</h1>
      </div>

      {/*
        * The three-way tap that keeps the airplane-mode promise intact. Without
        * it the header can never honestly claim "days like today", because the
        * app has no idea what today is like and refuses to guess over a network.
        */}
      <div className="field">
        <span className="field-label">{copy.shortlist.tempPrompt}</span>
        <div className="btn-row">
          {TEMP_BANDS.map((band) => (
            <button
              key={band.id}
              type="button"
              className="btn btn--ghost btn--flex"
              aria-pressed={tempBand === band.id}
              onClick={() => onTempBand(tempBand === band.id ? null : band.id)}
            >
              {band.label}
            </button>
          ))}
        </div>
      </div>

      <p className="note">
        {result.weatherMatched ? copy.shortlist.headerWeather : copy.shortlist.headerGeneral}
      </p>

      <div className="spacer" />

      {result.picks.length === 0 ? (
        <p className="empty">{copy.insights.empty}</p>
      ) : (
        <div className="strip">
          {result.picks.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="strip-item"
              onClick={() => onWearAgain(entry)}
            >
              <Photo photoId={entry.photo_id} alt="" thumb />
              <span className="strip-meta">
                <strong>
                  {entry.garment ? entry.garment.name : mediumLabel(entry.date)}
                </strong>
                {(() => {
                  const record = trackRecord(entry, entries)
                  return record ? (
                    <span className="note">
                      {copy.shortlist.record(record.wears, record.goodDays)}
                    </span>
                  ) : null
                })()}
                <span className="note">
                  {agoLabel(daysBetween(entry.date, context.today as DateKey))} ·{' '}
                  {copy.shortlist.wearAgain}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
