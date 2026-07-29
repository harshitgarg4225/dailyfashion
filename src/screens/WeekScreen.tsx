import { useMemo, useState } from 'react'
import { copy } from '../lib/copy'
import { buildWeekWrapped, MIN_DAYS_FOR_WRAP } from '../lib/weekWrapped'
import { renderWeekCard } from '../lib/shareCard'
import { shareImage } from '../lib/share'
import { chipLabel } from '../lib/chips'
import { mediumLabel } from '../lib/dates'
import { Photo } from '../app/Photo'
import { getPhoto } from '../db/db'
import { COMMUNITY_SUBMIT_URL, COMMUNITY_URL } from '../lib/community'
import type { Entry } from '../types'

/**
 * Sunday's reason to open the app.
 *
 * The product's real payoff is a fortnight away, which is a long time to hold
 * someone's attention on faith. This is the shorter loop: seven days is enough
 * to be worth looking at, and — crucially — enough to be worth showing to
 * somebody, which is the only distribution this app has.
 *
 * It reports, it does not conclude. There is no average on this screen and no
 * superlative resting on one; a weekly "your colour is green" would be the
 * fourteen-evening gate quietly circumvented, arriving twice as often on half
 * the evidence. Counts of things that happened are simply true at any n, and
 * that is the entire licence this screen operates under.
 */

/** Photographs decoded for the share card. Matches the sheet's capacity. */
const CARD_PHOTOS = 6

export function WeekScreen({
  entries,
  today,
}: {
  entries: readonly Entry[]
  today: string
}) {
  const week = useMemo(() => buildWeekWrapped(entries, today), [entries, today])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const share = async () => {
    setBusy(true)
    setNote(null)
    try {
      const blobs = await Promise.all(
        week.photoIds.slice(0, CARD_PHOTOS).map((id) => getPhoto(id)),
      )
      const bitmaps = await Promise.all(
        blobs
          .filter((blob): blob is Blob => Boolean(blob))
          .map((blob) => createImageBitmap(blob)),
      )

      const card = await renderWeekCard({ week, photos: bitmaps })
      // Decoded bitmaps hold real memory; a week of 1400px frames is not free.
      bitmaps.forEach((bitmap) => bitmap.close())

      const outcome = await shareImage({
        blob: card,
        filename: `daily-fashion-${week.to}.jpg`,
        title: copy.week.shareCaption,
      })

      if (outcome === 'shared') setNote(copy.week.shareShared)
      else if (outcome === 'saved') setNote(copy.week.shareSaved)
    } catch {
      setNote(copy.week.shareFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.week.tab}</span>
        <h1>{copy.week.title}</h1>
        <span className="sub">
          {copy.week.range(mediumLabel(week.from), mediumLabel(week.to))}
        </span>
      </div>

      {!week.enough ? (
        <p className="empty">{copy.week.thin(week.daysLogged, MIN_DAYS_FOR_WRAP)}</p>
      ) : (
        <>
          <dl className="figures">
            <div className="figure">
              <dt className="eyebrow">{copy.week.daysLabel}</dt>
              <dd>{week.daysLogged}</dd>
            </div>
            <div className="figure">
              <dt className="eyebrow">{copy.week.answeredLabel}</dt>
              <dd>{week.eveningsAnswered}</dd>
            </div>
            <div className="figure">
              <dt className="eyebrow">{copy.week.repeatsLabel}</dt>
              <dd>{week.repeats.reduce((n, r) => n + r.times, 0)}</dd>
            </div>
          </dl>

          {/* The week itself, which is the part anyone actually wants to see. */}
          {week.photoIds.length > 0 ? (
            <div className="week-strip">
              {week.photoIds.slice(0, CARD_PHOTOS).map((id) => (
                <div key={id} className="week-frame">
                  <Photo photoId={id} alt="" className="week-photo" />
                </div>
              ))}
            </div>
          ) : null}

          {week.colours.length > 0 ? (
            <>
              <hr className="rule" />
              <h2 className="summary-heading">{copy.week.wornTitle}</h2>
              <p className="note">
                {copy.week.worn(week.colours.slice(0, 3).map((c) => c.colour).join(', '))}
              </p>
              <p className="note">
                {week.repeats.length === 0
                  ? copy.week.noRepeats
                  : copy.week.repeats(
                      week.repeats.length,
                      week.repeats.reduce((n, r) => n + r.times, 0),
                    )}
              </p>
            </>
          ) : null}

          {week.events.length > 0 ? (
            <>
              <hr className="rule" />
              <h2 className="summary-heading">{copy.week.eventsTitle}</h2>
              {week.events.map((event) => (
                <p key={event.chip} className="note">
                  {copy.week.event(chipLabel(event.chip), event.days)}
                </p>
              ))}
            </>
          ) : null}

          {/*
            * Sharing, described before it happens.
            *
            * The body says exactly what the image carries and what it leaves
            * behind, because "share" on a product like this has to be a decision
            * someone makes with full information rather than a button they
            * discover the consequences of afterwards.
            */}
          <hr className="rule" />
          <h2 className="summary-heading">{copy.week.shareTitle}</h2>
          <p className="note">{copy.week.shareBody}</p>

          {week.photoIds.length === 0 ? (
            <p className="note">{copy.week.shareNothing}</p>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--block"
                disabled={busy}
                onClick={() => void share()}
              >
                {busy ? copy.week.sharePreparing : copy.week.shareGo}
              </button>
              <p className="note">{copy.week.shareHint}</p>
            </>
          )}

          {note ? <p className="note note--centred">{note}</p> : null}

          {/*
            * The community. A plain link, deliberately: an anchor cannot be
            * popup-blocked after the async card render the way window.open
            * can, and it makes the one-directional relationship visible in
            * the markup — the app links out, nothing links in.
            */}
          {week.photoIds.length > 0 ? (
            <>
              <hr className="rule" />
              <h2 className="summary-heading">{copy.week.communityTitle}</h2>
              <p className="note">{copy.week.communityBody}</p>
              <div className="stack">
                <a
                  className="btn btn--ghost btn--block"
                  href={COMMUNITY_SUBMIT_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {copy.week.communityGo}
                </a>
                <a
                  className="btn btn--quiet btn--block"
                  href={COMMUNITY_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {copy.week.communityJoin}
                </a>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
