import { describe, expect, it } from 'vitest'
import { IMAGENET_CLASSES } from '@tensorflow-models/mobilenet/dist/imagenet_classes'
import {
  GARMENT_CLASSES,
  NAME_CONFIDENCE,
  aggregateGarment,
  describeGarment,
} from './garments'
import { BANNED_WORDS } from './copy'

/**
 * The naming rules, tested without the model.
 *
 * The classifier itself cannot be meaningfully unit-tested — its behaviour on
 * a real photograph is an empirical question, not a logical one. What can be
 * tested is everything this app decides *about* its output: which classes are
 * garments, what they are called, and when the app chooses silence.
 */

describe('the garment class map', () => {
  it('maps only class names the model can actually produce', () => {
    // A key that drifts from the label file is a garment that silently stops
    // being nameable. This pins every key to the exact shipped strings.
    const known = new Set(Object.values(IMAGENET_CLASSES))
    for (const key of Object.keys(GARMENT_CLASSES)) {
      expect(known.has(key), `"${key}" is not an ImageNet class name`).toBe(true)
    }
  })

  it('uses plain, lowercase, judgment-free names', () => {
    for (const name of Object.values(GARMENT_CLASSES)) {
      expect(name).toBe(name.toLowerCase())
      for (const banned of BANNED_WORDS) {
        expect(name.includes(banned), `"${name}" contains banned "${banned}"`).toBe(false)
      }
    }
  })

  it('never names underwear', () => {
    // Deliberate absence, asserted so it survives future map edits.
    const values = Object.values(GARMENT_CLASSES).join(' ')
    for (const key of Object.keys(GARMENT_CLASSES)) {
      expect(key).not.toMatch(/brassiere|diaper/)
    }
    expect(values).not.toMatch(/\bbra\b|underwear/)
  })
})

describe('aggregation', () => {
  it('sums one garment split across several classes', () => {
    // A skirt arrives as three ImageNet classes; each is individually below
    // the floor, together they clear it.
    const guess = aggregateGarment([
      { className: 'miniskirt, mini', probability: 0.07 },
      { className: 'overskirt', probability: 0.06 },
      { className: 'hoopskirt, crinoline', probability: 0.05 },
      { className: 'goldfish, Carassius auratus', probability: 0.5 },
    ])
    expect(guess).toEqual({ name: 'skirt', confidence: 0.07 + 0.06 + 0.05 })
  })

  it('stays silent below the confidence floor', () => {
    expect(
      aggregateGarment([{ className: 'cardigan', probability: NAME_CONFIDENCE - 0.01 }]),
    ).toBeNull()
  })

  it('stays silent when nothing maps to a garment', () => {
    expect(
      aggregateGarment([
        { className: 'goldfish, Carassius auratus', probability: 0.9 },
        { className: 'ballpoint, ballpoint pen, ballpen, Biro', probability: 0.1 },
      ]),
    ).toBeNull()
  })

  it('names several garments when each clears the floor on its own', () => {
    // An outfit is usually more than one garment; both were genuinely seen.
    const guess = aggregateGarment([
      { className: 'cardigan', probability: 0.3 },
      { className: 'jean, blue jean, denim', probability: 0.2 },
    ])
    expect(guess?.name).toBe('cardigan + jeans')
    // The line is only as sure as its least sure word.
    expect(guess?.confidence).toBeCloseTo(0.2)
  })

  it('refuses to let weak hunches add up to a confident line', () => {
    // Each below the floor; together they must not become "cardigan + jeans".
    const guess = aggregateGarment([
      { className: 'cardigan', probability: 0.3 },
      { className: 'jean, blue jean, denim', probability: 0.1 },
    ])
    expect(guess?.name).toBe('cardigan')
  })

  it('caps the line at three garments', () => {
    const guess = aggregateGarment([
      { className: 'cardigan', probability: 0.3 },
      { className: 'jean, blue jean, denim', probability: 0.28 },
      { className: 'jersey, T-shirt, tee shirt', probability: 0.26 },
      { className: 'trench coat', probability: 0.24 },
    ])
    expect(guess?.name.split(' + ')).toHaveLength(3)
  })

  it('returns null for empty input', () => {
    expect(aggregateGarment([])).toBeNull()
  })
})

describe('description', () => {
  it('leads with the colour when one is known', () => {
    expect(describeGarment('cardigan', 'black')).toBe('black cardigan')
  })

  it('is just the name when the colour is unknown', () => {
    expect(describeGarment('cardigan', null)).toBe('cardigan')
  })
})
