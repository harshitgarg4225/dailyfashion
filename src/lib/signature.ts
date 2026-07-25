import type { ColorFamily, ImageSignature } from '../types'

/**
 * Image fingerprinting for J3: "don't make me build a wardrobe database."
 *
 * The whole point is that item-level knowledge should accumulate as a side
 * effect of taking a photo. So on save we fingerprint the shot and compare it
 * against recent entries; if it looks like something already in the log we
 * offer a one-tap "same as Tuesday?" and that tap is the entire cataloging
 * interaction.
 *
 * Deliberately not embeddings or CLIP. A difference hash plus a color
 * histogram is cheap, runs in a few milliseconds on a phone, needs no model
 * download (which would mean a network request, which would break J4), and is
 * accurate enough for "is this the same jacket photographed in the same
 * bathroom." Upgrade path is v1.1, not now.
 */

/** Comparisons are capped at the most recent N entries, per spec. */
export const SIMILARITY_WINDOW = 60

/**
 * Above this, we offer the "same outfit?" prompt.
 *
 * Tuned to be conservative. A missed suggestion costs the user nothing — they
 * just don't get asked. A false suggestion asks them to reject something,
 * which is friction in exactly the moment J1 promised would be frictionless.
 * When in doubt, stay quiet.
 */
export const SAME_OUTFIT_THRESHOLD = 0.86

const DHASH_W = 9
const DHASH_H = 8

/** Grayscale box-resample of an RGBA buffer down to `w` x `h`. */
function resampleGray(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  w: number,
  h: number,
): Float64Array {
  const out = new Float64Array(w * h)
  const cellW = srcW / w
  const cellH = srcH / h

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * cellH)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * cellH))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * cellW)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * cellW))

      let sum = 0
      let count = 0
      for (let sy = y0; sy < y1 && sy < srcH; sy++) {
        for (let sx = x0; sx < x1 && sx < srcW; sx++) {
          const i = (sy * srcW + sx) * 4
          // Rec. 601 luma.
          sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
          count++
        }
      }
      out[y * w + x] = count > 0 ? sum / count : 0
    }
  }
  return out
}

/**
 * Difference hash: 64 bits, each recording whether a pixel is brighter than
 * its right-hand neighbour. Robust to brightness and exposure shifts, which
 * matters a lot when the same outfit gets photographed in morning light on
 * Tuesday and under a bathroom bulb on Friday.
 */
function dhashFrom(gray: Float64Array, w: number, h: number): string {
  let bits = ''
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits += gray[y * w + x]! > gray[y * w + x + 1]! ? '1' : '0'
    }
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)
    // Popcount of a nibble.
    distance += ((xor & 1) ? 1 : 0) + ((xor & 2) ? 1 : 0) + ((xor & 4) ? 1 : 0) + ((xor & 8) ? 1 : 0)
  }
  return distance
}

/**
 * The region of the frame that is actually the outfit.
 *
 * Everything outside it is wall, floor and door frame — and crucially, it is
 * the *same* wall every day. Letting the background into either the palette or
 * the colour vote would make every photo taken in one bathroom look alike,
 * which is precisely the false "same as Tuesday?" that J1 cannot afford.
 */
function centralBounds(w: number, h: number) {
  return {
    x0: Math.floor(w * 0.28),
    x1: Math.ceil(w * 0.72),
    y0: Math.floor(h * 0.22),
    y1: Math.ceil(h * 0.78),
  }
}

const HUE_BINS = 12
const SAT_BINS = 2
const ACHROMATIC_BINS = 3
/** 3 neutral bins, then hue x saturation for everything with colour in it. */
export const HIST_BINS = ACHROMATIC_BINS + HUE_BINS * SAT_BINS

/** Saturation below this has no meaningful hue — it is black, grey or white. */
const ACHROMATIC_S = 0.15

/**
 * Palette histogram over the subject region, in HSV rather than RGB.
 *
 * RGB is the obvious choice and it is wrong here. Bin an RGB histogram at 4
 * levels per channel and a 30% exposure change moves every pixel into a
 * different bin — the same jacket photographed on a cloudy morning scores zero
 * against itself. Since J3's entire job is recognising the same outfit across
 * days, that failure mode is the whole feature.
 *
 * HSV fixes it structurally. Scale every channel by k and hue is unchanged,
 * `s = delta / max` is unchanged, and normalising value against the frame's own
 * mean makes the third axis a ratio rather than an absolute. The result is
 * invariant to illumination by construction instead of by tuning.
 */
