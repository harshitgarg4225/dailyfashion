import { describe, expect, it } from 'vitest'
import { computeSignature, similarity, SAME_OUTFIT_THRESHOLD, type RawImage } from './signature'

/**
 * How the matcher behaves on photographs that vary the way real ones do.
 *
 * The existing suite proves the algorithm is correct on clean inputs. This one
 * asks a harder and more important question: does it still recognise the same
 * outfit when the photograph is taken a week later, standing slightly differently,
 * in different light?
 *
 * That matters more than anything else in the product. The flagship observation
 * — "you rate this highly and never reach for it" — needs five wears of one
 * recognised outfit. If the matcher under-clusters on real photographs, nobody
 * ever reaches five, the card never fires, and the whole thing has no payoff.
 *
 * These are still synthetic. They model the variation, not the mess: no fabric
 * texture, no motion blur, no shadow falling across a wall. Treat the numbers
 * as a lower bound on difficulty and an upper bound on confidence. The real
 * calibration needs real photographs — this suite exists so that when they
 * arrive, there is something to compare against.
 */

interface Shot {
  garment: [number, number, number]
  wall?: [number, number, number]
  /** Horizontal offset of the subject, as a fraction of width. */
  shiftX?: number
  shiftY?: number
  /** Scale of the subject. 1.1 = a step closer to the mirror. */
  scale?: number
  /** Global illumination multiplier. */
  exposure?: number
  /** Adds a contrasting block, standing in for a bag, a scarf, a raised arm. */
  occlusion?: boolean
  /** Fine noise, standing in for fabric texture and sensor grain. */
  texture?: number
}

const W = 96
const H = 128

/**
 * A mirror selfie: a subject against a wall, with the variation knobs a real
 * second photograph of the same outfit would introduce.
 */
function shot(options: Shot): RawImage {
  const {
    garment,
    wall = [232, 229, 224],
    shiftX = 0,
    shiftY = 0,
    scale = 1,
    exposure = 1,
    occlusion = false,
    texture = 0,
  } = options

  const data = new Uint8ClampedArray(W * H * 4)

  const cx = W * (0.5 + shiftX)
  const cy = H * (0.5 + shiftY)
  const halfW = W * 0.22 * scale
  const halfH = H * 0.3 * scale

  // Deterministic pseudo-noise: the same seed gives the same texture, so a
  // failure is reproducible rather than flaky.
  let seed = 7
  const noise = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed / 2147483648 - 0.5) * 2
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const inSubject = Math.abs(x - cx) < halfW && Math.abs(y - cy) < halfH

      let colour: [number, number, number]
      if (inSubject) {
        // Vertical shading, as a garment actually falls.
        const shade = 1 - ((y - (cy - halfH)) / (halfH * 2)) * 0.22
        colour = [garment[0] * shade, garment[1] * shade, garment[2] * shade]
      } else {
        colour = wall
      }

      if (
        occlusion &&
        x > cx - halfW * 0.5 &&
        x < cx + halfW * 0.2 &&
        y > cy &&
        y < cy + halfH * 0.55
      ) {
        colour = [40, 38, 36]
      }

      const grain = texture > 0 ? noise() * texture * 255 : 0

      data[i] = colour[0] * exposure + grain
      data[i + 1] = colour[1] * exposure + grain
      data[i + 2] = colour[2] * exposure + grain
      data[i + 3] = 255
    }
  }

  return { data, width: W, height: H }
}

const NAVY: [number, number, number] = [42, 54, 96]
const CAMEL: [number, number, number] = [176, 137, 84]

function score(a: Shot, b: Shot): number {
  return similarity(computeSignature(shot(a)), computeSignature(shot(b)))
}

