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
 * proof is visible and checkable, so the numbers are as prominent as the claim.
 *
 * When the log is too thin the screen says so plainly and shows the count.
 * A teaser would be a small lie about how much the app knows, and this is the
 * one screen where being trusted is the entire value.
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
  const { gate, insights } = generateInsights(input)

  if (gate.softened) {
    return (
      <div className="screen">
        <div className="screen-head">
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
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>{copy.insights.title}</h1>
        </div>
        <p className="empty">{copy.insights.thin(gate.ratedEntries, gate.needed)}</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{copy.insights.title}</h1>
        <span className="sub">{copy.insights.sample(gate.ratedEntries)}</span>
      </div>

      {insights.length === 0 ? (
        <p className="empty">{copy.insights.empty}</p>
      ) : (
        insights.map((card) => {
          const entry = card.subject.entryId ? entriesById.get(card.subject.entryId) : undefined
          return (
            <article key={card.id} className="card">
              {entry ? (
                <div style={{ marginBottom: 14 }}>
                  <Photo photoId={entry.photo_id} alt="" className="insight-photo" />
                </div>
              ) : null}

              <h2>{card.observation}</h2>
              <p className="evidence">{card.evidence}</p>
              <p className="question">{card.question}</p>

              <span className="sample">{copy.insights.sample(card.n)}</span>

              <div className="spacer" />
              <button
                type="button"
                className="btn btn--quiet btn--block"
                onClick={() => onDismiss(card.id)}
              >
                {copy.insights.dismiss}
              </button>
            </article>
          )
        })
      )}
    </div>
  )
}
