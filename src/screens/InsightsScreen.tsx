import { useEffect, useMemo, useRef, useState } from 'react'
import { copy } from '../lib/copy'
import { generateInsights, type GenerateInput } from '../lib/insights'
import { Photo } from '../app/Photo'
import type { Entry } from '../types'

/**
 * J7: "show me the thing I couldn't see myself."
 *
 * One card at a time, each one observation + evidence + a question, and every
 * card shows its sample size. The evidence is not decoration — it is the whole
 * argument. "Here is proof you already know what works" only lands if the
 * proof is visible and checkable, so the numbers sit as prominently as the
 * claim.
 *
 * One at a time is a product decision, not a layout preference. Five
 * observations in a scroll is a dashboard, and a dashboard invites skimming;
 * a single card with a question at the bottom invites an answer. It also
 * paces the payoff, so a user who has earned four cards has four separate
 * reasons to come back rather than one long screen they have already read.
 *
 * When the log is too thin the screen says so plainly and shows the count. A
 * teaser would be a small lie about how much the app knows, and this is the
 * one screen where being believed is the entire value.
 */
export function InsightsScreen({
  input,
  entriesById,
  onDismiss,
  onResume,
}: {
  input: GenerateInput
  entriesById: Map<string, Entry>
  onDismiss: (id: string, n: number) => void
  onResume: () => void
}) {
  const { gate, insights } = useMemo(() => generateInsights(input), [input])
  const [index, setIndex] = useState(0)
  const [showMethod, setShowMethod] = useState(false)
  const progressRef = useRef<HTMLSpanElement>(null)

  /*
   * Applied through the CSSOM rather than as a `style` attribute.
   *
   * It is the only dynamic style left in the app, and setting it this way is
   * what lets the Content-Security-Policy drop `unsafe-inline` from
   * `style-src` — CSP blocks literal style attributes, not properties set from
   * script. One line of indirection buys a materially stricter policy.
   */
  const progress = gate.unlocked ? 1 : Math.min(1, gate.ratedEntries / gate.needed)
  useEffect(() => {
    if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`
  }, [progress])

  if (gate.softened) {
    return (
      <div className="screen">
        <div className="screen-head">
          <span className="eyebrow">{copy.app.name}</span>
          <h1>{copy.insights.title}</h1>
        </div>
        <p className="empty">{copy.insights.softened}</p>
        <button type="button" className="btn btn--ghost btn--block" onClick={onResume}>
          {copy.settings.resumeInsights}
        </button>
      </div>
    )
  }

  if (!gate.unlocked) {
    const remaining = Math.max(0, gate.needed - gate.ratedEntries)

    return (
      <div className="screen">
        <div className="screen-head">
          <span className="eyebrow">{copy.app.name}</span>
          <h1>{copy.insights.title}</h1>
        </div>

        {/*
          * P3a: the first fortnight has no payoff, so the only thing keeping
          * someone logging is being able to see the payoff approaching. A bare
          * count does not do that; a filling rule does.
          */}
        <div className="progress" role="img" aria-label={copy.insights.thin(gate.ratedEntries, gate.needed)}>
          <span ref={progressRef} className="progress-fill" />
        </div>

        <p className="progress-label">{copy.insights.countdown(remaining)}</p>
        <p className="note">{copy.insights.thin(gate.ratedEntries, gate.needed)}</p>

        {/*
          * A worked example, so the wait has a visible point.
          *
          * The countdown said how long, never what for — a new user was asked
          * for a fortnight of effort with no idea what arrived at the end of
          * it. This is a real card built from a made-up person's numbers, held
          * at arm's length by the label and the muted treatment so it can never
          * read as a claim about them.
          */}
        <div className="preview">
          <span className="eyebrow preview-label">{copy.insights.previewLabel}</span>
          <p className="note">{copy.insights.previewIntro}</p>

          <article className="card preview-card" aria-label={copy.insights.previewLabel}>
            <h2>{copy.insights.previewObservation}</h2>
            <p className="evidence">{copy.insights.previewEvidence}</p>
            <p className="question">{copy.insights.previewQuestion}</p>
            <span className="sample">{copy.insights.previewSample}</span>
          </article>

          <p className="note">{copy.insights.previewFooter}</p>
        </div>
      </div>
    )
  }

  const card = insights[Math.min(index, insights.length - 1)]

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">
          {insights.length > 1 ? copy.insights.position(index + 1, insights.length) : copy.app.name}
        </span>
        <h1>{copy.insights.title}</h1>
        <span className="sub">{copy.insights.sample(gate.ratedEntries)}</span>
      </div>

      {!card ? (
        <p className="empty">{copy.insights.empty}</p>
      ) : (
        (() => {
          const entry = card.subject.entryId ? entriesById.get(card.subject.entryId) : undefined
          return (
            <article className="card" key={card.id}>
              {entry ? <Photo photoId={entry.photo_id} alt="" className="insight-photo" eager /> : null}

              <h2>{card.observation}</h2>
              <p className="evidence">{card.evidence}</p>
              <p className="question">{card.question}</p>

              <span className="sample">{copy.insights.sample(card.n)}</span>

              {/*
                * Scepticism is the correct response to a claim about yourself,
                * and the only useful answer is the arithmetic. Collapsed by
                * default so it never competes with the observation.
                */}
              <button
                type="button"
                className="disclosure"
                aria-expanded={showMethod}
                onClick={() => setShowMethod((open) => !open)}
              >
                {showMethod ? copy.insights.howHide : copy.insights.howShow}
              </button>
              {showMethod ? <p className="method">{card.method}</p> : null}

              <div className="spacer" />
              <div className="stack">
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => {
                    onDismiss(card.id, card.n)
                    setShowMethod(false)
                    setIndex(0)
                  }}
                >
                  {copy.insights.dismiss}
                </button>

                {insights.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--block"
                    onClick={() => {
                      setShowMethod(false)
                      setIndex((i) => (i + 1) % insights.length)
                    }}
                  >
                    {copy.insights.next}
                  </button>
                ) : null}
              </div>
            </article>
          )
        })()
      )}
    </div>
  )
}
