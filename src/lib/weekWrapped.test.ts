import { beforeEach, describe, expect, it } from 'vitest'
import { buildWeekWrapped, MIN_DAYS_FOR_WRAP, WEEK_DAYS } from './weekWrapped'
import { makeEntry, resetFactory } from '../test/factory'

/**
 * The recap's one hard rule is negative: it must never make a claim.
 *
 * Patterns stays silent for fourteen answered evenings because a finding drawn
 * from five days is a guess. A weekly recap that said "green is clearly your
 * colour" would be that same guess arriving twice as often, and it would teach
 * the user to disbelieve the card that eventually *is* earned. So these tests
 * check counting, and check that nothing here computes an average.
 */

const TODAY = '2025-03-23'

beforeEach(() => resetFactory())

describe('the week window', () => {
  it('covers today and the six days before it', () => {
    const week = buildWeekWrapped([], TODAY)
    expect(week.to).toBe(TODAY)
    expect(week.from).toBe('2025-03-17')
  })

  it('takes the last seven days and nothing older', () => {
    const entries = [
      makeEntry({ date: '2025-03-23' }),
      makeEntry({ date: '2025-03-17' }),
      // One day outside the window.
      makeEntry({ date: '2025-03-16' }),
      makeEntry({ date: '2025-01-01' }),
    ]
    expect(buildWeekWrapped(entries, TODAY).daysLogged).toBe(2)
  })

  it('is exactly seven days wide', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ date: `2025-03-${String(14 + i).padStart(2, '0')}` }),
    )
    expect(buildWeekWrapped(entries, TODAY).daysLogged).toBe(WEEK_DAYS)
  })
})

describe('what the week counts', () => {
  it('separates days logged from evenings answered', () => {
    const week = buildWeekWrapped(
      [
        makeEntry({ date: '2025-03-21', felt: 4 }),
        makeEntry({ date: '2025-03-22', felt: null }),
        makeEntry({ date: '2025-03-23', felt: 2 }),
      ],
      TODAY,
    )
    expect(week.daysLogged).toBe(3)
    expect(week.eveningsAnswered).toBe(2)
  })

  it('counts written days as days', () => {
    const written = makeEntry({ date: '2025-03-22' })
    written.photo_id = null
    written.signature = null

    const week = buildWeekWrapped([makeEntry({ date: '2025-03-21' }), written], TODAY)
    expect(week.daysLogged).toBe(2)
    expect(week.photographed).toBe(1)
    expect(week.written).toBe(1)
    // A written day has no colour to contribute rather than an unknown one.
    expect(week.colours.reduce((n, c) => n + c.days, 0)).toBe(1)
  })

  it('ranks colours by days worn', () => {
    const week = buildWeekWrapped(
      [
        makeEntry({ date: '2025-03-21', colour: 'black' }),
        makeEntry({ date: '2025-03-22', colour: 'black' }),
        makeEntry({ date: '2025-03-23', colour: 'green' }),
      ],
      TODAY,
    )
    expect(week.colours.map((c) => c.colour)).toEqual(['black', 'green'])
    expect(week.colours[0]!.days).toBe(2)
  })

  it('reports only outfits actually repeated', () => {
    const week = buildWeekWrapped(
      [
        makeEntry({ date: '2025-03-21', outfitId: 'a' }),
        makeEntry({ date: '2025-03-22', outfitId: 'a' }),
        // Worn once. Not a repeat.
        makeEntry({ date: '2025-03-23', outfitId: 'b' }),
      ],
      TODAY,
    )
    expect(week.repeats).toHaveLength(1)
    expect(week.repeats[0]!.outfitId).toBe('a')
    expect(week.repeats[0]!.times).toBe(2)
  })

  it('counts an event once per day, not once per tap', () => {
    const entry = makeEntry({ date: '2025-03-22', chips: ['complimented', 'complimented'] })
    const week = buildWeekWrapped([entry], TODAY)
    expect(week.events).toEqual([{ chip: 'complimented', days: 1 }])
  })

  it('drops events that did not happen', () => {
    const week = buildWeekWrapped([makeEntry({ date: '2025-03-22', chips: [] })], TODAY)
    expect(week.events).toEqual([])
  })
})

describe('what the week refuses to do', () => {
  it('has no average anywhere in it', () => {
    // The load-bearing test. Every field is a count of something that happened;
    // the moment a mean appears, this becomes an observation screen that has
    // bypassed the fourteen-evening gate.
    const week = buildWeekWrapped(
      [
        makeEntry({ date: '2025-03-21', felt: 5 }),
        makeEntry({ date: '2025-03-22', felt: 1 }),
        makeEntry({ date: '2025-03-23', felt: 3 }),
      ],
      TODAY,
    )

    const numbers = JSON.stringify(week).match(/\d+\.\d+/g)
    expect(numbers, 'a fractional number means something was averaged').toBeNull()
    expect(Object.keys(week)).not.toContain('meanFelt')
    expect(Object.keys(week)).not.toContain('bestDay')
  })

  it('stays quiet on a week too thin to be worth reading', () => {
    const thin = buildWeekWrapped(
      Array.from({ length: MIN_DAYS_FOR_WRAP - 1 }, (_, i) =>
        makeEntry({ date: `2025-03-2${i + 1}` }),
      ),
      TODAY,
    )
    expect(thin.enough).toBe(false)

    const enough = buildWeekWrapped(
      Array.from({ length: MIN_DAYS_FOR_WRAP }, (_, i) =>
        makeEntry({ date: `2025-03-2${i + 1}` }),
      ),
      TODAY,
    )
    expect(enough.enough).toBe(true)
  })

  it('is empty rather than broken on an empty log', () => {
    const week = buildWeekWrapped([], TODAY)
    expect(week.daysLogged).toBe(0)
    expect(week.colours).toEqual([])
    expect(week.repeats).toEqual([])
    expect(week.photoIds).toEqual([])
    expect(week.enough).toBe(false)
  })
})
