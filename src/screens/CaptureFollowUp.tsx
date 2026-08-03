import { useState } from 'react'
import type { Entry, FeltScore, TempBand } from '../types'
import { copy } from '../lib/copy'
import { TEMP_BANDS } from '../lib/context'
import { shortLabel } from '../lib/dates'
import { Sheet } from '../app/controls'
import { Photo } from '../app/Photo'

/**
 * Everything asked after the shutter, on one surface.
 *
 * The first version chained up to three modals — "same as Tuesday?", then a
 * tag field, then a temperature tap — after a capture flow that promised no
 * confirm screen. Each prompt was cheap; together they were a gauntlet, and
 * the one that fired last (temperature) was the one the insight engine most
 * depends on, so it was routinely skipped.
 *
 * Now it is a single sheet. The entry is already saved before this appears, so
 * every control here is genuinely optional and dismissing costs nothing.
 *
 * Temperature is asked on every capture rather than only when no match was
 * found. Repeat wears are exactly the population J7's confound suppression
 * needs context for — an outfit with five wears and no temperature recorded
 * cannot be checked against "you hate 38 degrees".
 */
export interface FollowUpResult {
  tempBand: TempBand | null
  linkTo: string | null
  tag: string | null
  /** An early answer to the evening question, for anyone who already knows. */
  felt: FeltScore | null
}

export function CaptureFollowUp({
  match,
  suggestions,
  onDone,
}: {
  /** The entry this capture may be a repeat of, if the matcher found one. */
  match: Entry | null
  suggestions: readonly string[]
  onDone: (result: FollowUpResult) => void
}) {
  const [tempBand, setTempBand] = useState<TempBand | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [tag, setTag] = useState('')
  const [felt, setFelt] = useState<FeltScore | null>(null)

  const finish = () =>
    onDone({
      tempBand,
      linkTo: linked && match ? match.id : null,
      tag: tag.trim().length > 0 ? tag : null,
      felt,
    })

  return (
    <Sheet title={copy.followUp.title} body={copy.followUp.body} onDismiss={finish}>
      {match ? (
        <div className="field">
          <span className="field-label">{copy.link.ask(shortLabel(match.date))}</span>
          <Photo photoId={match.photo_id} alt="" className="insight-photo" eager />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--ghost btn--flex"
              aria-pressed={linked === true}
              onClick={() => setLinked(true)}
            >
              {copy.link.yes}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--flex"
              aria-pressed={linked === false}
              onClick={() => setLinked(false)}
            >
              {copy.link.no}
            </button>
          </div>
        </div>
      ) : null}

      <div className="field">
        <span className="field-label">{copy.followUp.tempPrompt}</span>
        <span className="field-hint">{copy.followUp.tempHint}</span>
        <div className="btn-row">
          {TEMP_BANDS.map((band) => (
            <button
              key={band.id}
              type="button"
              className="btn btn--ghost btn--flex"
              aria-pressed={tempBand === band.id}
              onClick={() => setTempBand(tempBand === band.id ? null : band.id)}
            >
              {band.label}
            </button>
          ))}
        </div>
      </div>

      {/* The tag only appears once this is confirmed as a repeat — naming a
          thing you have worn twice is useful, naming a one-off is busywork. */}
      {linked ? (
        <div className="field">
          <span className="field-label">{copy.link.tagPrompt}</span>
          <span className="field-hint">{copy.link.tagHint}</span>
          <input
            type="text"
            value={tag}
            list="item-suggestions"
            placeholder="blue jacket"
            aria-label={copy.link.tagPrompt}
            onChange={(event) => setTag(event.target.value)}
          />
          <datalist id="item-suggestions">
            {suggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      ) : null}

      {/*
        * The evening question, offered early for anyone who already knows.
        * Compact on purpose: five squares, not the five labelled rows Tonight
        * uses. The full scale made this sheet scroll past its own Done
        * button; a morning answer is a tap, not a ceremony, and the labels
        * still speak through the accessible names.
        */}
      <div className="field">
        <span className="field-label">{copy.followUp.feltPrompt}</span>
        <span className="field-hint">{copy.followUp.feltHint}</span>
        <div className="felt-compact" role="group" aria-label={copy.followUp.feltPrompt}>
          {([1, 2, 3, 4, 5] as const).map((score) => (
            <button
              key={score}
              type="button"
              aria-pressed={felt === score}
              aria-label={copy.tonight.feltLabels[score]}
              onClick={() => setFelt(felt === score ? null : score)}
            >
              {score}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--block" onClick={finish}>
        {copy.followUp.done}
      </button>
    </Sheet>
  )
}
