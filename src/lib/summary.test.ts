import { beforeEach, describe, expect, it } from 'vitest'
import { buildSummary } from './summary'
import { makeEntries, makeEntry, resetFactory } from '../test/factory'
import type { Entry } from '../types'

const TODAY = '2025-06-01'

function run(entries: Entry[], outfitCount = 0, itemCount = 0) {
  return buildSummary({ entries, outfitCount, itemCount, today: TODAY })
}

beforeEach(resetFactory)

describe('the summary', () => {
  it('is empty and honest on an empty log', () => {
    const summary = run([])
    expect(summary.daysLogged).toBe(0)
    expect(summary.spanDays).toBeNull()
    expect(summary.loopCompletion).toBe(0)
    expect(summary.colours).toEqual([])
  })

  it('counts photographed and written days separately', () => {
    const written = { ...makeEntry({ felt: 4 }), photo_id: null, signature: null }
    const summary = run([...makeEntries(3, { felt: 4 }), written])

    expect(summary.daysLogged).toBe(4)
    expect(summary.photographed).toBe(3)
    expect(summary.written).toBe(1)
  })

  it('counts a written day fully toward evenings answered', () => {
    // A day without a photograph is still a day. Excluding it would quietly
    // drop exactly the days people found hardest to photograph.
    const written = { ...makeEntry({ felt: 2 }), photo_id: null, signature: null }
    const summary = run([written])
    expect(summary.eveningsAnswered).toBe(1)
    expect(summary.loopCompletion).toBe(1)
  })

  it('leaves written days out of the colour breakdown rather than guessing', () => {
    const written = { ...makeEntry({ felt: 4 }), photo_id: null, signature: null }
    const summary = run([...makeEntries(2, { felt: 4, colour: 'blue' }), written])

    expect(summary.colours).toHaveLength(1)
    expect(summary.colours[0]!.colour).toBe('blue')
    expect(summary.colours[0]!.days).toBe(2)
  })

  it('reports the share of days that got an evening answer', () => {
    const summary = run([...makeEntries(3, { felt: 4 }), ...makeEntries(1, { felt: null })])
    expect(summary.loopCompletion).toBeCloseTo(0.75)
  })

  it('names the next thing to arrive and how far away it is', () => {
    const summary = run(makeEntries(4, { felt: 4 }))

    expect(summary.nextMilestone).not.toBeNull()
    expect(summary.nextMilestone!.remaining).toBeGreaterThan(0)
    expect(summary.nextMilestone!.unlocks).toBeTruthy()
  })

  it('advances to the next milestone once one is reached', () => {
    const early = run(makeEntries(4, { felt: 4 }))
    resetFactory()
    const later = run(makeEntries(12, { felt: 4 }))

    expect(later.nextMilestone!.at).toBeGreaterThan(early.nextMilestone!.at)
  })

  it('reports nothing pending once every milestone is behind them', () => {
    expect(run(makeEntries(40, { felt: 4 })).nextMilestone).toBeNull()
  })

  it('tracks which colour draws comment', () => {
    const entries = [
      ...makeEntries(6, { felt: 4, colour: 'grey' }),
      ...makeEntries(2, { felt: 4, colour: 'blue', chips: ['complimented'] }),
    ]
    const summary = run(entries)

    const blue = summary.colours.find((c) => c.colour === 'blue')!
    expect(blue.complimentedDays).toBe(2)
    // Most-worn sorts first, which is what the screen leads with.
    expect(summary.colours[0]!.colour).toBe('grey')
  })

  it('never reports a milestone as more than complete', () => {
    for (const m of run(makeEntries(40, { felt: 4 })).milestones) {
      expect(m.remaining).toBe(0)
      expect(m.reached).toBe(true)
    }
  })
})
