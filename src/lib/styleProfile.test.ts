import { describe, expect, it } from 'vitest'
import { styleSnapshot } from './styleProfile'
import { makeEntry, resetFactory } from '../test/factory'
import type { ColorFamily, Entry } from '../types'

/**
 * The style snapshot is the one thing the server learns about a consented
 * wardrobe, so its shape is a privacy contract: words and counts, capped,
 * with nothing resembling a photo, a note, a date or a felt score inside.
 */

function entryWith(over: { garment?: string; colour?: ColorFamily }): Entry {
  const entry = makeEntry({ ...(over.colour ? { colour: over.colour } : {}) })
  if (over.garment) {
    return { ...entry, garment: { name: over.garment, confidence: 0.9, source: 'model' } }
  }
  return entry
}

describe('the style snapshot', () => {
  it('counts garment words by day, splitting multi-garment names', () => {
    resetFactory()
    const entries = [
      entryWith({ garment: 'wool coat + white tee' }),
      entryWith({ garment: 'wool coat' }),
      entryWith({ garment: 'leather boots' }),
    ]
    const snap = styleSnapshot(entries)
    expect(snap.garments).toEqual([
      { name: 'wool coat', days: 2 },
      { name: 'leather boots', days: 1 },
      { name: 'white tee', days: 1 },
    ])
    expect(snap.days_logged).toBe(3)
  })

  it('caps the lists, and carries nothing but words and counts', () => {
    resetFactory()
    const palette: ColorFamily[] = ['black', 'grey', 'white', 'red', 'orange']
    const entries = Array.from({ length: 30 }, (_, i) =>
      entryWith({ garment: `garment ${i}`, colour: palette[i % palette.length]! }),
    )
    const snap = styleSnapshot(entries)
    expect(snap.garments.length).toBeLessThanOrEqual(10)
    expect(snap.colours.length).toBeLessThanOrEqual(5)

    // The contract: no dates, notes, scores or ids anywhere in the payload.
    const flat = JSON.stringify(snap)
    expect(flat).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(flat).not.toMatch(/entry_|photo_|felt/)
  })
})
