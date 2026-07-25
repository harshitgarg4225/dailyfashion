import type { Entry } from '../types'
import { copy } from '../lib/copy'
import { agoLabel, daysBetween, mediumLabel, type DateKey } from '../lib/dates'
import { buildShortlist, type ShortlistContext } from '../lib/shortlist'
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
  onWearAgain,
}: {
  entries: readonly Entry[]
  context: ShortlistContext
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
              <Photo photoId={entry.photo_id} alt="" />
              <span className="strip-meta">
                <strong>{mediumLabel(entry.date)}</strong>
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
