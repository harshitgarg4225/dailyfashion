import type { ColorFamily } from '../types'

/**
 * Garment naming: turning the classifier's opinion into a word worth showing.
 *
 * The model is a general image classifier, so most of what it can say is
 * irrelevant here — nobody's outfit is a goldfish. This module is the filter
 * between the model's thousand classes and the roughly twenty garment words
 * this product is willing to put on someone's day, and it is deliberately pure:
 * no tensor library, no model file, just arithmetic over a list of
 * predictions. That is what makes the naming rules unit-testable without
 * loading eleven megabytes of weights.
 *
 * The same philosophy as the insight engine applies. A name is offered only
 * above a confidence floor, it is always shown as a *suggestion* the user can
 * overwrite, and the user's own word permanently outranks the model's. The
 * model proposes; the person disposes.
 */

/**
 * ImageNet class name → the word the app would actually use.
 *
 * Keys are the exact class strings the MobileNet label file ships — a unit
 * test asserts each one exists there, so a typo cannot silently disable a
 * garment. The value vocabulary is deliberately small, lowercase, and free of
 * judgment; anything the ban list would reject has no business being a value
 * here.
 *
 * What is deliberately absent: underwear (private, and none of the app's
 * business to name), accessories like sunglasses and bags (the day's garment
 * is the subject, not the props), and costume classes like chain mail that
 * only ever appear as misfires.
 */
export const GARMENT_CLASSES: Record<string, string> = {
  'jersey, T-shirt, tee shirt': 't-shirt',
  cardigan: 'cardigan',
  sweatshirt: 'sweatshirt',
  'suit, suit of clothes': 'suit',
  'jean, blue jean, denim': 'jeans',
  'miniskirt, mini': 'skirt',
  overskirt: 'skirt',
  'hoopskirt, crinoline': 'skirt',
  gown: 'gown',
  kimono: 'kimono',
  'trench coat': 'trench coat',
  'fur coat': 'coat',
  'lab coat, laboratory coat': 'coat',
  cloak: 'coat',
  poncho: 'poncho',
  sarong: 'sarong',
  abaya: 'abaya',
  'pajama, pyjama, pj\'s, jammies': 'pyjamas',
  apron: 'apron',
  'military uniform': 'uniform',
  'wool, woolen, woollen': 'knitwear',
  stole: 'scarf',
  'bow tie, bow-tie, bowtie': 'bow tie',
  'Windsor tie': 'tie',
  'bolo tie, bolo, bola tie, bola': 'tie',
  'swimming trunks, bathing trunks': 'swimsuit',
  'bikini, two-piece': 'swimsuit',
  maillot: 'swimsuit',
  'maillot, tank suit': 'swimsuit',
  'cowboy hat, ten-gallon hat': 'hat',
  sombrero: 'hat',
  'running shoe': 'trainers',
  Loafer: 'loafers',
  sandal: 'sandals',
  'clog, geta, patten, sabot': 'clogs',
  'cowboy boot': 'boots',
}

/**
 * The confidence floor, over the *summed* probability of a friendly name.
 *
 * Summed, because ImageNet splits one garment across several classes — a
 * skirt's probability arrives as miniskirt plus overskirt plus hoopskirt — and
 * judging any single class against the floor would refuse names the model was
 * actually sure of.
 *
 * The floor is set where the same trade-off as the "same outfit?" threshold
 * lands: a missing name costs nothing (the field just stays empty), a wrong
 * one asks the user to correct the app inside a flow that promised to be
 * effortless. When in doubt, stay quiet.
 */
export const NAME_CONFIDENCE = 0.15

export interface GarmentPrediction {
  className: string
  probability: number
}

export interface GarmentGuess {
  name: string
  confidence: number
}

/**
 * Collapses raw classifier output into at most one garment name.
 *
 * Returns null when nothing mapped clears the floor — which is the correct
 * answer for a written day, a photo of a wall, or an outfit the model simply
 * does not recognise. Null is silence, and silence is always safe.
 */
export function aggregateGarment(predictions: GarmentPrediction[]): GarmentGuess | null {
  const byName = new Map<string, number>()

  for (const prediction of predictions) {
    const name = GARMENT_CLASSES[prediction.className]
    if (!name) continue
    byName.set(name, (byName.get(name) ?? 0) + prediction.probability)
  }

  let best: GarmentGuess | null = null
  for (const [name, confidence] of byName) {
    if (!best || confidence > best.confidence) best = { name, confidence }
  }

  if (!best || best.confidence < NAME_CONFIDENCE) return null
  return best
}

/**
 * "black cardigan", assembled from the two things the app derives for free.
 *
 * The colour comes from the signature's histogram, not the model, so a naming
 * failure never costs the colour and vice versa. Jeans are the one case where
 * colour is usually redundant ("blue jeans") but never wrong, so no special
 * case — special-casing copy is how inconsistency starts.
 */
export function describeGarment(name: string, color: ColorFamily | null): string {
  return color ? `${color} ${name}` : name
}
