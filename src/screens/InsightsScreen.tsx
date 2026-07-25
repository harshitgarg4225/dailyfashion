import { useMemo, useState } from 'react'
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
  onDismiss: (id: string) => void
  onResume: () => void
}) {
  const { gate, insights } = useMemo(() => generateInsights(input), [input])
  const [index, setIndex] = useState(0)

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
    const progress = Math.min(1, gate.ratedEntries / gate.needed)

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
          <span className="progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <p className="progress-label">{copy.insights.countdown(remaining)}</p>
        <p className="empty">{copy.insights.thin(gate.ratedEntries, gate.needed)}</p>
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

              <div className="spacer" />
              <div className="stack">
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => {
                    onDismiss(card.id)
                    setIndex(0)
                  }}
                >
                  {copy.insights.dismiss}
                </button>

                {insights.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--block"
                    onClick={() => setIndex((i) => (i + 1) % insights.length)}
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
