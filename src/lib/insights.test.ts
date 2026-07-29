import { beforeEach, describe, expect, it } from 'vitest'
import {
  generateInsights,
  MIN_TOTAL_ENTRIES,
  MIN_WEARS_PER_SUBJECT,
  PROVISIONAL_MIN_ENTRIES,
  shouldOfferSoftening,
  loopCompletion,
} from './insights'
import type { Entry, EntryItem, Item } from '../types'
import { makeEntries, makeEntry, resetFactory } from '../test/factory'

const TODAY = '2025-06-01'

function run(entries: Entry[], extra: { items?: Item[]; entryItems?: EntryItem[]; softened?: boolean; dismissed?: { id: string; n: number }[] } = {}) {
  return generateInsights({
    entries,
    outfits: [],
    items: extra.items ?? [],
    entryItems: extra.entryItems ?? [],
    today: TODAY,
    softened: extra.softened,
    dismissed: extra.dismissed,
  })
}

beforeEach(resetFactory)

describe('thresholds', () => {
  it('shows nothing at all below the provisional floor', () => {
    // A clear, strong signal — but on too little data even to hedge about.
    const entries = [
      ...makeEntries(2, { felt: 2 }),
      ...makeEntries(PROVISIONAL_MIN_ENTRIES - 4, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const result = run(entries)

    expect(result.gate.unlocked).toBe(false)
    expect(result.gate.provisional).toBe(false)
    expect(result.insights).toEqual([])
  })

  it('offers at most one early card in the provisional window, marked as such', () => {
    // The same strong signal, in the seven-to-thirteen window: one card,
    // provisional flag set, gate still locked. Never more than one — the
    // window exists to prove the machine works, not to open the tap early.
    const entries = [
      ...makeEntries(MIN_TOTAL_ENTRIES - 6, { felt: 2 }),
      ...makeEntries(5, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const result = run(entries)

    expect(result.gate.unlocked).toBe(false)
    expect(result.gate.provisional).toBe(true)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0]!.provisional).toBe(true)
  })

  it('reports honest progress toward the unlock', () => {
    const result = run(makeEntries(9))
    expect(result.gate.ratedEntries).toBe(9)
    expect(result.gate.needed).toBe(MIN_TOTAL_ENTRIES)
  })

  it('ignores a subject with fewer than the minimum wears', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      ...makeEntries(MIN_WEARS_PER_SUBJECT - 1, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const result = run(entries)

    expect(result.gate.unlocked).toBe(true)
    expect(result.insights.filter((i) => i.subject.id === 'outfit_a')).toEqual([])
  })

  it('does not count unrated days toward the threshold', () => {
    const result = run(makeEntries(MIN_TOTAL_ENTRIES + 5, { felt: null }))
    expect(result.gate.unlocked).toBe(false)
  })

  it('every surfaced card carries its sample size', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      ...makeEntries(6, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const result = run(entries)

    expect(result.insights.length).toBeGreaterThan(0)
    for (const card of result.insights) {
      expect(card.n).toBeGreaterThanOrEqual(MIN_WEARS_PER_SUBJECT)
      // The number has to be in the card, not just in the object.
      expect(card.evidence).toMatch(/\d/)
    }
  })
})

describe('the underworn favourite — the card the product exists for', () => {
  it('fires when a high-rated outfit has been left alone', () => {
    const entries: Entry[] = [
      ...makeEntries(20, { felt: 3, date: undefined }),
      // Five great days, all back in January, never touched since.
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-10' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-14' }),
      makeEntry({ felt: 4, outfitId: 'green', date: '2025-01-20' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-27' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-02-03' }),
    ]

    const result = run(entries)
    const card = result.insights.find((i) => i.kind === 'underworn_favourite')

    expect(card).toBeDefined()
    expect(card!.n).toBe(5)
    expect(card!.evidence).toContain('4.8')
    expect(card!.question).toBeTruthy()
  })

  it('names the thing when the user has tagged it', () => {
    const items: Item[] = [{ id: 'item_1', label: 'green jacket', created_at: 0 }]
    const wears = [
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-10' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-14' }),
      makeEntry({ felt: 4, outfitId: 'green', date: '2025-01-20' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-27' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-02-03' }),
    ]
    const entryItems: EntryItem[] = wears.map((e) => ({ entry_id: e.id, item_id: 'item_1' }))
    const entries = [...makeEntries(20, { felt: 3 }), ...wears]

    const result = run(entries, { items, entryItems })
    const card = result.insights.find((i) => i.kind === 'underworn_favourite')

    expect(card!.observation).toContain('green jacket')
  })

  it('stays quiet about something worn constantly', () => {
    const recent = [
      makeEntry({ felt: 5, outfitId: 'daily', date: '2025-05-20' }),
      makeEntry({ felt: 5, outfitId: 'daily', date: '2025-05-23' }),
      makeEntry({ felt: 5, outfitId: 'daily', date: '2025-05-26' }),
      makeEntry({ felt: 5, outfitId: 'daily', date: '2025-05-28' }),
      makeEntry({ felt: 4, outfitId: 'daily', date: '2025-05-30' }),
    ]
    const result = run([...makeEntries(20, { felt: 3 }), ...recent])

    expect(result.insights.find((i) => i.kind === 'underworn_favourite')).toBeUndefined()
    // It is still a favourite, just not a neglected one.
    expect(result.insights.find((i) => i.kind === 'quiet_favourite')).toBeDefined()
  })

  it('never shows both favourite cards for one subject', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-10' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-14' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-20' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-01-27' }),
      makeEntry({ felt: 5, outfitId: 'green', date: '2025-02-03' }),
    ]

    const kinds = run(entries).insights.filter((i) => i.subject.id === 'green').map((i) => i.kind)

    expect(kinds).toContain('underworn_favourite')
    expect(kinds).not.toContain('quiet_favourite')
  })
})

