import { describe, expect, it } from 'vitest'
import {
  bestMatch,
  classifyColor,
  computeSignature,
  hammingDistance,
  histogramIntersection,
  similarity,
  type RawImage,
} from './signature'

/** Builds a test image from a per-pixel colour function. */
function image(width: number, height: number, at: (x: number, y: number) => [number, number, number]): RawImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

/** A subject against a wall — roughly the shape of a mirror selfie. */
function outfitShot(
  garment: [number, number, number],
  wall: [number, number, number] = [230, 228, 225],
  jitter = 0,
): RawImage {
  return image(64, 96, (x, y) => {
    const inSubject = x > 18 + jitter && x < 46 + jitter && y > 20 && y < 82
    if (!inSubject) return wall
    // Vertical shading, so the hash has real structure to key on.
    const shade = 1 - (y / 96) * 0.25
    return [garment[0] * shade, garment[1] * shade, garment[2] * shade]
  })
}

describe('colour classification', () => {
  it('names colours the way a person would', () => {
    expect(classifyColor(20, 20, 22)).toBe('black')
    expect(classifyColor(128, 128, 130)).toBe('grey')
    expect(classifyColor(245, 245, 245)).toBe('white')
    expect(classifyColor(200, 30, 40)).toBe('red')
    expect(classifyColor(40, 80, 200)).toBe('blue')
    expect(classifyColor(40, 160, 70)).toBe('green')
  })

  it('reads a dark orange as brown, because that is what people call it', () => {
    expect(classifyColor(92, 60, 28)).toBe('brown')
  })

  it('picks the dominant colour from the centre, ignoring the wall', () => {
    // Wall is a huge majority by pixel count; the garment must still win.
    const shot = outfitShot([40, 80, 200])
    expect(computeSignature(shot).color).toBe('blue')
  })
})

describe('hashing', () => {
  it('reports zero distance between identical hashes', () => {
    expect(hammingDistance('0123456789abcdef', '0123456789abcdef')).toBe(0)
  })

  it('counts differing bits', () => {
    expect(hammingDistance('0', '1')).toBe(1)
    expect(hammingDistance('0', 'f')).toBe(4)
  })

  it('treats mismatched lengths as incomparable rather than equal', () => {
    expect(hammingDistance('00', '0')).toBe(Number.POSITIVE_INFINITY)
    expect(similarity(
      { dhash: '00', hist: [1], color: 'grey' },
      { dhash: '0', hist: [1], color: 'grey' },
    )).toBe(0)
  })
})

describe('histogram intersection', () => {
  it('is 1 for identical palettes and 0 for disjoint ones', () => {
    expect(histogramIntersection([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1)
    expect(histogramIntersection([1, 0], [0, 1])).toBeCloseTo(0)
  })
})

describe('same-outfit matching (J3)', () => {
  it('matches the same outfit photographed twice', () => {
    const monday = computeSignature(outfitShot([40, 80, 200]))
    const friday = computeSignature(outfitShot([40, 80, 200], [230, 228, 225], 1))

    expect(similarity(monday, friday)).toBeGreaterThan(0.86)
  })

  it('survives an exposure change, which is the common real-world case', () => {
    // The same outfit in the same room, photographed darker. Every pixel
    // changes value; nothing about the scene changes. A hash that cannot see
    // through this would fail on the first cloudy morning.
    const lit = outfitShot([40, 80, 200], [240, 238, 235])
    const dim: RawImage = {
      width: lit.width,
      height: lit.height,
      data: lit.data.map((v, i) => (i % 4 === 3 ? v : Math.round(v * 0.7))) as Uint8ClampedArray,
    }

    const distance = hammingDistance(computeSignature(lit).dhash, computeSignature(dim).dhash)
    expect(distance).toBe(0)
    expect(similarity(computeSignature(lit), computeSignature(dim))).toBeGreaterThan(0.86)
  })

  it('does not match a different outfit', () => {
    const blue = computeSignature(outfitShot([40, 80, 200]))
    const red = computeSignature(outfitShot([200, 40, 50]))

    expect(similarity(blue, red)).toBeLessThan(0.86)
  })

  it('returns the single best candidate, not a list to choose from', () => {
    const target = computeSignature(outfitShot([40, 80, 200]))
    const candidates = [
      { id: 'a', signature: computeSignature(outfitShot([200, 40, 50])) },
      { id: 'b', signature: computeSignature(outfitShot([40, 80, 200], [230, 228, 225], 1)) },
      { id: 'c', signature: null },
    ]

    const match = bestMatch(target, candidates)

    expect(match?.entry.id).toBe('b')
  })

  it('stays quiet when nothing is close enough', () => {
    const target = computeSignature(outfitShot([40, 80, 200]))
    const candidates = [{ id: 'a', signature: computeSignature(outfitShot([210, 200, 60])) }]

    expect(bestMatch(target, candidates)).toBeNull()
  })

  it('skips entries that never got a signature', () => {
    const target = computeSignature(outfitShot([40, 80, 200]))
    expect(bestMatch(target, [{ id: 'x', signature: null }])).toBeNull()
  })
})
