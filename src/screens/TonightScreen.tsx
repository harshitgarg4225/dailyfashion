import { useState } from 'react'
import type { ChipId, Entry, FeltScore } from '../types'
import { copy } from '../lib/copy'
import { mediumLabel } from '../lib/dates'
import { FeltScale, ChipRow } from '../app/controls'
import { Photo } from '../app/Photo'

/**
 * J2 and the reframe: the two evening questions.
 *
 * "How did today feel" and "did anything happen" are shown together on one
 * screen rather than as a two-step flow, because the second question is what
 * gives the insight engine something to argue with — and a second screen is
 * where people leave. Both are optional, and Skip is always visible.
 *
 * Saving happens on the felt tap when nothing else is selected, so the
 * fast path really is one tap.
 */
export function TonightScreen({
  entry,
  onSave,
  onSkip,
  showWelcomeBack,
}: {
  entry: Entry | null
  onSave: (felt: FeltScore, chips: ChipId[]) => void
  onSkip: () => void
  showWelcomeBack: boolean
}) {
  const [felt, setFelt] = useState<FeltScore | null>(entry?.felt_score ?? null)
  const [chips, setChips] = useState<ChipId[]>(entry?.chips ?? [])

  if (!entry) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>{copy.tonight.title}</h1>
        </div>
        <p className="empty">{copy.tonight.nothingToRate}</p>
      </div>
    )
  }

  const toggle = (id: ChipId) =>
    setChips((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    )

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{copy.tonight.title}</h1>
        <span className="sub">{mediumLabel(entry.date)}</span>
      </div>

      {showWelcomeBack ? <p className="note">{copy.tonight.welcomeBack}</p> : null}

      <div className="card" style={{ padding: 10 }}>
        <Photo
          photoId={entry.photo_id}
          alt={`What you wore on ${mediumLabel(entry.date)}`}
          className="tonight-photo"
        />
      </div>

      <div className="field">
        <span className="field-label">{copy.tonight.prompt}</span>
        <FeltScale value={felt} onChange={setFelt} />
      </div>

      <div className="field">
        <span className="field-label">
          {copy.tonight.chipsPrompt} <span className="note">{copy.tonight.chipsHint}</span>
        </span>
        <ChipRow selected={chips} onToggle={toggle} />
      </div>

      <div className="stack">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={felt === null}
          onClick={() => felt !== null && onSave(felt, chips)}
        >
          {copy.tonight.save}
        </button>
        <button type="button" className="btn btn--quiet btn--block" onClick={onSkip}>
          {copy.tonight.skip}
        </button>
      </div>
    </div>
  )
}
