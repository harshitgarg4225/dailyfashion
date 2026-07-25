import type { ChipId, FeltScore } from '../types'
import { CHIPS } from '../lib/chips'
import { copy } from '../lib/copy'

/**
 * The two evening questions, as controls.
 *
 * Both are deliberately tap-only. Nothing here accepts typing, because the
 * moment this is used is "tired, in bed, phone at arm's length" and a keyboard
 * at that moment is how a daily habit becomes a weekly one (J2).
 */

/**
 * Listed best-first on purpose.
 *
 * A scale that runs 1→5 left to right is a rating instrument, and it anchors
 * on the bad end. Reading down from "really good" makes this feel like picking
 * the word that fits the day, which is the only thing being asked (J8).
 */
const FELT_ORDER = [5, 4, 3, 2, 1] as const satisfies readonly FeltScore[]

export function FeltScale({
  value,
  onChange,
}: {
  value: FeltScore | null
  onChange: (score: FeltScore) => void
}) {
  return (
    <div className="felt" role="group" aria-label={copy.tonight.prompt}>
      {FELT_ORDER.map((score) => (
        <button
          key={score}
          type="button"
          className="felt-option"
          aria-pressed={value === score}
          onClick={() => onChange(score)}
        >
          <span className="marker" aria-hidden="true" />
          {copy.tonight.feltLabels[score]}
        </button>
      ))}
    </div>
  )
}

export function ChipRow({
  selected,
  onToggle,
}: {
  selected: readonly ChipId[]
  onToggle: (id: ChipId) => void
}) {
  return (
    <div className="chips" role="group" aria-label={copy.tonight.chipsPrompt}>
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="chip"
          aria-pressed={selected.includes(chip.id)}
          onClick={() => onToggle(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Sheet({
  title,
  body,
  children,
  onDismiss,
}: {
  title: string
  body?: string
  children: React.ReactNode
  onDismiss: () => void
}) {
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <div className="sheet">
        <h2>{title}</h2>
        {body ? <p className="sheet-body">{body}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
