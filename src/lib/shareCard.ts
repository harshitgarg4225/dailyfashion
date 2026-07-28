import type { WeekWrapped } from './weekWrapped'
import { mediumLabel } from './dates'

/**
 * Draws the week as an image somebody would actually post.
 *
 * The whole point of sharing here is the question it provokes — "where is that
 * jacket from?" — so the card is mostly photographs, laid out as a contact
 * sheet, with just enough type to say what it is and where it came from.
 *
 * **What is deliberately not on it: how you felt.** The felt score is the
 * private half of this product, and a card that published it would turn a
 * two-tap honesty exercise into a performance — people would start answering
 * for the audience rather than for themselves, and the log would quietly stop
 * being true. So the rule is: you share what you wore, never how it went.
 *
 * Rendered on-device to a canvas and handed to the OS share sheet as a Blob.
 * Nothing is uploaded: the card never leaves this process until the user hands
 * it to an app themselves, and the CSP admits no destination it could be sent
 * to. Where the image goes afterwards is the user's choice, made in their own
 * share sheet, which is the only place that decision belongs.
 */

/** 4:5, the aspect ratio that survives every feed without being cropped. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

/** At most six frames — a contact sheet, not a scroll. */
const MAX_PHOTOS = 6

const PAPER = '#f7f4ef'
const INK = '#1a1714'
const INK_MUTED = '#857a6d'
const LINE = '#ddd5c8'

const MARGIN = 72
const GUTTER = 16

/** Gap between the contact sheet and the first caption line. */
const CAPTION_LEAD = 76
/** Eyebrow baseline to the value beneath it. */
const CAPTION_VALUE = 52
/** Full height of one eyebrow-plus-value block. */
const CAPTION_BLOCK = 96
/** Space between the last line of type and the footer rule. */
const BREATH = 48

const DISPLAY = "'Bodoni Moda Variable', 'Didot', 'Bodoni 72', 'Hoefler Text', Garamond, serif"
const BODY = "-apple-system, 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif"

function letterspaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  let cursor = x
  for (const char of text) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + spacing
  }
}

/**
 * Fills the box with the image, cropped to cover.
 *
 * `cover` rather than `contain` here, unlike the journal grid: these are small
 * cells in a composed sheet, and letterboxed frames of different shapes read as
 * a broken layout rather than as respect for the photograph.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / bitmap.width, h / bitmap.height)
  const dw = bitmap.width * scale
  const dh = bitmap.height * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

export interface ShareCardInput {
  week: WeekWrapped
  /** Already-decoded photographs, newest first. May be shorter than the week. */
  photos: ImageBitmap[]
  /** Overrides the footline. Used by tests and by the example card. */
  handle?: string
}

