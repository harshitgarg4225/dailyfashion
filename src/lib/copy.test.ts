import { describe, expect, it } from 'vitest'
import { BANNED_WORDS, collectStrings, copy } from './copy'
import { generateInsights } from './insights'
import { CHIPS } from './chips'
import { makeEntries, makeEntry } from '../test/factory'

/**
 * J8, enforced by the build rather than by good intentions.
 *
 * A copy review that lives in someone's memory lasts exactly until the next
 * person adds a string. This suite makes the ban list structural: a banned
 * word cannot reach a user without turning the suite red.
 *
 * Matching is on word boundaries, not substrings — otherwise "Nothing"
 * contains "thin" and the rule collapses into noise nobody trusts.
 */
function findBanned(text: string): string[] {
  const hits: string[] = []
  for (const word of BANNED_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) hits.push(word)
  }
  return hits
}

describe('the ban list', () => {
  it('matches whole words only', () => {
    expect(findBanned('Nothing worth saying yet.')).toEqual([])
    expect(findBanned('It is a fine day.')).toEqual([])
    expect(findBanned('Your goal weight')).toEqual(expect.arrayContaining(['goal', 'weight']))
  })

  it('is clean across every user-facing string', () => {
    const offenders: string[] = []
    for (const text of collectStrings(copy)) {
      const hits = findBanned(text)
      if (hits.length > 0) offenders.push(`"${text}" contains ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('is clean across every chip label', () => {
    for (const chip of CHIPS) {
      expect(findBanned(chip.label)).toEqual([])
    }
  })

  it('is clean across generated insight cards', () => {
    // Insight copy is templated with live numbers, so it has to be checked as
    // rendered rather than as source.
    const entries = [
      ...makeEntries(20, { felt: 3, colour: 'grey' }),
      makeEntry({ felt: 5, outfitId: 'a', date: '2025-01-05', colour: 'blue', chips: ['complimented'] }),
      makeEntry({ felt: 5, outfitId: 'a', date: '2025-01-12', colour: 'blue', chips: ['complimented'] }),
      makeEntry({ felt: 4, outfitId: 'a', date: '2025-01-19', colour: 'blue', chips: ['complimented'] }),
      makeEntry({ felt: 5, outfitId: 'a', date: '2025-01-26', colour: 'blue', chips: ['complimented'] }),
      makeEntry({ felt: 5, outfitId: 'a', date: '2025-02-02', colour: 'blue', chips: ['forgot_wearing_it'] }),
      ...makeEntries(6, { felt: 1, outfitId: 'b', chips: ['wanted_to_change', 'uncomfortable'] }),
    ]

    const { insights } = generateInsights({
      entries,
      outfits: [],
      items: [{ id: 'item_1', label: 'green jacket', created_at: 0 }],
      entryItems: [{ entry_id: 'entry_21', item_id: 'item_1' }],
      today: '2025-06-01',
    })

    expect(insights.length).toBeGreaterThan(0)
    for (const card of insights) {
      const text = `${card.observation} ${card.evidence} ${card.question}`
      expect(findBanned(text), text).toEqual([])
    }
  })
})

describe('what the copy promises', () => {
  it('states the privacy claim plainly enough to be checked', () => {
    const text = `${copy.onboarding.privacyTitle} ${copy.onboarding.privacyBody}`
    expect(text).toMatch(/airplane mode/i)
    expect(text).toMatch(/no account/i)
  })

  it('never frames a gap as a failure', () => {
    const all = collectStrings(copy).join(' ')
    expect(all).not.toMatch(/\bstreak\b/i)
    expect(all).not.toMatch(/don'?t break/i)
    expect(all).not.toMatch(/you missed/i)
  })
})
