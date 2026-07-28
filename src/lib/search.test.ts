import { beforeEach, describe, expect, it } from 'vitest'
import { searchEntries, tokenize } from './search'
import { makeEntry, resetFactory } from '../test/factory'
import type { Entry } from '../types'

beforeEach(() => resetFactory())

function withNote(entry: Entry, note: string): Entry {
  return { ...entry, note }
}

const NO_TAGS = { items: [], entryItems: [] }

describe('tokenizing a query', () => {
  it('drops punctuation and single letters', () => {
    expect(tokenize('Grey coat — a bit warm!')).toEqual(['grey', 'coat', 'bit', 'warm'])
  })

  it('keeps short words that carry meaning', () => {
    // An aggressive stop list silently deletes what people meant. "one" is
    // doing real work in "the black one".
    expect(tokenize('the black one')).toEqual(['black', 'one'])
  })

  it('finds nothing to search for in an empty query', () => {
    expect(tokenize('   ')).toEqual([])
    expect(searchEntries({ entries: [makeEntry()], ...NO_TAGS }, '')).toEqual([])
  })
})

describe('searching what you wrote', () => {
  it('finds a day by a word in its note', () => {
    const entries = [
      withNote(makeEntry({ date: '2025-03-01' }), 'Grey coat again. Warmer than it looked.'),
      withNote(makeEntry({ date: '2025-03-02' }), 'Linen shirt, too cold for it.'),
    ]

    const hits = searchEntries({ entries, ...NO_TAGS }, 'coat')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.entry.note).toMatch(/grey coat/i)
    expect(hits[0]!.reasons).toContain('what you wrote')
  })

  it('ranks what you wrote above what the app guessed', () => {
    // The note is the only field written deliberately. A search that put an
    // automatic colour guess above it would feel like being argued with.
    const written = withNote(makeEntry({ date: '2025-03-01', colour: 'grey' }), 'the green jacket')
    const guessed = makeEntry({ date: '2025-03-02', colour: 'green' })

    const hits = searchEntries({ entries: [guessed, written], ...NO_TAGS }, 'green')
    expect(hits[0]!.entry.id).toBe(written.id)
  })

  it('prefers a whole word to a fragment of one', () => {
    const whole = withNote(makeEntry({ date: '2025-03-01' }), 'red scarf')
    const fragment = withNote(makeEntry({ date: '2025-03-02' }), 'reduced the layers')

    const hits = searchEntries({ entries: [fragment, whole], ...NO_TAGS }, 'red')
    expect(hits[0]!.entry.id).toBe(whole.id)
  })

  it('scores a day higher when more of the query matches it', () => {
    const both = withNote(makeEntry({ date: '2025-03-01' }), 'grey linen shirt')
    const one = withNote(makeEntry({ date: '2025-03-02' }), 'grey trousers')

    const hits = searchEntries({ entries: [one, both], ...NO_TAGS }, 'grey linen')
    expect(hits[0]!.entry.id).toBe(both.id)
  })
})

describe('searching what the log already knows', () => {
  it('finds days by colour family', () => {
    const hits = searchEntries(
      {
        entries: [
          makeEntry({ date: '2025-03-01', colour: 'blue' }),
          makeEntry({ date: '2025-03-02', colour: 'brown' }),
        ],
        ...NO_TAGS,
      },
      'blue',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]!.reasons).toContain('blue')
  })

  it('finds days by what happened on them', () => {
    const hits = searchEntries(
      {
        entries: [
          makeEntry({ date: '2025-03-01', chips: ['complimented'] }),
          makeEntry({ date: '2025-03-02', chips: ['uncomfortable'] }),
        ],
        ...NO_TAGS,
      },
      'uncomfortable',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]!.reasons).toContain('Uncomfortable')
  })

  it('finds days by the word you tagged an outfit with', () => {
    const entry = makeEntry({ date: '2025-03-01' })
    const hits = searchEntries(
      {
        entries: [entry, makeEntry({ date: '2025-03-02' })],
        items: [{ id: 'i1', label: 'green jacket', created_at: 0 }],
        entryItems: [{ entry_id: entry.id, item_id: 'i1' }],
      },
      'jacket',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]!.entry.id).toBe(entry.id)
    expect(hits[0]!.reasons).toContain('green jacket')
  })

  it('finds days by when they were', () => {
    const hits = searchEntries(
      {
        entries: [
          makeEntry({ date: '2025-03-14' }),
          makeEntry({ date: '2025-06-14' }),
        ],
        ...NO_TAGS,
      },
      'mar',
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]!.entry.date).toBe('2025-03-14')
  })
})

describe('what a search result owes the reader', () => {
  it('always says why a day matched', () => {
    const entry = withNote(makeEntry({ date: '2025-03-01', colour: 'green' }), 'green jacket')
    for (const hit of searchEntries({ entries: [entry], ...NO_TAGS }, 'green')) {
      expect(hit.reasons.length).toBeGreaterThan(0)
    }
  })

  it('does not repeat the same reason twice', () => {
    const entry = withNote(makeEntry({ date: '2025-03-01' }), 'green green green')
    const hit = searchEntries({ entries: [entry], ...NO_TAGS }, 'green')[0]!
    expect(hit.reasons).toEqual([...new Set(hit.reasons)])
  })

  it('breaks ties toward the more recent day', () => {
    const older = withNote(makeEntry({ date: '2025-03-01' }), 'grey coat')
    const newer = withNote(makeEntry({ date: '2025-03-20' }), 'grey coat')

    const hits = searchEntries({ entries: [older, newer], ...NO_TAGS }, 'grey coat')
    expect(hits[0]!.entry.date).toBe('2025-03-20')
  })

  it('returns nothing rather than everything when nothing matches', () => {
    const entries = [withNote(makeEntry(), 'grey coat')]
    expect(searchEntries({ entries, ...NO_TAGS }, 'sequins')).toEqual([])
  })
})
