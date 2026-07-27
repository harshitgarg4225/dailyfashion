import { describe, expect, it } from 'vitest'
import { EXAMPLE_TODAY, exampleInput, exampleInsights, exampleShape } from './example'
import { generateInsights, MIN_TOTAL_ENTRIES, MIN_WEARS_PER_SUBJECT } from './insights'
import { BANNED_WORDS } from './copy'

/**
 * The example is shown to people who have not yet earned a real one, which
 * makes it a promise about what the app will do for them. A promise the engine
 * has quietly stopped keeping is worse than no promise, so this suite treats
 * the example as a contract: it must unlock, it must produce cards, and the
 * cards must be the kinds it claims.
 */

function findBanned(text: string): string[] {
  return BANNED_WORDS.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
}

describe('the worked example', () => {
  it('sits just past the gate, the way a real fortnight would', () => {
    const { gate } = generateInsights(exampleInput())
    expect(gate.unlocked).toBe(true)
    // Exactly at the threshold. An example built from forty days would be
    // showing off rather than showing what two weeks buys.
    expect(gate.ratedEntries).toBe(MIN_TOTAL_ENTRIES)
  })

  it('counts days and evenings separately, as the log does', () => {
    const shape = exampleShape()
    expect(shape.days).toBe(16)
    expect(shape.evenings).toBe(MIN_TOTAL_ENTRIES)
    expect(shape.outfits).toBe(2)
  })

  it('produces the three kinds a fortnight can honestly support', () => {
    const kinds = exampleInsights().map((card) => card.kind)
    expect(kinds).toEqual(['colour_gap', 'reliable_letdown', 'quiet_favourite'])
  })

  it('never claims the card that needs more than a fortnight', () => {
    // `underworn_favourite` needs three weeks of *not* wearing something. A
    // three-week log cannot honestly contain that, and an example that showed
    // it anyway would be selling a payoff two weeks does not deliver.
    const kinds = exampleInsights().map((card) => card.kind)
    expect(kinds).not.toContain('underworn_favourite')
  })

  it('rests every card on a real sample', () => {
    for (const card of exampleInsights()) {
      expect(card.n).toBeGreaterThanOrEqual(MIN_WEARS_PER_SUBJECT)
      // The evidence is the whole argument. A card whose evidence carries no
      // digits is not evidence.
      expect(card.evidence).toMatch(/\d/)
      expect(card.method).toMatch(/\S/)
    }
  })

  it('names the repeated outfits, because two tags were enough', () => {
    const text = exampleInsights().map((card) => card.observation).join(' ')
    expect(text).toContain('green jacket')
    expect(text).toContain('black jumper')
  })

  it('says nothing the ban list forbids', () => {
    for (const card of exampleInsights()) {
      const text = `${card.observation} ${card.evidence} ${card.question} ${card.method}`
      expect(findBanned(text), text).toEqual([])
    }
  })

  it('shows no photographs, having none to honestly show', () => {
    for (const entry of exampleInput().entries) {
      expect(entry.photo_id).toBeNull()
    }
  })

  it('keeps its own calendar, so the cards do not change by weekday', () => {
    // Every card is generated against a fixed today. Were the log relative to
    // the real one, the weekend/weekday confound rules would suppress
    // different cards depending on the day someone happened to open the app.
    expect(exampleInput().today).toBe(EXAMPLE_TODAY)
    const first = exampleInsights().map((card) => card.id)
    const second = exampleInsights().map((card) => card.id)
    expect(first).toEqual(second)
  })
})

describe('a tag over a whole outfit', () => {
  it('does not produce the same observation twice', () => {
    // The example tags two of five wears. Tagging all five used to create an
    // item group identical to the outfit group, and the engine wrote a card
    // about each — the same sentence, twice, on a screen that counts them.
    const base = exampleInput()
    const greenDays = base.entries.filter((entry) => entry.outfit_id === 'example_outfit_green')

    const { insights } = generateInsights({
      ...base,
      items: [{ id: 'tag', label: 'green jacket', created_at: 0 }],
      entryItems: greenDays.map((entry) => ({ entry_id: entry.id, item_id: 'tag' })),
    })

    const observations = insights.map((card) => card.observation)
    expect(new Set(observations).size).toBe(observations.length)
  })

  it('still speaks up for an item worn across different outfits', () => {
    const base = exampleInput()
    /*
     * Four of the green days plus one blue one — not a subset of any outfit
     * cluster, so it is genuinely its own subject and keeps its own voice.
     *
     * The days are picked to straddle the weekend. An earlier version of this
     * fixture used five weekdays and produced nothing at all, which was the
     * confound rule working exactly as designed: every wear landing on the
     * same kind of day is precisely when the engine is supposed to stay quiet.
     */
    const spanning = [1, 9, 5, 13, 7].map((offset) => `example_entry_${offset}`)

    const { insights } = generateInsights({
      ...base,
      items: [{ id: 'tag', label: 'brown boots', created_at: 0 }],
      entryItems: spanning.map((id) => ({ entry_id: id, item_id: 'tag' })),
    })

    expect(insights.some((card) => card.subject.kind === 'item')).toBe(true)
  })
})
