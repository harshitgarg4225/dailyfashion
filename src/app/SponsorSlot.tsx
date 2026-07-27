import { copy } from '../lib/copy'
import { SPONSOR, shouldShowSponsor, type SponsorContext } from '../lib/sponsor'

/**
 * The sponsor placement.
 *
 * Labelled, bordered, and visually quieter than the user's own content — the
 * photographs stay the only saturated thing on any screen. `rel="noopener
 * noreferrer"` and `referrerPolicy="no-referrer"` mean the destination learns
 * nothing about where the tap came from, which keeps the promise intact even
 * at the one moment the user chooses to leave.
 */
export function SponsorSlot(context: SponsorContext) {
  if (!shouldShowSponsor(context) || SPONSOR === null) return null

  return (
    <aside className="sponsor" aria-label={copy.sponsor.label}>
      <span className="eyebrow sponsor-label">{copy.sponsor.label}</span>

      {SPONSOR.image ? (
        <img className="sponsor-image" src={SPONSOR.image} alt="" decoding="async" />
      ) : null}

      <span className="eyebrow">{SPONSOR.kicker}</span>
      <h2 className="sponsor-headline">{SPONSOR.headline}</h2>
      <p className="note">{SPONSOR.body}</p>

      <a
        className="btn btn--ghost btn--block"
        href={SPONSOR.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        {SPONSOR.cta}
      </a>
    </aside>
  )
}
