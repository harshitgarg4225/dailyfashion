import { useEffect } from 'react'
import { copy } from '../lib/copy'
import { buildSummary, type SummaryInput } from '../lib/summary'
import { mediumLabel } from '../lib/dates'
import { SponsorSlot } from '../app/SponsorSlot'
import { shouldShowSponsor } from '../lib/sponsor'
import type { Entry } from '../types'

/**
 * "What am I getting out of this?", answered with the log itself.
 *
 * The product asks for a fortnight before it says anything, which is a lot of
 * faith to ask of a stranger. This screen is the receipt for that faith: what
 * has been recorded, what the app can already tell from it, and precisely what
 * the next thing to arrive is and how far away it is.
 *
 * Deliberately not a dashboard of achievements. No streak, no percentage
 * framed as a target, nothing that falls when someone misses a week. Every
 * figure counts something the person did, and the one number that could read
 * as a grade — the share of days answered — is labelled as information about
 * the log rather than about them.
 */
export function SummaryScreen({
  input,
  entries,
  today,
  sponsorShown,
  onSponsorShown,
  onOpenOffers,
}: {
  input: SummaryInput
  entries: readonly Entry[]
  today: string
  sponsorShown: boolean
  onSponsorShown: () => void
  /** Opens the one page that shows ads. A quiet door, never an interruption. */
  onOpenOffers?: (() => void) | undefined
}) {
  const summary = buildSummary(input)

  // Marks the slot as used for this session, so it appears once rather than on
  // every visit. The rule itself lives in `sponsor.ts`, where it is tested.
  const sponsorVisible = shouldShowSponsor({
    entries,
    today,
    slot: 'summary',
    alreadyShownThisSession: sponsorShown,
  })
  useEffect(() => {
    if (sponsorVisible) onSponsorShown()
  }, [sponsorVisible, onSponsorShown])

  if (summary.daysLogged === 0) {
    return (
      <div className="screen">
        <div className="screen-head">
          <span className="eyebrow">{copy.app.name}</span>
          <h1>{copy.summary.title}</h1>
        </div>
        <p className="empty">{copy.summary.empty}</p>
      </div>
    )
  }

  const topColour = summary.colours[0]
  const mostComplimented = [...summary.colours]
    .filter((entry) => entry.complimentedDays > 0)
    .sort((a, b) => b.complimentedDays / b.days - a.complimentedDays / a.days)[0]

  return (
    <div className="screen">
      <div className="screen-head">
        <span className="eyebrow">{copy.app.name}</span>
        <h1>{copy.summary.title}</h1>
        {summary.firstEntry ? (
          <span className="sub">{copy.summary.since(mediumLabel(summary.firstEntry))}</span>
        ) : null}
      </div>

      {/* What is in the log. Counts of things done, never grades. */}
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

      <p className="note">
        {copy.summary.mix(summary.photographed, summary.written)}
      </p>

      {/* What it can already tell. Suppressed entirely when it cannot tell anything. */}
      {topColour ? (
        <>
          <hr className="rule" />
          <h2 className="summary-heading">{copy.summary.alreadyKnows}</h2>
          <p className="note">{copy.summary.mostWorn(topColour.colour, topColour.days)}</p>
          {mostComplimented && mostComplimented.colour !== topColour.colour ? (
            <p className="note">
              {copy.summary.mostComplimented(
                mostComplimented.colour,
                mostComplimented.complimentedDays,
                mostComplimented.days,
              )}
            </p>
          ) : null}
        </>
      ) : null}

      {/* What is coming, and exactly how far away. */}
      {summary.nextMilestone ? (
        <>
          <hr className="rule" />
          <h2 className="summary-heading">{copy.summary.nextTitle}</h2>
          <p className="progress-label">
            {copy.summary.nextBody(
              summary.nextMilestone.remaining,
              summary.nextMilestone.unlocks,
            )}
          </p>
        </>
      ) : (
        <>
          <hr className="rule" />
          <p className="progress-label">{copy.summary.allUnlocked}</p>
        </>
      )}

      <hr className="rule" />

      <SponsorSlot
        entries={entries}
        today={today}
        slot="summary"
        alreadyShownThisSession={sponsorShown}
      />
      {onOpenOffers ? (
        <>
          {/* A door has to look like one. A bare quiet label here read as a
              caption, and nobody pushes on a caption. */}
          <button type="button" className="btn btn--ghost btn--block" onClick={onOpenOffers}>
            {copy.offers.title}
          </button>
          <p className="note note--centred">{copy.offers.sub}</p>
        </>
      ) : null}

    </div>
  )
}
