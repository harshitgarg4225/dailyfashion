/**
 * The week as a reel: a short story-sized video, rendered entirely on-device.
 *
 * No model, no service, no upload — and that is a decision, not a shortcut.
 * The photographs cannot leave the device (the product's whole spine), and a
 * cloud video service would break that promise to do a job a canvas does
 * better: seven photos, slow zoom, a white blink between days, the numbers
 * that are true, the wordmark and the address at the end. Deterministic,
 * free, and it works in airplane mode.
 *
 * The encoder is the platform's own MediaRecorder over a canvas stream —
 * MP4 where the platform records it (Safari), WebM elsewhere. Rendering is
 * realtime by nature of captureStream, so the clip is kept short on purpose:
 * an intro, about a second per day, an outro. Reels reward short.
 */

const WIDTH = 720
const HEIGHT = 1280
const FPS = 30

const INTRO_MS = 1300
const PER_PHOTO_MS = 1000
const OUTRO_MS = 1600
/** The white blink between days — the camera gesture, kept. */
const BLINK_MS = 140

const PAPER = '#ffffff'
const INK = '#111111'
const INK_MUTED = '#6e6e6e'
const ROYAL = '#2743d6'

const FONT = "'Instrument Sans Variable', 'Instrument Sans', 'Helvetica Neue', Arial, sans-serif"

export interface ReelFrame {
  bitmap: ImageBitmap
  /** "MON", "TUE" — the day, in the viewer's locale. */
  label: string
  felt: number | null
}

export interface ReelInput {
  frames: ReelFrame[]
  /** "Tue 28 Jul — Mon 3 Aug" */
  range: string
  daysLogged: number
  repeated: number
}

/** The best encoding this platform can actually record. Null: no recorder. */
export function reelMimeType(): { mime: string; extension: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: Array<{ mime: string; extension: string }> = [
    { mime: 'video/mp4', extension: 'mp4' },
    { mime: 'video/webm;codecs=vp9', extension: 'webm' },
    { mime: 'video/webm;codecs=vp8', extension: 'webm' },
    { mime: 'video/webm', extension: 'webm' },
  ]
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null
}

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

function letterspacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let width = 0
  for (const char of text) width += ctx.measureText(char).width + spacing
  return Math.max(0, width - spacing)
}

/** Cover-fit with a slow push-in; zoom in [1.05, 1.14] over the day's second. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  progress: number,
): void {
  const zoom = 1.05 + 0.09 * progress
  const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height) * zoom
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
}

function drawIntro(ctx: CanvasRenderingContext2D, input: ReelInput, progress: number): void {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.globalAlpha = Math.min(1, progress * 2.2)
  ctx.fillStyle = INK_MUTED
  ctx.font = `500 26px ${FONT}`
  letterspaced(ctx, 'MY WEEK', 72, HEIGHT / 2 - 80, 9)

  ctx.fillStyle = INK
  ctx.font = `550 54px ${FONT}`
  ctx.fillText(input.range, 72, HEIGHT / 2)

  ctx.fillStyle = INK_MUTED
  ctx.font = `500 22px ${FONT}`
  letterspaced(ctx, 'DAILY FASHION', 72, HEIGHT - 96, 7)
  ctx.globalAlpha = 1
}

function drawDay(ctx: CanvasRenderingContext2D, frame: ReelFrame, progress: number): void {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  drawPhoto(ctx, frame.bitmap, progress)

  // The caption chip: paper, ink, square — the app's own grammar.
  const label = frame.felt !== null ? `${frame.label} · FELT ${frame.felt}` : frame.label
  ctx.font = `600 26px ${FONT}`
  const w = letterspacedWidth(ctx, label, 6) + 48
  ctx.fillStyle = PAPER
  ctx.fillRect(48, HEIGHT - 176, w, 72)
  ctx.fillStyle = INK
  letterspaced(ctx, label, 72, HEIGHT - 130, 6)
}

function drawOutro(ctx: CanvasRenderingContext2D, input: ReelInput, progress: number): void {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.globalAlpha = Math.min(1, progress * 2.2)
  ctx.fillStyle = INK
  ctx.font = `550 58px ${FONT}`
  ctx.fillText(`${input.daysLogged} days.`, 72, HEIGHT / 2 - 60)
  if (input.repeated > 0) {
    ctx.fillText(`Worn again: ${input.repeated}.`, 72, HEIGHT / 2 + 16)
  }

  ctx.fillStyle = INK_MUTED
  ctx.font = `500 24px ${FONT}`
  letterspaced(ctx, 'DAILY FASHION', 72, HEIGHT - 132, 7)
  ctx.fillStyle = ROYAL
  letterspaced(ctx, 'DAILYFASHION.CO', 72, HEIGHT - 88, 7)
  ctx.globalAlpha = 1
}

/**
 * Renders the reel and resolves with the encoded video. Rejects when the
 * platform has no usable recorder — the caller says so honestly.
 */
export function renderWeekReel(input: ReelInput): Promise<{ blob: Blob; extension: string }> {
  return new Promise((resolve, reject) => {
    const encoding = reelMimeType()
    if (!encoding || input.frames.length === 0) {
      reject(new Error('recording unsupported'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('no context'))
      return
    }

    const total = INTRO_MS + input.frames.length * PER_PHOTO_MS + OUTRO_MS
    const stream = canvas.captureStream(FPS)
    const recorder = new MediaRecorder(stream, {
      mimeType: encoding.mime,
      videoBitsPerSecond: 6_000_000,
    })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error('recording failed'))
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: encoding.mime.split(';')[0] })
      if (blob.size === 0) reject(new Error('empty recording'))
      else resolve({ blob, extension: encoding.extension })
    }

    const start = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const t = now - start
      if (t >= total) {
        cancelAnimationFrame(raf)
        recorder.stop()
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      if (t < INTRO_MS) {
        drawIntro(ctx, input, t / INTRO_MS)
      } else if (t < total - OUTRO_MS) {
        const into = t - INTRO_MS
        const index = Math.min(input.frames.length - 1, Math.floor(into / PER_PHOTO_MS))
        const local = into - index * PER_PHOTO_MS
        drawDay(ctx, input.frames[index]!, local / PER_PHOTO_MS)
        // The blink: a breath of white as one day hands over to the next.
        if (local < BLINK_MS) {
          ctx.globalAlpha = 1 - local / BLINK_MS
          ctx.fillStyle = PAPER
          ctx.fillRect(0, 0, WIDTH, HEIGHT)
          ctx.globalAlpha = 1
        }
      } else {
        drawOutro(ctx, input, (t - (total - OUTRO_MS)) / OUTRO_MS)
      }

      raf = requestAnimationFrame(draw)
    }

    recorder.start(250)
    raf = requestAnimationFrame(draw)
  })
}
