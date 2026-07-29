import { beforeEach, describe, expect, it } from 'vitest'
import { buildShortlist, SHORTLIST_MIN_ENTRIES, SHORTLIST_SIZE, trackRecord } from './shortlist'
import { makeEntries, makeEntry, resetFactory } from '../test/factory'

const TODAY = '2025-06-02' // a Monday

beforeEach(resetFactory)

describe('the shortlist gate', () => {
  it('stays locked below the entry minimum', () => {
    const result = buildShortlist(makeEntries(4, { felt: 5 }), { today: TODAY, tempBand: 'mild' })

    expect(result.unlocked).toBe(false)
    expect(result.entriesNeeded).toBe(SHORTLIST_MIN_ENTRIES - 4)
    expect(result.picks).toEqual([])
  })

  it('unlocks once there is enough history', () => {
    const result = buildShortlist(makeEntries(12, { felt: 5 }), { today: TODAY, tempBand: 'mild' })
    expect(result.unlocked).toBe(true)
  })
})

describe('what gets surfaced', () => {
  it('only offers days that actually went well', () => {
    const entries = [
      ...makeEntries(10, { felt: 2, date: undefined }),
      makeEntry({ felt: 5, date: '2025-04-01' }),
      makeEntry({ felt: 4, date: '2025-04-08' }),
      makeEntry({ felt: 5, date: '2025-04-15' }),
    ]

    const result = buildShortlist(entries, { today: TODAY, tempBand: 'mild' })

    expect(result.picks).toHaveLength(SHORTLIST_SIZE)
    for (const pick of result.picks) {
      expect(pick.felt_score).toBeGreaterThanOrEqual(4)
    }
  })

  it('never suggests something worn in the last couple of days', () => {
    const entries = [
      ...makeEntries(10, { felt: 3 }),
      makeEntry({ felt: 5, date: '2025-06-01' }), // yesterday
      makeEntry({ felt: 5, date: '2025-04-01' }),
      makeEntry({ felt: 5, date: '2025-04-08' }),
      makeEntry({ felt: 5, date: '2025-04-15' }),
    ]

    const dates = buildShortlist(entries, { today: TODAY, tempBand: 'mild' }).picks.map((p) => p.date)

    expect(dates).not.toContain('2025-06-01')
  })

  it('shows one entry per outfit rather than the same jacket three times', () => {
    const entries = [
      ...makeEntries(10, { felt: 3 }),
      makeEntry({ felt: 5, outfitId: 'same', date: '2025-04-01' }),
      makeEntry({ felt: 5, outfitId: 'same', date: '2025-04-08' }),
      makeEntry({ felt: 5, outfitId: 'same', date: '2025-04-15' }),
      makeEntry({ felt: 4, outfitId: 'other', date: '2025-04-20' }),
    ]

    const picks = buildShortlist(entries, { today: TODAY, tempBand: 'mild' }).picks
    const outfits = picks.map((p) => p.outfit_id)

    expect(new Set(outfits).size).toBe(outfits.length)
  })

  it('matches the weather when it honestly can', () => {
    const entries = [
      ...makeEntries(10, { felt: 3, temp: 'hot' }),
      makeEntry({ felt: 5, temp: 'cold', date: '2025-04-01', weekend: false }),
      makeEntry({ felt: 5, temp: 'cold', date: '2025-04-08', weekend: false }),
      makeEntry({ felt: 5, temp: 'cold', date: '2025-04-15', weekend: false }),
      makeEntry({ felt: 5, temp: 'hot', date: '2025-04-22', weekend: false }),
    ]

    const result = buildShortlist(entries, { today: TODAY, tempBand: 'cold' })

    expect(result.weatherMatched).toBe(true)
    for (const pick of result.picks) {
      expect(pick.context.temp_band).toBe('cold')
    }
  })

  it('does not claim a weather match it could not make', () => {
    // Only one cold day in the log — not enough to fill a weather-matched
    // list, so the header must not promise one.
    const entries = [
      ...makeEntries(10, { felt: 3, temp: 'hot' }),
      makeEntry({ felt: 5, temp: 'cold', date: '2025-04-01' }),
      makeEntry({ felt: 5, temp: 'hot', date: '2025-04-08' }),
      makeEntry({ felt: 5, temp: 'hot', date: '2025-04-15' }),
    ]

    const result = buildShortlist(entries, { today: TODAY, tempBand: 'cold' })

    expect(result.weatherMatched).toBe(false)
    expect(result.picks.length).toBeGreaterThan(0)
  })

  it('falls back rather than returning nothing when filters are too tight', () => {
    // Every good day was a weekend; today is a Monday. A shortlist of good
    // weekend outfits beats an empty screen.
    const entries = [
      ...makeEntries(10, { felt: 2 }),
      makeEntry({ felt: 5, date: '2025-04-05', weekend: true }),
      makeEntry({ felt: 5, date: '2025-04-12', weekend: true }),
      makeEntry({ felt: 5, date: '2025-04-19', weekend: true }),
    ]

    const result = buildShortlist(entries, { today: TODAY, tempBand: 'mild' })

    expect(result.picks.length).toBeGreaterThan(0)
  })

  it('skips unrated days entirely', () => {
    const entries = [...makeEntries(12, { felt: null }), makeEntry({ felt: 5, date: '2025-04-01' })]
    const picks = buildShortlist(entries, { today: TODAY, tempBand: 'mild' }).picks

    expect(picks).toHaveLength(1)
    expect(picks[0]!.felt_score).toBe(5)
  })
})

describe('the track record', () => {
  it('counts wears and good days for a clustered pick', () => {
    const entries = [
      makeEntry({ outfitId: 'outfit_1', felt: 5 }),
      makeEntry({ outfitId: 'outfit_1', felt: 4 }),
      makeEntry({ outfitId: 'outfit_1', felt: 2 }),
      makeEntry({ outfitId: 'outfit_1', felt: null }),
      makeEntry({ outfitId: 'outfit_2', felt: 5 }),
    ]
    expect(trackRecord(entries[0]!, entries)).toEqual({ wears: 4, goodDays: 2 })
  })

  it('offers no record for a single day', () => {
    // One day is a memory, not a record; a "record" of one dresses anecdote
    // as evidence.
    const single = [makeEntry({ outfitId: 'outfit_9', felt: 5 })]
    expect(trackRecord(single[0]!, single)).toBeNull()
    const unclustered = [makeEntry({ felt: 5 })]
    expect(trackRecord(unclustered[0]!, unclustered)).toBeNull()
  })
})
