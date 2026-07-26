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
  onRemove,
  showWelcomeBack,
}: {
  entry: Entry | null
  onSave: (felt: FeltScore, chips: ChipId[], note: string | null) => void
  onSkip: () => void
  /** Only offered when opening an existing day, not on the evening prompt. */
  onRemove?: (() => void) | undefined
  showWelcomeBack: boolean
}) {
  const [felt, setFelt] = useState<FeltScore | null>(entry?.felt_score ?? null)
  const [chips, setChips] = useState<ChipId[]>(entry?.chips ?? [])
  const [note, setNote] = useState(entry?.note ?? '')

  if (!entry) {
    return (
      <div className="screen">
        <div className="screen-head">
          <span className="eyebrow">{copy.app.name}</span>
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
        <span className="eyebrow">{mediumLabel(entry.date)}</span>
        <h1>{copy.tonight.title}</h1>
      </div>

      {showWelcomeBack ? <p className="note">{copy.tonight.welcomeBack}</p> : null}

      <div className="plate">
        <Photo
          photoId={entry.photo_id}
          alt={`What you wore on ${mediumLabel(entry.date)}`}
          className="tonight-photo"
          eager
        />
      </div>

      <div className="field">
        <span className="field-label">{copy.tonight.prompt}</span>
        <FeltScale value={felt} onChange={setFelt} />
      </div>

      <div className="field">
        <span className="field-label">{copy.tonight.chipsPrompt}</span>
        <span className="field-hint">{copy.tonight.chipsHint}</span>
        <ChipRow selected={chips} onToggle={toggle} />
      </div>

      {/*
        * F9: the schema always had a note field with no way to fill it. Kept
        * below the taps and never required — the two questions are the product,
        * and a text box presented as a peer would slow the nightly loop down.
        */}
      <label className="field">
        <span className="field-label">{copy.tonight.notePrompt}</span>
        <span className="field-hint">{copy.tonight.noteHint}</span>
        <input
          type="text"
          value={note}
          maxLength={140}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <p className="note">{copy.tonight.why}</p>

      <div className="stack">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={felt === null}
          onClick={() => felt !== null && onSave(felt, chips, note.trim() || null)}
        >
          {copy.tonight.save}
        </button>
        <button type="button" className="btn btn--quiet btn--block" onClick={onSkip}>
          {copy.tonight.skip}
        </button>

        {/* F10: one bad photo should not require wiping the whole log. */}
        {onRemove ? (
          <button type="button" className="btn btn--quiet btn--block" onClick={onRemove}>
            {copy.tonight.remove}
          </button>
        ) : null}
      </div>
    </div>
  )
}