describe('recognising the same outfit on a different day', () => {
  it('survives a change in light', () => {
    // The most common variation of all: morning sun versus a bathroom bulb.
    expect(score({ garment: NAVY }, { garment: NAVY, exposure: 0.72 })).toBeGreaterThan(
      SAME_OUTFIT_THRESHOLD,
    )
  })

  it('survives fabric texture and sensor grain', () => {
    expect(
      score({ garment: NAVY, texture: 0.02 }, { garment: NAVY, texture: 0.03 }),
    ).toBeGreaterThan(SAME_OUTFIT_THRESHOLD)
  })

  it('survives standing a little to one side', () => {
    expect(score({ garment: NAVY }, { garment: NAVY, shiftX: 0.03 })).toBeGreaterThan(
      SAME_OUTFIT_THRESHOLD,
    )
  })

  it('survives the combination a real second photograph would have', () => {
    // Slightly different position, slightly different light, slightly different
    // texture — all at once, which is the realistic case rather than one at a time.
    expect(
      score(
        { garment: CAMEL, texture: 0.02 },
        { garment: CAMEL, shiftX: 0.02, shiftY: 0.015, exposure: 0.85, texture: 0.025 },
      ),
    ).toBeGreaterThan(SAME_OUTFIT_THRESHOLD)
  })

  it('still separates two genuinely different outfits', () => {
    // The rule that protects the user from being asked a silly question.
    expect(score({ garment: NAVY }, { garment: CAMEL })).toBeLessThan(SAME_OUTFIT_THRESHOLD)
  })

  it('separates two outfits even when the room is identical', () => {
    // The realistic false-positive case: same bathroom, same wall, same light,
    // different clothes. If the background dominates, this is where it shows.
    expect(
      score(
        { garment: NAVY, exposure: 0.9, texture: 0.02 },
        { garment: CAMEL, exposure: 0.9, texture: 0.02 },
      ),
    ).toBeLessThan(SAME_OUTFIT_THRESHOLD)
  })
})

/**
 * Cases the matcher is expected to miss.
 *
 * Documented as behaviour rather than hidden, because a missed match costs the
 * user nothing — they simply are not asked — while a wrong match costs them a
 * decision at the exact moment the app promised not to interrupt. These are the
 * places tuning against real photographs should focus.
 */
describe('limits and behaviours, measured rather than assumed', () => {
  it('recognises the same outfit photographed much closer', () => {
    // This was the one limitation the suite actually measured, and it is gone.
    // The descriptor is computed over the subject's own bounding box, so a step
    // towards the mirror produces the same box contents and the same
    // fingerprint. Previously below the threshold; now effectively identical.
    expect(score({ garment: NAVY }, { garment: NAVY, scale: 1.35 })).toBeGreaterThan(
      SAME_OUTFIT_THRESHOLD,
    )
  })

  it('recognises it from further away too', () => {
    expect(score({ garment: NAVY }, { garment: NAVY, scale: 0.75 })).toBeGreaterThan(
      SAME_OUTFIT_THRESHOLD,
    )
  })

  it('keeps a wide margin between the same outfit and a different one', () => {
    // The number that matters for real photographs, which will be messier than
    // these: how much room is there between a match and a non-match.
    const same = score(
      { garment: CAMEL, texture: 0.02 },
      { garment: CAMEL, shiftX: 0.02, exposure: 0.85, texture: 0.025 },
    )
    const different = score(
      { garment: NAVY, exposure: 0.9, texture: 0.02 },
      { garment: CAMEL, exposure: 0.9, texture: 0.02 },
    )
    expect(same - different).toBeGreaterThan(0.4)
  })

  it('does still recognise it behind a large bag or a raised arm', () => {
    // Measured rather than assumed — this was expected to be a limitation and
    // is not. Enough of the frame survives a bag or a raised arm that both the
    // structure and the palette still agree, which is the behaviour we want and
    // is now pinned so a future change cannot quietly lose it.
    expect(score({ garment: NAVY }, { garment: NAVY, occlusion: true })).toBeGreaterThan(
      SAME_OUTFIT_THRESHOLD,
    )
  })
})