function histogramFrom(data: Uint8ClampedArray, w: number, h: number): number[] {
  const bins = new Array(HIST_BINS).fill(0)
  const { x0, x1, y0, y1 } = centralBounds(w, h)

  // Mean value over the crop, so the lightness axis can be expressed relative
  // to the shot's own exposure rather than in absolute levels.
  let valueSum = 0
  let counted = 0
  for (let y = y0; y < y1 && y < h; y++) {
    for (let x = x0; x < x1 && x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3]! < 8) continue
      valueSum += Math.max(data[i]!, data[i + 1]!, data[i + 2]!)
      counted++
    }
  }
  if (counted === 0) return bins
  const meanValue = Math.max(1, valueSum / counted)

  let total = 0
  for (let y = y0; y < y1 && y < h; y++) {
    for (let x = x0; x < x1 && x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3]! < 8) continue

      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const delta = max - min
      const saturation = max === 0 ? 0 : delta / max

      if (saturation < ACHROMATIC_S) {
        const ratio = max / meanValue
        const bin = ratio < 0.75 ? 0 : ratio < 1.25 ? 1 : 2
        bins[bin]++
      } else {
        let hue: number
        if (max === r) hue = ((g - b) / delta) % 6
        else if (max === g) hue = (b - r) / delta + 2
        else hue = (r - g) / delta + 4
        hue *= 60
        if (hue < 0) hue += 360

        const hueBin = Math.min(HUE_BINS - 1, Math.floor((hue / 360) * HUE_BINS))
        const satBin = saturation < 0.5 ? 0 : 1
        bins[ACHROMATIC_BINS + hueBin * SAT_BINS + satBin]++
      }
      total++
    }
  }

  if (total === 0) return bins
  return bins.map((n) => n / total)
}

/** Histogram intersection: 1 when palettes are identical, 0 when disjoint. */
export function histogramIntersection(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i]!, b[i]!)
  return sum
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min

  if (delta === 0) return [0, 0, l]

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

/**
 * Bucket one pixel into a broad, nameable color family.
 *
 * These are the names a person would use out loud, which matters because the
 * insight engine says them back: "you get told you look good in colour, and
 * you reach for grey." Precision beyond this is useless — nobody needs to be
 * told their jacket is #4A5D6B.
 */
export function classifyColor(r: number, g: number, b: number): ColorFamily {
  const [h, s, l] = rgbToHsl(r, g, b)

  if (l < 0.13) return 'black'
  if (l > 0.9 && s < 0.2) return 'white'
  if (s < 0.13) return l > 0.75 ? 'white' : 'grey'

  // Dark oranges read as brown to a human eye, and "brown" is how people
  // describe that coat.
  if (h >= 15 && h < 45 && l < 0.38) return 'brown'

  if (h < 15 || h >= 345) return 'red'
  if (h < 45) return 'orange'
  if (h < 70) return 'yellow'
  if (h < 165) return 'green'
  if (h < 255) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}

/**
 * Dominant family across the centre of the frame.
 *
 * The crop matters: in a mirror selfie the edges are wall, floor and door
 * frame, and letting those vote would tell us the user wears a lot of
 * magnolia. The middle band is overwhelmingly torso.
 */
function dominantColor(data: Uint8ClampedArray, w: number, h: number): ColorFamily {
  const { x0, x1, y0, y1 } = centralBounds(w, h)

  const counts = new Map<ColorFamily, number>()
  // Sample rather than read every pixel; the answer is a bucket, not a mean.
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 48))

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4
      if (data[i + 3]! < 8) continue
      const family = classifyColor(data[i]!, data[i + 1]!, data[i + 2]!)
      counts.set(family, (counts.get(family) ?? 0) + 1)
    }
  }

  let best: ColorFamily = 'grey'
  let bestCount = -1
  for (const [family, count] of counts) {
    if (count > bestCount) {
      best = family
      bestCount = count
    }
  }
  return best
}

export interface RawImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export function computeSignature(image: RawImage): ImageSignature {
  const gray = resampleGray(image.data, image.width, image.height, DHASH_W, DHASH_H)
  return {
    dhash: dhashFrom(gray, DHASH_W, DHASH_H),
    hist: histogramFrom(image.data, image.width, image.height),
    color: dominantColor(image.data, image.width, image.height),
  }
}

/**
 * Similarity in [0, 1].
 *
 * Structure is weighted above palette because palette alone is far too
 * generous — half a wardrobe is navy, and "you own two blue things" is not
 * evidence they are the same blue thing. Structure alone is too strict, since
 * pose changes between days; together they behave.
 */
export function similarity(a: ImageSignature, b: ImageSignature): number {
  const distance = hammingDistance(a.dhash, b.dhash)
  if (!Number.isFinite(distance)) return 0
  const structure = 1 - distance / 64
  const palette = histogramIntersection(a.hist, b.hist)
  return 0.62 * structure + 0.38 * palette
}

export interface SimilarityCandidate<T> {
  entry: T
  score: number
}

/**
 * Best match above threshold, or null.
 *
 * Returns at most one candidate on purpose. "Same as Tuesday?" is a yes/no a
 * half-dressed person can answer in one tap; a ranked list of five maybes is a
 * decision, and decisions are what J1 spent all its effort removing.
 */
export function bestMatch<T extends { signature: ImageSignature | null }>(
  target: ImageSignature,
  candidates: readonly T[],
  threshold = SAME_OUTFIT_THRESHOLD,
): SimilarityCandidate<T> | null {
  let best: SimilarityCandidate<T> | null = null
  for (const candidate of candidates.slice(0, SIMILARITY_WINDOW)) {
    if (!candidate.signature) continue
    const score = similarity(target, candidate.signature)
    if (score >= threshold && (!best || score > best.score)) {
      best = { entry: candidate, score }
    }
  }
  return best
}
