import { useMemo, useState } from 'react'
import { copy } from '../lib/copy'
import { exampleInsights, exampleShape } from '../lib/example'
import type { Insight } from '../lib/insights'

/**
 * What the Patterns tab looks like once it has something to say.
 *
 * The locked screen is honest about the wait but not about the destination:
 * "observations start once there is enough to be fair" tells someone how long,
 * never what for. Two weeks is a long time to spend on faith, and this product
 * has no right to ask for faith — its entire argument is that it shows its
 * working.
 *
 * So this shows the working of a fortnight that is not theirs. Every card here
 * comes out of `generateInsights` at run time, which means the page cannot
 * flatter the engine: if a threshold moves or a rule starts suppressing
 * something, this screen shows the smaller, truer set.
 *
 * Two deliberate departures from the real tab, both stated on the page rather
 * than left to be discovered:
 *
 *  - The cards are stacked instead of shown one at a time. The real screen
 *    paces the payoff because its job is to get one observation considered;
 *    this screen's job is to answer "what do I get", and that question needs
 *    the whole answer at once.
 *  - There are no photographs, because there is no honest photograph to show.
 *    A stock image of someone else's clothes on a screen selling a private log
 *    would be the one lie in the app.
 */
export function ExamplePatterns({ onBack }: { onBack: () => void }) {
  const insights = useMemo(() => exampleInsights(), [])
  const shape = useMemo(() => exampleShape(), [])

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.insights.example.eyebrow}</span>
        <h1>{copy.insights.example.title}</h1>
        <span className="sub">{copy.insights.example.intro}</span>
      </div>

      {/* The shape of the log first, so the cards below have a size to rest on. */}
      <dl className="figures">
        <div className="figure">
          <dt className="eyebrow">{copy.insights.example.daysLabel}</dt>
          <dd>{shape.days}</dd>
        </div>
        <div className="figure">
          <dt className="eyebrow">{copy.insights.example.eveningsLabel}</dt>
          <dd>{shape.evenings}</dd>
        </div>
        <div className="figure">
          <dt className="eyebrow">{copy.insights.example.outfitsLabel}</dt>
          <dd>{shape.outfits}</dd>
        </div>
      </dl>

      <h2 className="summary-heading">{copy.insights.example.found}</h2>

      <div className="example-cards">
        {insights.map((card) => (
          <ExampleCard key={card.id} card={card} />
        ))}
      </div>

      <p className="note">{copy.insights.example.oneAtATime}</p>
      <p className="note">{copy.insights.example.later}</p>

      <div className="spacer" />
      <button type="button" className="btn btn--ghost btn--block" onClick={onBack}>
        {copy.insights.example.back}
      </button>
    </div>
  )
}

/**
 * The same card as the real screen, method disclosure included.
 *
 * Keeping the disclosure here rather than expanding the arithmetic inline is
 * the point: someone deciding whether to spend two weeks on this should see
 * that every claim comes with its working attached, and see it in the state
 * they will actually meet it in.
 */
function ExampleCard({ card }: { card: Insight }) {
  const [showMethod, setShowMethod] = useState(false)

  return (
    <article className="card">
      <h2>{card.observation}</h2>
      <p className="evidence">{card.evidence}</p>
      <p className="question">{card.question}</p>

      <span className="sample">{copy.insights.sample(card.n)}</span>

      <button
        type="button"
        className="disclosure"
        aria-expanded={showMethod}
        onClick={() => setShowMethod((open) => !open)}
      >
        {showMethod ? copy.insights.howHide : copy.insights.howShow}
      </button>
      {showMethod ? <p className="method">{card.method}</p> : null}
    </article>
  )
}
