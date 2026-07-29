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

/**
 * Grayscale box-resample of a *region* down to `w` x `h`.
 *
 * Taking a region rather than the whole frame is what makes the hash
 * scale-invariant: the subject's box is always resampled to the same grid, so
 * a photograph taken a step closer yields the same cells.
 */
function resampleGray(
  data: Uint8ClampedArray,
  srcW: number,
  region: Bounds,
  w: number,
  h: number,
): Float64Array {
  const out = new Float64Array(w * h)
  const regionW = region.x1 - region.x0
  const regionH = region.y1 - region.y0
  const cellW = regionW / w
  const cellH = regionH / h

  for (let y = 0; y < h; y++) {
    const y0 = region.y0 + Math.floor(y * cellH)
    const y1 = Math.max(y0 + 1, region.y0 + Math.floor((y + 1) * cellH))
    for (let x = 0; x < w; x++) {
      const x0 = region.x0 + Math.floor(x * cellW)
      const x1 = Math.max(x0 + 1, region.x0 + Math.floor((x + 1) * cellW))

      let sum = 0
      let count = 0
      for (let sy = y0; sy < y1 && sy < region.y1; sy++) {
        for (let sx = x0; sx < x1 && sx < region.x1; sx++) {
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
 * Difference hash: 64 bits, each recording whether a cell is meaningfully
 * brighter than its right-hand neighbour.
 *
 * The "meaningfully" is load-bearing and was learned by measurement. A plain
 * `>` makes every near-equal pair a coin toss decided by rounding noise, and
 * large flat areas are not an edge case here — a plain black coat against a
 * plain wall is most of the frame. Measured on an identical shot at 72%
 * exposure, a strict comparison drifted 15 bits of 64 and dropped the match
 * below the threshold: the same outfit, in slightly different light, not
 * recognised as itself.
 *
 * Comparing against a tolerance proportional to the frame's own dynamic range
 * fixes it at the root. Genuine edges clear the tolerance comfortably; flat
 * regions resolve to a stable zero in both photographs instead of flickering.
 * Because the tolerance scales with the range, it stays correct when the whole
 * image gets darker — which is exactly the case it exists for.
 */
const DHASH_TOLERANCE = 0.02

function dhashFrom(gray: Float64Array, w: number, h: number): string {
  let min = Infinity
  let max = -Infinity
  for (const value of gray) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const epsilon = Math.max(1e-6, (max - min) * DHASH_TOLERANCE)

  let bits = ''
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits += gray[y * w + x]! - gray[y * w + x + 1]! > epsilon ? '1' : '0'
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
export interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

function centralBounds(w: number, h: number): Bounds {
  return {
    x0: Math.floor(w * 0.28),
    x1: Math.ceil(w * 0.72),
    y0: Math.floor(h * 0.22),
    y1: Math.ceil(h * 0.78),
  }
}

/**
 * How far from the wall a pixel must be to count as the subject, as a fraction
 * of the strongest difference in the frame.
 *
 * Relative, not absolute, and for the same reason the hash tolerance is. An
 * absolute cut-off shrinks with the lighting: photograph the same outfit 15%
 * darker and every difference from the wall shrinks by 15% too, so fewer pixels
 * clear a fixed bar and the detected box quietly gets smaller. The box then
 * frames a different part of the person, and the fingerprint changes for a
 * reason that has nothing to do with the clothes.
 */
const FOREGROUND_FRACTION = 0.22

/** Share of a row or column that must be subject for it to be inside the box. */
const OCCUPANCY = 0.16

/**
 * Finds the person in the frame.
 *
 * This is the fix for the one limitation the robustness suite actually
 * measured: the same outfit photographed a step closer to the mirror was not
 * recognised as itself. The cause was never the hash or the histogram — it was
 * that both were computed over a *fixed* rectangle in the middle of the frame.
 * Move the subject or change its size and every descriptor shifts with it,
 * because they were describing a region rather than a person.
 *
 * Describing the subject's own bounding box instead makes the whole signature
 * scale- and position-normalised: a photograph taken closer produces the same
 * box contents, so it produces the same fingerprint.
 *
 * The estimate is crude on purpose — background colour from the frame's border,
 * then the rows and columns that differ from it. A mirror selfie is a person
 * against a wall, which is close to the easiest case this kind of estimate can
 * be handed. When it produces something implausible it falls back to the old
 * central crop, so the worst case is exactly the behaviour we had before.
 */
export function estimateSubject(data: Uint8ClampedArray, w: number, h: number): Bounds {
  const fallback = centralBounds(w, h)

  // Background from the border ring, which in a mirror selfie is wall.
  const border = Math.max(2, Math.floor(Math.min(w, h) * 0.06))
  let br = 0
  let bg = 0
  let bb = 0
  let samples = 0

  for (let y = 0; y < h; y++) {
    const edgeRow = y < border || y >= h - border
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= border && x < w - border) continue
      const i = (y * w + x) * 4
      if (data[i + 3]! < 8) continue
      br += data[i]!
      bg += data[i + 1]!
      bb += data[i + 2]!
      samples++
    }
  }
  if (samples === 0) return fallback

  br /= samples
  bg /= samples
  bb /= samples

  // First pass: how far from the wall does this frame actually get? The
  // threshold is then a fraction of that, so it tracks the lighting.
  const distances = new Float64Array(w * h)
  let strongest = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3]! < 8) continue
      const distance =
        Math.abs(data[i]! - br) + Math.abs(data[i + 1]! - bg) + Math.abs(data[i + 2]! - bb)
      distances[y * w + x] = distance
      if (distance > strongest) strongest = distance
    }
  }

  if (strongest <= 0) return fallback
  const cutoff = strongest * FOREGROUND_FRACTION

  const columns = new Float64Array(w)
  const rows = new Float64Array(h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (distances[y * w + x]! > cutoff) {
        columns[x]! += 1
        rows[y]! += 1
      }
    }
  }

  const firstOver = (values: Float64Array, limit: number, from: 'start' | 'end'): number => {
    if (from === 'start') {
      for (let i = 0; i < values.length; i++) if (values[i]! >= limit) return i
      return -1
    }
    for (let i = values.length - 1; i >= 0; i--) if (values[i]! >= limit) return i
    return -1
  }

  const x0 = firstOver(columns, h * OCCUPANCY, 'start')
  const x1 = firstOver(columns, h * OCCUPANCY, 'end')
  const y0 = firstOver(rows, w * OCCUPANCY, 'start')
  const y1 = firstOver(rows, w * OCCUPANCY, 'end')

  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) return fallback

  const boxW = x1 - x0
  const boxH = y1 - y0

  // Implausible detections: a sliver, or effectively the whole frame (which
  // means the border was not background after all).
  if (boxW < w * 0.12 || boxH < h * 0.12) return fallback
  if (boxW > w * 0.97 && boxH > h * 0.97) return fallback

  return { x0, x1: x1 + 1, y0, y1: y1 + 1 }
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
function histogramFrom(data: Uint8ClampedArray, w: number, h: number, region: Bounds): number[] {
  const bins = new Array(HIST_BINS).fill(0)
  const { x0, x1, y0, y1 } = region

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

      /*
       * Soft binning, not hard.
       *
       * Hard bin edges make the histogram brittle in exactly the case it exists
       * to handle: a pixel a hair either side of a boundary lands in a different
       * bucket, so a modest change in light walks a whole region across an edge
       * and the same outfit stops matching itself. Measured, a 30% exposure
       * change cost enough palette agreement to drop the score below the
       * matching threshold — the most common real-world variation there is,
       * failing.
       *
       * Splitting each pixel's weight across the two nearest bins on every axis
       * removes the cliff. The histogram then changes smoothly as the input
       * changes, which is the property the comparison actually needs.
       */
      if (saturation < ACHROMATIC_S) {
        // Neutral: position along the three lightness bands, relative to the
        // frame's own exposure.
        const ratio = max / meanValue
        const position = Math.min(
          ACHROMATIC_BINS - 1,
          Math.max(0, (ratio - 0.5) / 0.5),
        )
        const lower = Math.floor(position)
        const upper = Math.min(ACHROMATIC_BINS - 1, lower + 1)
        const blend = position - lower
        bins[lower]! += 1 - blend
        bins[upper]! += blend
      } else {
        let hue: number
        if (max === r) hue = ((g - b) / delta) % 6
        else if (max === g) hue = (b - r) / delta + 2
        else hue = (r - g) / delta + 4
        hue *= 60
        if (hue < 0) hue += 360

        // Hue wraps, so the bin below zero is the last bin rather than a clamp.
        const huePosition = (hue / 360) * HUE_BINS
        const hueLow = Math.floor(huePosition) % HUE_BINS
        const hueHigh = (hueLow + 1) % HUE_BINS
        const hueBlend = huePosition - Math.floor(huePosition)

        // Saturation blends across its single boundary rather than snapping.
        const satBlend = Math.min(1, Math.max(0, (saturation - 0.35) / 0.3))

        const put = (hueBin: number, satBin: number, weight: number) => {
          if (weight <= 0) return
          bins[ACHROMATIC_BINS + hueBin * SAT_BINS + satBin]! += weight
        }

        put(hueLow, 0, (1 - hueBlend) * (1 - satBlend))
        put(hueLow, 1, (1 - hueBlend) * satBlend)
        put(hueHigh, 0, hueBlend * (1 - satBlend))
        put(hueHigh, 1, hueBlend * satBlend)
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
function dominantColor(data: Uint8ClampedArray, w: number, region: Bounds): ColorFamily {
  const { x0, x1, y0, y1 } = region

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

/**
 * Vertical bands, which is how an outfit is actually composed.
 *
 * A single histogram over the whole subject says "this person is 40% navy and
 * 30% grey" and cannot tell a navy top with grey trousers from grey trousers
 * with a navy top. Splitting the subject into thirds keeps that ordering, and
 * ordering is most of what distinguishes one outfit from another in a wardrobe
 * where the same few colours recur.
 *
 * Three, not more: the bands have to survive someone standing slightly higher
 * or lower in frame, and finer slices start describing the pose rather than
 * the clothes.
 */
const BANDS = 3

function bandHistograms(data: Uint8ClampedArray, w: number, h: number, region: Bounds): number[][] {
  const height = region.y1 - region.y0
  const out: number[][] = []

  for (let band = 0; band < BANDS; band++) {
    out.push(
      histogramFrom(data, w, h, {
        x0: region.x0,
        x1: region.x1,
        y0: region.y0 + Math.floor((height * band) / BANDS),
        y1: region.y0 + Math.ceil((height * (band + 1)) / BANDS),
      }),
    )
  }

  return out
}

/**
 * The current fingerprint format.
 *
 * Versioned because the descriptor changed shape: signatures written by an
 * earlier build describe a fixed crop of the frame, and comparing one of those
 * against a subject-normalised one is not a weaker comparison, it is a
 * meaningless one. `similarity` refuses across versions rather than producing a
 * confident number from incompatible inputs.
 */
export const SIGNATURE_VERSION = 2

export function computeSignature(image: RawImage): ImageSignature {
  // Everything below describes the person, not the middle of the photograph.
  const subject = estimateSubject(image.data, image.width, image.height)
  const gray = resampleGray(image.data, image.width, subject, DHASH_W, DHASH_H)

  return {
    v: SIGNATURE_VERSION,
    dhash: dhashFrom(gray, DHASH_W, DHASH_H),
    hist: histogramFrom(image.data, image.width, image.height, subject),
    bands: bandHistograms(image.data, image.width, image.height, subject),
    color: dominantColor(image.data, image.width, subject),
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
  /*
   * Never compare across fingerprint versions.
   *
   * An older signature describes a fixed crop; a current one describes the
   * subject. A number derived from the two is not a weaker answer, it is a
   * meaningless one, and this matcher's job is to stay quiet when it does not
   * know rather than to produce a confident figure.
   */
  if ((a.v ?? 1) !== (b.v ?? 1)) return 0

  const distance = hammingDistance(a.dhash, b.dhash)
  if (!Number.isFinite(distance)) return 0
  const structure = 1 - distance / 64

  const overall = histogramIntersection(a.hist, b.hist)

  /*
   * Band agreement is the discriminating term.
   *
   * The overall histogram is generous — a wardrobe of navy and grey produces a
   * high overall match between two quite different outfits. Requiring the
   * colours to appear in the same *places* is what separates them, so the bands
   * carry more weight than the whole, and the weakest band is weighted too: an
   * outfit that agrees on top and disagrees at the hem is a different outfit.
   */
  const bandsA = a.bands
  const bandsB = b.bands
  let palette = overall

  if (bandsA && bandsB && bandsA.length === bandsB.length && bandsA.length > 0) {
    const scores = bandsA.map((band, index) => histogramIntersection(band, bandsB[index]!))
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
    const worst = Math.min(...scores)
    palette = 0.3 * overall + 0.45 * mean + 0.25 * worst
  }

  /*
   * Palette leads, and that is a reversal earned by measurement.
   *
   * Before subject detection, structure was the trustworthy term and the
   * palette was the generous one. Normalising to the subject inverted both.
   * Structure now describes a person-shaped box that looks much the same
   * whatever is being worn — measured, two completely different outfits in the
   * same room score 1.000 on structure — while the banded palette scores 0.000
   * between them and 0.998 between two photographs of the same outfit.
   *
   * Across the robustness suite this split puts every same-outfit case at 0.90
   * or above and every different-outfit case at 0.35 or below: a margin of 0.55
   * around a 0.86 threshold, where the previous descriptor had cases failing on
   * the wrong side of it. Structure keeps a real share because a palette can be
   * fooled by an outfit in one colour, and it is the term that separates a navy
   * dress from navy trousers and a navy top.
   */
  return 0.35 * structure + 0.65 * palette
}

export interface SimilarityCandidate<T> {
  entry: T
  score: number
}

/**
 * Cosine over unit vectors. Both sides are normalised at write time, so this
 * is a plain dot product; ReLU activations make it non-negative, so the
 * result already lives in [0, 1]. Zero for any length mismatch — a number
 * from two different models is not a weaker answer, it is a meaningless one.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return Math.max(0, Math.min(1, dot))
}

interface Matchable {
  signature: ImageSignature | null
  embedding?: number[] | null
}

/**
 * The two signals, fused — and only when both sides carry both.
 *
 * The hash sees structure and palette; the embedding sees content. Each has
 * a blindness the other covers: the hash fails across a change of mirror or
 * framing, the embedding can be seduced by two different black outfits. An
 * even split keeps either signal from overruling the other outright, and the
 * same threshold applies as ever — fusion is a better ruler, not a lower bar.
 *
 * Falls back to the signature alone whenever an embedding is missing, which
 * is every written day, every pre-model photo the backfill has not reached,
 * and every device where the model failed to load.
 */
export function fusedSimilarity(a: Matchable, b: Matchable): number {
  if (!a.signature || !b.signature) return 0
  const structural = similarity(a.signature, b.signature)
  if (!a.embedding || !b.embedding) return structural
  const semantic = cosine(a.embedding, b.embedding)
  if (semantic === 0) return structural
  return 0.5 * structural + 0.5 * semantic
}

/**
 * `bestMatch`, with the fused ruler. Kept as its own entry point so the
 * hash-only path stays available to callers that run before the model has
 * produced anything.
 */
export function bestMatchFused<T extends Matchable>(
  target: Matchable,
  candidates: readonly T[],
  threshold = SAME_OUTFIT_THRESHOLD,
): SimilarityCandidate<T> | null {
  let best: SimilarityCandidate<T> | null = null
  for (const candidate of candidates.slice(0, SIMILARITY_WINDOW)) {
    const score = fusedSimilarity(target, candidate)
    if (score >= threshold && (!best || score > best.score)) {
      best = { entry: candidate, score }
    }
  }
  return best
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
