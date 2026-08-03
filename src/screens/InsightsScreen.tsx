import { useEffect, useMemo, useRef, useState } from 'react'
import { copy } from '../lib/copy'
import { generateInsights, type GenerateInput } from '../lib/insights'
import { Photo } from '../app/Photo'
import { ExamplePatterns } from './ExamplePatterns'
import { styleSnapshot } from '../lib/styleProfile'
import { buildSummary } from '../lib/summary'
import { SponsorSlot } from '../app/SponsorSlot'
import { shouldShowSponsor } from '../lib/sponsor'
import { trainingWeeks, type WorkoutSet } from '../lib/gym'
import { allWorkouts } from '../db/db'
import { addDays, mediumLabel } from '../lib/dates'
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
  unanswered = 0,
  onAnswerNow,
  sponsorShown = false,
  onSponsorShown,
  onOpenOffers,
}: {
  input: GenerateInput
  entriesById: Map<string, Entry>
  onDismiss: (id: string, n: number) => void
  onResume: () => void
  /** Days still waiting for an evening answer — the fastest way forward. */
  unanswered?: number
  onAnswerNow?: (() => void) | undefined
  sponsorShown?: boolean
  onSponsorShown?: (() => void) | undefined
  onOpenOffers?: (() => void) | undefined
}) {
  const { gate, insights } = useMemo(() => generateInsights(input), [input])
  const [index, setIndex] = useState(0)
  const [showMethod, setShowMethod] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const progressRef = useRef<HTMLSpanElement>(null)

  /*
   * The receipts: things that are already true, shown while the observation
   * engine is still earning its fourteen evenings. The countdown alone made
   * this screen a waiting room; a waiting room with your own week on the
   * wall is a different room.
   */
  const [workouts, setWorkouts] = useState<WorkoutSet[]>([])
  useEffect(() => {
    void allWorkouts().then(setWorkouts)
  }, [])

  const receipts = useMemo(() => {
    const weekAgo = addDays(input.today, -7)
    const recent = input.entries.filter((e) => e.date > weekAgo && e.felt_score !== null)
    const bestDay =
      recent.length > 0
        ? recent.reduce((best, e) => (e.felt_score! > best.felt_score! ? e : best))
        : null

    const wears = styleSnapshot(input.entries).garments.filter((g) => g.days >= 2)

    const training = trainingWeeks(workouts, input.today).thisWeek

    return { bestDay, wears: wears.slice(0, 3), training }
  }, [input.entries, input.today, workouts])

  /*
   * Progress folded in. "What the log knows about you" was split across two
   * tabs — counts on one, observations on the other — which is one job in
   * two rooms. The figures, the colour claim, the next milestone and the
   * offers door all live here now, and the tab bar got a seat back.
   */
  const summary = useMemo(
    () =>
      buildSummary({
        entries: input.entries,
        outfitCount: input.outfits.length,
        itemCount: input.items.length,
        today: input.today,
      }),
    [input.entries, input.outfits.length, input.items.length, input.today],
  )

  const colourDays = summary.colours.reduce((sum, c) => sum + c.days, 0)
  const topColour =
    colourDays >= 4 && summary.colours[0] && summary.colours[0].days * 2 >= colourDays
      ? summary.colours[0]
      : undefined

  const sponsorVisible = shouldShowSponsor({
    entries: input.entries,
    today: input.today,
    slot: 'summary',
    alreadyShownThisSession: sponsorShown,
  })
  useEffect(() => {
    if (sponsorVisible && onSponsorShown) onSponsorShown()
  }, [sponsorVisible, onSponsorShown])

  const figures = (
    <>
      <h2 className="summary-heading">{copy.summary.title}</h2>
      <dl className="figures">
        <div className="figure">
          <dt className="eyebrow">{copy.summary.daysLabel}</dt>
          <dd>{summary.daysLogged}</dd>
        </div>
        <div className="figure">
          <dt className="eyebrow">{copy.summary.eveningsLabel}</dt>
          <dd>{summary.eveningsAnswered}</dd>
        </div>
        <div className="figure">
          <dt className="eyebrow">{copy.summary.outfitsLabel}</dt>
          <dd>{summary.outfitsRecognised}</dd>
        </div>
      </dl>
      {topColour ? (
        <p className="note">{copy.summary.mostWorn(topColour.colour, topColour.days)}</p>
      ) : null}
    </>
  )

  const footer = (
    <>
      {summary.nextMilestone ? (
        <>
          <hr className="rule" />
          <h2 className="summary-heading">{copy.summary.nextTitle}</h2>
          <p className="progress-label">
            {copy.summary.nextBody(summary.nextMilestone.remaining, summary.nextMilestone.unlocks)}
          </p>
        </>
      ) : null}
      <SponsorSlot
        entries={input.entries}
        today={input.today}
        slot="summary"
        alreadyShownThisSession={sponsorShown}
      />
      {onOpenOffers ? (
        <>
          <button type="button" className="btn btn--ghost btn--block" onClick={onOpenOffers}>
            {copy.offers.title}
          </button>
          <p className="note note--centred">{copy.offers.sub}</p>
        </>
      ) : null}
    </>
  )

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
          <a className="eyebrow eyebrow-home" href="/?stay=1">{copy.app.name}</a>
          <h1>{copy.insights.title}</h1>
        </div>
        <p className="empty">{copy.insights.softened}</p>
        <button type="button" className="btn btn--ghost btn--block" onClick={onResume}>
          {copy.settings.resumeInsights}
        </button>
      </div>
    )
  }

  if (showExample) return <ExamplePatterns onBack={() => setShowExample(false)} />

  if (!gate.unlocked) {
    const remaining = Math.max(0, gate.needed - gate.ratedEntries)

    return (
      <div className="screen">
        <div className="screen-head">
          <a className="eyebrow eyebrow-home" href="/?stay=1">{copy.app.name}</a>
          <h1>{copy.insights.title}</h1>
          <span className="sub">{copy.insights.thinSub}</span>
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

        {/* The fastest way to move that bar is sitting in the journal. */}
        {unanswered > 0 && onAnswerNow ? (
          <button type="button" className="btn btn--ghost btn--block" onClick={onAnswerNow}>
            {copy.log.answerNow(unanswered)}
          </button>
        ) : null}

        <hr className="rule" />
        {figures}

        {/* Already true, no waiting period required. */}
        {receipts.bestDay || receipts.wears.length > 0 || receipts.training.sessions > 0 ? (
          <>
            <hr className="rule" />
            <h2 className="summary-heading">{copy.insights.receiptsTitle}</h2>

            {receipts.bestDay ? (
              <div className="result" aria-label={copy.insights.receiptsBestLabel}>
                <span className="result-photo">
                  <Photo photoId={receipts.bestDay.photo_id} alt="" className="result-image" thumb />
                </span>
                <span className="result-text">
                  <span className="eyebrow">{copy.insights.receiptsBestLabel}</span>
                  <strong>
                    {copy.log.lookbackFelt(receipts.bestDay.felt_score!)} —{' '}
                    {mediumLabel(receipts.bestDay.date)}
                    {receipts.bestDay.garment ? `. ${receipts.bestDay.garment.name}.` : '.'}
                  </strong>
                </span>
              </div>
            ) : null}

            {receipts.wears.length > 0 ? (
              <div className="panel">
                {receipts.wears.map((wear) => (
                  <div key={wear.name} className="row">
                    <span className="row-text">{wear.name}</span>
                    <span className="sub">{copy.insights.receiptsDays(wear.days)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {receipts.training.sessions > 0 ? (
              <p className="note">
                {copy.insights.receiptsTraining(
                  receipts.training.sessions,
                  receipts.training.volume,
                )}
              </p>
            ) : null}
          </>
        ) : null}

        {/*
          * The provisional card: one early observation in the seven-to-
          * thirteen window, wearing its earliness louder than its finding.
          * Same arithmetic and confound checks as a full card, smaller sample
          * — and it will either firm up at fourteen or be withdrawn.
          */}
        {insights.length > 0 && insights[0] ? (
          <div className="preview">
            <span className="eyebrow preview-label">{copy.insights.provisionalLabel}</span>
            <p className="note">{copy.insights.provisionalIntro}</p>
            <article className="card" aria-label={copy.insights.provisionalLabel}>
              <h2>{insights[0].observation}</h2>
              <p className="evidence">{insights[0].evidence}</p>
              <p className="question">{insights[0].question}</p>
              <span className="sample">{copy.insights.sample(insights[0].n)}</span>
            </article>
            <p className="note">{copy.insights.provisionalFooter}</p>
          </div>
        ) : null}

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

          {/*
            * One card answers "what does an observation look like". It does not
            * answer "is a fortnight of this worth it", which is the question
            * someone on day three is actually weighing, and the only honest way
            * to answer that is to show them a whole fortnight.
            */}
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => setShowExample(true)}
          >
            {copy.insights.exampleOpen}
          </button>
        </div>

        {footer}
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

      <hr className="rule" />
      {figures}
      {footer}
    </div>
  )
}