describe('confound suppression', () => {
  it('suppresses a claim when every wear was a weekend and weekends run high', () => {
    // Weekdays are flat and low; weekends are high across the board. The
    // outfit is only ever worn on weekends, so it gets no credit.
    const weekdays = makeEntries(20, { felt: 3, weekend: false })
    const otherWeekends = [
      makeEntry({ felt: 5, weekend: true, date: '2025-03-01' }),
      makeEntry({ felt: 5, weekend: true, date: '2025-03-08' }),
      makeEntry({ felt: 5, weekend: true, date: '2025-03-15' }),
    ]
    const suspect = [
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-05' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-12' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-19' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-26' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-02-02' }),
    ]

    const result = run([...weekdays, ...otherWeekends, ...suspect])

    expect(result.insights.filter((i) => i.subject.id === 'sunday')).toEqual([])
  })

  it('allows the claim when weekends and weekdays feel the same', () => {
    // Same concentration, but no weekend effect to confound with — so the
    // outfit's own signal is trustworthy and should surface.
    const baseline = [
      ...makeEntries(10, { felt: 3, weekend: false }),
      ...makeEntries(10, { felt: 3, weekend: true }),
    ]
    const suspect = [
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-05' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-12' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-19' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-01-26' }),
      makeEntry({ felt: 5, weekend: true, outfitId: 'sunday', date: '2025-02-02' }),
    ]

    const result = run([...baseline, ...suspect])

    expect(result.insights.filter((i) => i.subject.id === 'sunday').length).toBeGreaterThan(0)
  })

  it('suppresses when every wear shared one temperature band that runs hot', () => {
    const mild = makeEntries(20, { felt: 4, temp: 'mild' })
    const hotOthers = makeEntries(5, { felt: 2, temp: 'hot' })
    const suspect = [
      makeEntry({ felt: 2, temp: 'hot', outfitId: 'linen', date: '2025-01-05' }),
      makeEntry({ felt: 2, temp: 'hot', outfitId: 'linen', date: '2025-01-12' }),
      makeEntry({ felt: 2, temp: 'hot', outfitId: 'linen', date: '2025-01-19' }),
      makeEntry({ felt: 2, temp: 'hot', outfitId: 'linen', date: '2025-01-26' }),
      makeEntry({ felt: 2, temp: 'hot', outfitId: 'linen', date: '2025-02-02' }),
    ]

    const result = run([...mild, ...hotOthers, ...suspect])

    expect(result.insights.filter((i) => i.subject.id === 'linen')).toEqual([])
  })
})

describe('the colour card', () => {
  it('contrasts what draws comment with what gets worn', () => {
    const grey = makeEntries(20, { felt: 3, colour: 'grey' })
    const blue = [
      makeEntry({ felt: 4, colour: 'blue', chips: ['complimented'], date: '2025-02-01' }),
      makeEntry({ felt: 4, colour: 'blue', chips: ['complimented'], date: '2025-02-08' }),
      makeEntry({ felt: 4, colour: 'blue', chips: ['complimented'], date: '2025-02-15' }),
      makeEntry({ felt: 3, colour: 'blue', chips: [], date: '2025-02-22' }),
      makeEntry({ felt: 4, colour: 'blue', chips: ['complimented'], date: '2025-03-01' }),
    ]

    const card = run([...grey, ...blue]).insights.find((i) => i.kind === 'colour_gap')

    expect(card).toBeDefined()
    expect(card!.observation).toContain('blue')
    expect(card!.observation).toContain('grey')
    expect(card!.evidence).toContain('80%')
  })

  it('says nothing when the colour that draws comment is the one worn most', () => {
    const blue = makeEntries(20, { felt: 4, colour: 'blue', chips: ['complimented'] })
    const grey = makeEntries(6, { felt: 3, colour: 'grey' })

    const card = run([...blue, ...grey]).insights.find((i) => i.kind === 'colour_gap')

    expect(card).toBeUndefined()
  })
})