export async function renderWeekCard({ week, photos, handle }: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.textBaseline = 'alphabetic'

  // --- masthead ---------------------------------------------------------
  ctx.fillStyle = INK_MUTED
  ctx.font = `500 20px ${BODY}`
  letterspaced(ctx, 'MY WEEK', MARGIN, MARGIN + 24, 5)

  ctx.fillStyle = INK
  ctx.font = `400 84px ${DISPLAY}`
  ctx.fillText(`${week.daysLogged} days`, MARGIN, MARGIN + 128)

  ctx.fillStyle = INK_MUTED
  ctx.font = `400 26px ${BODY}`
  ctx.fillText(
    `${mediumLabel(week.from)} — ${mediumLabel(week.to)}`,
    MARGIN,
    MARGIN + 176,
  )

  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(MARGIN, MARGIN + 216)
  ctx.lineTo(CARD_WIDTH - MARGIN, MARGIN + 216)
  ctx.stroke()

  // --- the contact sheet ------------------------------------------------
  //
  // The grid is sized to the space that is left, not to its own preferred
  // aspect ratio. Deriving cell height from cell *width* alone looked right at
  // one row and pushed the caption straight through the footer rule at two,
  // because the layout grew downward with the photo count while the frame did
  // not. Everything below reserves its space first; the photographs take what
  // remains.
  const gridTop = MARGIN + 264
  const footRuleY = CARD_HEIGHT - MARGIN - 56

  const colours = week.colours.slice(0, 3).map((c) => c.colour)
  const repeated = week.repeats.reduce((total, repeat) => total + repeat.times, 0)

  const shown = photos.slice(0, MAX_PHOTOS)
  const columns = 3
  const rows = Math.max(1, Math.ceil(shown.length / columns))
  const cell = (CARD_WIDTH - MARGIN * 2 - GUTTER * (columns - 1)) / columns

  /*
   * The caption hangs from the footer, not from the grid.
   *
   * Hanging it off the grid meant its position moved with the number of
   * photographs, so one row looked airy and two put the type through the rule
   * below it. Anchored to the bottom it lands in the same place every time, and
   * the photographs simply take whatever is left above it — which is also the
   * right way round editorially: the margin belongs to the picture.
   */
  const blocks = (colours.length > 0 ? 1 : 0) + (repeated > 0 ? 1 : 0)
  const captionTop =
    blocks === 0
      ? footRuleY - BREATH
      : footRuleY - BREATH - CAPTION_VALUE - (blocks - 1) * CAPTION_BLOCK

  /*
   * Fit the space, but never stretch past 4:5.
   *
   * Letting a single row take the full height gave frames near 3:7, and since
   * these are `cover` crops of a standing person that reliably removes their
   * head. Leftover space becomes air above the caption instead, which is what
   * an editorial layout would do with it anyway.
   */
  const available = captionTop - (blocks === 0 ? 0 : CAPTION_LEAD) - gridTop
  const cellHeight = Math.max(
    0,
    Math.min(cell * 1.25, (available - GUTTER * (rows - 1)) / rows),
  )

  // Centred in whatever the cap left over, so a short week reads as composed
  // rather than as a layout that ran out of pictures.
  const gridHeight = rows * cellHeight + (rows - 1) * GUTTER
  const gridY = gridTop + Math.max(0, (available - gridHeight) / 2)

  shown.forEach((bitmap, index) => {
    const x = MARGIN + (index % columns) * (cell + GUTTER)
    const y = gridY + Math.floor(index / columns) * (cellHeight + GUTTER)
    drawCover(ctx, bitmap, x, y, cell, cellHeight)
  })

  // --- what was worn ----------------------------------------------------
  //
  // Colours and repeats only. Both are facts about clothes; neither says
  // anything about the person wearing them.
  let y = captionTop

  if (colours.length > 0) {
    ctx.fillStyle = INK_MUTED
    ctx.font = `500 18px ${BODY}`
    letterspaced(ctx, 'WORN', MARGIN, y, 4)

    ctx.fillStyle = INK
    ctx.font = `400 40px ${DISPLAY}`
    ctx.fillText(colours.join(', '), MARGIN, y + CAPTION_VALUE)
    y += CAPTION_BLOCK
  }

  if (repeated > 0) {
    ctx.fillStyle = INK_MUTED
    ctx.font = `500 18px ${BODY}`
    letterspaced(ctx, 'REACHED FOR AGAIN', MARGIN, y, 4)

    ctx.fillStyle = INK
    ctx.font = `400 40px ${DISPLAY}`
    ctx.fillText(
      week.repeats.length === 1
        ? `1 outfit, ${week.repeats[0]!.times} days`
        : `${week.repeats.length} outfits`,
      MARGIN,
      y + CAPTION_VALUE,
    )
  }

  // --- footline ---------------------------------------------------------
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(MARGIN, CARD_HEIGHT - MARGIN - 56)
  ctx.lineTo(CARD_WIDTH - MARGIN, CARD_HEIGHT - MARGIN - 56)
  ctx.stroke()

  ctx.fillStyle = INK_MUTED
  ctx.font = `500 20px ${BODY}`
  letterspaced(ctx, handle ?? 'DAILY FASHION', MARGIN, CARD_HEIGHT - MARGIN - 8, 5)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      0.92,
    )
  })
}
