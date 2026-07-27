import type { Entry } from '../types'
import { daysBetween, type DateKey } from './dates'

/**
 * The sponsor slot — how this app pays for itself.
 *
 * Deliberately not a programmatic ad network. A network SDK would need
 * third-party scripts, third-party connections, a device identifier and a
 * consent flow, and it would make the sentence in onboarding false the day it
 * shipped. This is the podcast model instead: one sponsor at a time, the
 * creative shipped inside the build, rendered locally, reported never.
 *
 * The consequences are worth stating plainly, because they are the whole
 * design:
 *
 *  - `connect-src 'none'` survives. Nothing is fetched, so nothing is tracked,
 *    so the privacy claim stays literally true and the test that fails the
 *    build on any cross-origin request keeps passing.
 *  - There are no impression counts to bill against. Inventory is sold as a
 *    flat placement for a period, the way a magazine sells a page.
 *  - Changing the sponsor means shipping a build. That is a real operational
 *    cost and an acceptable one at this cadence.
 */

export interface Sponsor {
  /** Shown as the eyebrow above the placement. */
  kicker: string
  headline: string
  body: string
  /** Where tapping goes. Opened in a new tab; never in-app. */
  href: string
  /** Path to a bundled image under /public. Same-origin, so the CSP holds. */
  image: string | null
  cta: string
}

/**
 * The current sponsor, or null for none.
 *
 * Null is a first-class state and the app must look finished without a
 * sponsor — an empty slot with a placeholder box would be worse than no slot.
 */
export const SPONSOR: Sponsor | null = null

// --- placement rules ------------------------------------------------------

/**
 * How many days of logging before a sponsor is shown at all.
 *
 * Nobody has received any value on day one, and an advert before the product
 * has done anything is the fastest way to be deleted.
 */
export const SPONSOR_MIN_ENTRIES = 5

/** Felt score at or below which the rest of the session stays commercial-free. */
export const SPONSOR_QUIET_BELOW = 3

/** How recent a low day has to be for the app to stay quiet. */
export const SPONSOR_QUIET_DAYS = 1

export type SponsorSlot = 'journal' | 'summary'

export interface SponsorContext {
  entries: readonly Entry[]
  today: DateKey
  slot: SponsorSlot
  /** Set once a placement has been rendered this session. */
  alreadyShownThisSession: boolean
  /**
   * Which sponsor to consider. Defaults to the shipped one.
   *
   * Injectable so the placement rules can be tested against a sold slot. They
   * are ethical constraints rather than preferences, and a suite that could
   * only ever observe "no sponsor, so no placement" would pass forever while
   * the real rules rotted.
   */
  sponsor?: Sponsor | null
}

/**
 * Whether to show the sponsor.
 *
 * Two rules here are not negotiable and are the reason this lives in a tested
 * function rather than a component:
 *
 *  1. **Never on the evening screen.** That screen is where someone records
 *     how they felt about their day. Selling to a person in that exact moment
 *     is the thing the whole copy discipline exists to prevent, and it is not
 *     recoverable with better creative.
 *
 *  2. **Never right after a low day.** Fashion advertising immediately after
 *     someone taps "Not great" is the single worst placement this product
 *     could offer. If the last rated day was low, the app stays quiet.
 *
 * Beyond that: once per session, and not until the log has done something for
 * the person first.
 */
export function shouldShowSponsor(context: SponsorContext): boolean {
  const sponsor = context.sponsor === undefined ? SPONSOR : context.sponsor
  if (sponsor === null) return false
  if (context.alreadyShownThisSession) return false

  // The evening screen is not in `SponsorSlot` at all — the type is the rule.
  if (context.slot !== 'journal' && context.slot !== 'summary') return false

  if (context.entries.length < SPONSOR_MIN_ENTRIES) return false

  const rated = context.entries.filter((entry) => entry.felt_score !== null)
  const mostRecent = rated[0]
  if (
    mostRecent &&
    mostRecent.felt_score !== null &&
    mostRecent.felt_score <= SPONSOR_QUIET_BELOW &&
    daysBetween(mostRecent.date, context.today) <= SPONSOR_QUIET_DAYS
  ) {
    return false
  }

  return true
}
