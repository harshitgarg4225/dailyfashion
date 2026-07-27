import { beforeEach, describe, expect, it } from 'vitest'
import {
  shouldShowSponsor,
  SPONSOR,
  SPONSOR_MIN_ENTRIES,
  type SponsorContext,
} from './sponsor'
import { makeEntries, makeEntry, resetFactory } from '../test/factory'
import type { Entry } from '../types'

/**
 * The placement rules, tested because they are ethical constraints rather than
 * preferences.
 *
 * Revenue pressure always argues for one more impression, and the two rules
 * that matter most — nothing on the evening screen, nothing after a low day —
 * are exactly the ones that would be quietly relaxed first. Encoding them here
 * means relaxing one has to be a deliberate act that turns a test red.
 */

const TODAY = '2025-06-01'

function context(entries: Entry[], overrides: Partial<SponsorContext> = {}): SponsorContext {
  return {
    entries,
    today: TODAY,
    slot: 'journal',
    alreadyShownThisSession: false,
    ...overrides,
  }
}

beforeEach(resetFactory)

describe('when there is no sponsor', () => {
  it('shows nothing rather than an empty frame', () => {
    // The shipped default. An unsold slot must leave no trace.
    expect(SPONSOR).toBeNull()
    expect(shouldShowSponsor(context(makeEntries(30, { felt: 5 })))).toBe(false)
  })
})

describe('placement rules', () => {
  /**
   * A stand-in sponsor, so the rules are exercised against the real predicate
   * rather than a copy of it that could silently drift.
   */
  const SOLD = {
    kicker: 'A Maison',
    headline: 'The autumn coat',
    body: 'Made in France.',
    href: 'https://example.com',
    image: null,
    cta: 'Have a look',
  }

  function sold(entries: Entry[], overrides: Partial<SponsorContext> = {}) {
    return shouldShowSponsor(context(entries, { sponsor: SOLD, ...overrides }))
  }

  it('stays quiet on a log too new to have given anything back', () => {
    expect(sold(makeEntries(SPONSOR_MIN_ENTRIES - 1, { felt: 5 }))).toBe(false)
  })

  it('appears once the log has done something first', () => {
    expect(sold(makeEntries(SPONSOR_MIN_ENTRIES, { felt: 5 }))).toBe(true)
  })

  it('stays quiet after a day that went badly', () => {
    // Selling to someone who has just recorded feeling bad is the single worst
    // placement this product could offer.
    const entries = [makeEntry({ felt: 1, date: '2025-06-01' }), ...makeEntries(10, { felt: 5 })]
    expect(sold(entries)).toBe(false)
  })

  it('stays quiet after a merely middling day too', () => {
    const entries = [makeEntry({ felt: 3, date: '2025-06-01' }), ...makeEntries(10, { felt: 5 })]
    expect(sold(entries)).toBe(false)
  })

  it('speaks up again once the low day is behind them', () => {
    // Quiet for the day, not forever — the rule is about the moment, and a log
    // that went silent permanently after one bad Tuesday would never earn.
    const entries = [makeEntry({ felt: 1, date: '2025-05-20' }), ...makeEntries(10, { felt: 5 })]
    expect(sold(entries)).toBe(true)
  })

  it('appears after a day that went well', () => {
    const entries = [makeEntry({ felt: 5, date: '2025-06-01' }), ...makeEntries(10, { felt: 4 })]
    expect(sold(entries)).toBe(true)
  })

  it('shows at most once per session', () => {
    expect(sold(makeEntries(10, { felt: 5 }), { alreadyShownThisSession: true })).toBe(false)
  })

  it('has no slot for the evening screen at all', () => {
    // The evening screen is absent from SponsorSlot by design — the type is the
    // rule, and this asserts the predicate rejects anything else regardless.
    expect(sold(makeEntries(10, { felt: 5 }), { slot: 'tonight' as never })).toBe(false)
  })

  it('allows the summary screen', () => {
    expect(sold(makeEntries(10, { felt: 5 }), { slot: 'summary' })).toBe(true)
  })

  it('ignores unrated days when deciding whether to stay quiet', () => {
    // An unanswered evening is not a low day; it is no information at all.
    const entries = [makeEntry({ felt: null, date: '2025-06-01' }), ...makeEntries(10, { felt: 5 })]
    expect(sold(entries)).toBe(true)
  })
})
