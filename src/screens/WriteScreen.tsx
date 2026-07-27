import { useState } from 'react'
import type { ChipId, FeltScore } from '../types'
import { copy } from '../lib/copy'
import { mediumLabel, type DateKey } from '../lib/dates'
import { ChipRow, FeltScale } from '../app/controls'

/**
 * A day recorded in words rather than a photograph.
 *
 * Not a lesser path. A log that only accepts photographs quietly excludes the
 * days someone does not want to look at themselves — which are frequently the
 * days most worth having in the record, and exactly the days a felt-score
 * average would otherwise be missing.
 *
 * It is also the fast path. No camera permission, no shutter, no waiting for a
 * stream: type a line, tap how it felt, done. For someone in a changing room,
 * in a hurry, or on a phone with the camera blocked, this is the whole product
 * still working.
 */
export function WriteScreen({
  date,
  onSave,
  onCancel,
}: {
  date: DateKey
  onSave: (note: string, felt: FeltScore | null, chips: ChipId[]) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [felt, setFelt] = useState<FeltScore | null>(null)
  const [chips, setChips] = useState<ChipId[]>([])

  const toggle = (id: ChipId) =>
    setChips((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    )

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{mediumLabel(date)}</span>
        <h1>{copy.write.title}</h1>
      </div>

      <label className="field">
        <span className="field-label">{copy.write.prompt}</span>
        <span className="field-hint">{copy.write.hint}</span>
        <textarea
          className="write-area"
          value={note}
          rows={5}
          maxLength={600}
          autoFocus
          placeholder={copy.write.placeholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {/*
        * The same two questions as the evening screen, asked here because a
        * written day is complete in one sitting — there is no photograph taken
        * in the morning to come back to.
        */}
      <div className="field">
        <span className="field-label">{copy.tonight.prompt}</span>
        <FeltScale value={felt} onChange={setFelt} />
      </div>

      <div className="field">
        <span className="field-label">{copy.tonight.chipsPrompt}</span>
        <span className="field-hint">{copy.tonight.chipsHint}</span>
        <ChipRow selected={chips} onToggle={toggle} />
      </div>

      <div className="stack">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={note.trim().length === 0}
          onClick={() => onSave(note.trim(), felt, chips)}
        >
          {copy.write.save}
        </button>
        <button type="button" className="btn btn--quiet btn--block" onClick={onCancel}>
          {copy.common.cancel}
        </button>
      </div>
    </div>
  )
}