describe('softening (J8)', () => {
  it('drops every card when observations are paused', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      ...makeEntries(6, { felt: 5, outfitId: 'outfit_a' }),
    ]

    expect(run(entries).insights.length).toBeGreaterThan(0)
    expect(run(entries, { softened: true }).insights).toEqual([])
  })

  it('offers to soften after a low stretch', () => {
    const low = [
      makeEntry({ felt: 2, date: '2025-05-27' }),
      makeEntry({ felt: 1, date: '2025-05-28' }),
      makeEntry({ felt: 2, date: '2025-05-29' }),
      makeEntry({ felt: 2, date: '2025-05-30' }),
      makeEntry({ felt: 2, date: '2025-05-31' }),
    ]
    expect(shouldOfferSoftening(low, TODAY)).toBe(true)
  })

  it('does not offer after one bad day', () => {
    const mixed = [
      makeEntry({ felt: 1, date: '2025-05-31' }),
      makeEntry({ felt: 4, date: '2025-05-30' }),
      makeEntry({ felt: 4, date: '2025-05-29' }),
      makeEntry({ felt: 5, date: '2025-05-28' }),
    ]
    expect(shouldOfferSoftening(mixed, TODAY)).toBe(false)
  })
})

describe('dismissal', () => {
  it('does not resurface a dismissed card', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      ...makeEntries(6, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const first = run(entries).insights[0]!
    const after = run(entries, { dismissed: [{ id: first.id, n: first.n }] })

    expect(after.insights.map((i) => i.id)).not.toContain(first.id)
  })
})

describe('resurfacing a dismissed card', () => {
  const base = () => [
    ...makeEntries(20, { felt: 3 }),
    ...makeEntries(6, { felt: 5, outfitId: 'outfit_a' }),
  ]

  it('stays dismissed while the evidence has not moved', () => {
    const entries = base()
    const card = run(entries).insights.find((i) => i.subject.id === 'outfit_a')!

    const after = run(entries, { dismissed: [{ id: card.id, n: card.n }] })
    expect(after.insights.map((i) => i.id)).not.toContain(card.id)
  })

  it('returns once there are meaningfully more wears', () => {
    // "Got it" should not mean "never mention this again" — the same claim on
    // twenty more wears is a different claim.
    const first = base()
    const card = run(first).insights.find((i) => i.subject.id === 'outfit_a')!

    const later = [...first, ...makeEntries(4, { felt: 5, outfitId: 'outfit_a' })]
    const after = run(later, { dismissed: [{ id: card.id, n: card.n }] })

    expect(after.insights.map((i) => i.id)).toContain(card.id)
  })

  it('does not return on a single extra wear', () => {
    const first = base()
    const card = run(first).insights.find((i) => i.subject.id === 'outfit_a')!

    const later = [...first, ...makeEntries(1, { felt: 5, outfitId: 'outfit_a' })]
    const after = run(later, { dismissed: [{ id: card.id, n: card.n }] })

    expect(after.insights.map((i) => i.id)).not.toContain(card.id)
  })
})

describe('every card can show its own arithmetic', () => {
  it('carries a method the user could check with a pen', () => {
    const entries = [
      ...makeEntries(20, { felt: 3 }),
      ...makeEntries(6, { felt: 5, outfitId: 'outfit_a' }),
    ]

    const cards = run(entries).insights
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.method.length).toBeGreaterThan(20)
      // It has to describe the comparison, not restate the finding.
      expect(card.method.toLowerCase()).toMatch(/compar|count/)
    }
  })
})

describe('loop completion', () => {
  it('is the share of photos that got an evening reflection', () => {
    const entries = [...makeEntries(3, { felt: 4 }), ...makeEntries(1, { felt: null })]
    expect(loopCompletion(entries)).toBeCloseTo(0.75)
  })

  it('is zero on an empty log rather than undefined', () => {
    expect(loopCompletion([])).toBe(0)
  })
})
