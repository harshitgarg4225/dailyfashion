import { useState } from 'react'
import type { ChipId, Entry, FeltScore, Outfit } from '../types'
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
  onRename,
  wears,
  outfit,
  onSetCost,
  showWelcomeBack,
}: {
  entry: Entry | null
  onSave: (felt: FeltScore, chips: ChipId[], note: string | null) => void
  onSkip: () => void
  /** Only offered when opening an existing day, not on the evening prompt. */
  onRemove?: (() => void) | undefined
  /** Stores the user's own name for the garment, which outranks the model's. */
  onRename?: ((name: string) => void) | undefined
  /** The cluster's other wears, newest first — the outfit's history in place. */
  wears?: readonly Entry[]
  /** The cluster's aggregate row, for wear count and cost per wear. */
  outfit?: Outfit | null
  /** Stores what the user says the outfit cost. */
  onSetCost?: ((cost: number) => void) | undefined
  showWelcomeBack: boolean
}) {
  const [felt, setFelt] = useState<FeltScore | null>(entry?.felt_score ?? null)
  const [chips, setChips] = useState<ChipId[]>(entry?.chips ?? [])
  const [note, setNote] = useState(entry?.note ?? '')
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(entry?.garment?.name ?? '')
  const [costing, setCosting] = useState(false)
  const [draftCost, setDraftCost] = useState('')

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

      {/*
        * The garment line. The model's word is a suggestion, visibly marked as
        * one; the user's correction replaces it permanently and is never
        * re-guessed. Absent entirely on written days and when the model had
        * nothing confident to say — silence beats a wrong label.
        */}
      {entry.photo_id !== null && onRename ? (
        renaming ? (
          <form
            className="garment-line"
            onSubmit={(event) => {
              event.preventDefault()
              const name = draftName.trim().toLowerCase()
              if (name) {
                onRename(name)
                setRenaming(false)
              }
            }}
          >
            <input
              type="text"
              value={draftName}
              maxLength={40}
              autoFocus
              placeholder={copy.garment.placeholder}
              onChange={(event) => setDraftName(event.target.value)}
              aria-label={copy.garment.edit}
            />
            <button type="submit" className="btn btn--quiet">
              {copy.garment.save}
            </button>
          </form>
        ) : entry.garment ? (
          <button
            type="button"
            className="garment-line garment-line--named"
            onClick={() => {
              setDraftName(entry.garment?.name ?? '')
              setRenaming(true)
            }}
          >
            {entry.garment.source === 'model'
              ? copy.garment.suggested(entry.garment.name)
              : entry.garment.name}
            <span className="garment-edit">{copy.garment.edit}</span>
          </button>
        ) : (
          <button
            type="button"
            className="garment-line"
            onClick={() => setRenaming(true)}
          >
            {copy.garment.add}
          </button>
        )
      ) : null}

      {/*
        * The outfit's history, in place. J3 built the clusters; this is where
        * they pay off without a separate screen — every other wear of the same
        * outfit, right under the day being looked at. Dates only, no felt
        * scores: this strip may be glanced at with someone else present.
        */}
      {wears && wears.length > 0 ? (
        <div className="field">
          <span className="field-label">{copy.tonight.wornBefore(wears.length)}</span>
          <div className="wear-strip">
            {wears.slice(0, 6).map((wear) => (
              <div key={wear.id} className="wear-item">
                <div className="week-frame">
                  <Photo photoId={wear.photo_id} alt="" className="week-photo" thumb />
                </div>
                <span className="wear-date">{mediumLabel(wear.date)}</span>
              </div>
            ))}
          </div>

          {/*
            * Cost per wear: the number that goes down every time you show up.
            * User-entered cost, plain division, no currency assumed — the
            * figure is theirs and so is the unit.
            */}
          {outfit ? (
            costing ? (
              <form
                className="garment-line"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = Number(draftCost)
                  if (Number.isFinite(value) && value > 0 && onSetCost) {
                    onSetCost(Math.round(value))
                    setCosting(false)
                  }
                }}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={draftCost}
                  autoFocus
                  placeholder={copy.tonight.costPlaceholder}
                  onChange={(event) => setDraftCost(event.target.value)}
                  aria-label={copy.tonight.costAdd}
                />
                <button type="submit" className="btn btn--quiet">
                  {copy.garment.save}
                </button>
              </form>
            ) : outfit.cost ? (
              <button
                type="button"
                className="garment-line garment-line--named"
                onClick={() => {
                  setDraftCost(String(outfit.cost))
                  setCosting(true)
                }}
              >
                {copy.tonight.costPerWear(
                  Math.round(outfit.cost / Math.max(1, outfit.wear_count)),
                  outfit.wear_count,
                )}
                <span className="garment-edit">{copy.garment.edit}</span>
              </button>
            ) : onSetCost ? (
              <button type="button" className="garment-line" onClick={() => setCosting(true)}>
                {copy.tonight.costAdd}
              </button>
            ) : null
          ) : null}
        </div>
      ) : null}

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
