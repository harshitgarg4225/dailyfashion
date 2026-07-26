import { computeSignature, type RawImage } from './signature'
import type { ImageSignature } from '../types'
import type { PhotoWorkerRequest, PhotoWorkerResponse } from './photoWorker'

/**
 * Turning a camera frame or a picked file into something the log can store.
 *
 * Photos are downscaled before they are saved. A modern phone camera produces
 * 4-12MB per shot, and a year of daily logging at that size is several
 * gigabytes of browser storage — which browsers evict. Storage pressure is how
 * a local-only app loses someone's data, so keeping entries small is a
 * durability feature, not an optimisation.
 */

/** Long edge of a stored photo. Comfortably retina on any phone. */
const MAX_DIMENSION = 1400

const JPEG_QUALITY = 0.82

/** Working size for fingerprinting. Small is fine and much faster. */
const ANALYSIS_DIMENSION = 128

function scaledSize(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height }
  const scale = max / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Decode, honouring the EXIF orientation flag.
 *
 * Phone cameras habitually store the sensor's raw landscape frame plus a "rotate
 * this" tag. Without `from-image` a portrait photograph imported from the camera
 * roll arrives on its side — and the crop the fingerprint depends on then samples
 * the wall instead of the outfit, so this is a correctness issue for J3 and not
 * only a display one.
 */
async function toBitmap(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    // Older engines reject the option outright rather than ignoring it.
    return createImageBitmap(source)
  }
}

function drawTo(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

export interface PreparedPhoto {
  blob: Blob
  signature: ImageSignature
  width: number
  height: number
}

/**
 * The worker, created lazily and reused.
 *
 * Held as a module singleton because spinning one up per capture would cost
 * more than the work it is meant to offload.
 */
let worker: Worker | null = null
let workerBroken = false
let nextRequestId = 1

function getWorker(): Worker | null {
  if (workerBroken) return null
  if (worker) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    workerBroken = true
    return null
  }
  try {
    worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('error', () => {
      // One failure and we stop trying; the main-thread path always works.
      workerBroken = true
      worker = null
    })
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** Attempts the worker. Resolves null when it is unavailable or misbehaves. */
async function prepareInWorker(source: Blob): Promise<PreparedPhoto | null> {
  const instance: Worker | null = getWorker()
  if (instance === null) return null
  const active: Worker = instance

  let bitmap: ImageBitmap
  try {
    bitmap = await toBitmap(source)
  } catch {
    return null
  }

  const id = nextRequestId++

  return new Promise<PreparedPhoto | null>((resolve) => {
    // A worker that never answers must not strand the shutter.
    const timeout = setTimeout(() => {
      active.removeEventListener('message', onMessage)
      resolve(null)
    }, 8000)

    function onMessage(event: MessageEvent<PhotoWorkerResponse>) {
      if (event.data.id !== id) return
      clearTimeout(timeout)
      active.removeEventListener('message', onMessage)

      const { ok, blob, signature, width, height } = event.data
      if (!ok || !blob || !signature || width === undefined || height === undefined) {
        resolve(null)
        return
      }
      resolve({ blob, signature, width, height })
    }

    active.addEventListener('message', onMessage)
    active.postMessage({ id, bitmap } satisfies PhotoWorkerRequest, [bitmap])
  })
}

/**
 * Downscale, re-encode, and fingerprint.
 *
 * Prefers the worker so the shutter does not drop frames, and falls back to the
 * main thread wherever OffscreenCanvas is missing or the worker misbehaves. The
 * fallback is not a degraded mode — it is the same code producing the same
 * signature, just on the wrong thread.
 */
export async function preparePhoto(source: Blob): Promise<PreparedPhoto> {
  const offloaded = await prepareInWorker(source)
  if (offloaded) return offloaded

  const bitmap = await toBitmap(source)
  try {
    const stored = scaledSize(bitmap.width, bitmap.height, MAX_DIMENSION)
    const canvas = drawTo(bitmap, stored.width, stored.height)
    const blob = await canvasToBlob(canvas)

    const analysis = scaledSize(bitmap.width, bitmap.height, ANALYSIS_DIMENSION)
    const analysisCanvas = drawTo(bitmap, analysis.width, analysis.height)
    const context = analysisCanvas.getContext('2d', { willReadFrequently: true })!
    const imageData = context.getImageData(0, 0, analysis.width, analysis.height)

    const raw: RawImage = {
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    }

    return { blob, signature: computeSignature(raw), width: stored.width, height: stored.height }
  } finally {
    bitmap.close()
  }
}

/** Grab the current video frame. Used by the shutter button. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')

  // A front camera preview is mirrored so it behaves like a mirror. The
  // captured file has to be mirrored to match, or the saved photo comes out
  // reversed from what the user just framed.
  if (video.dataset.mirrored === 'true') {
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvasToBlob(canvas, 0.92)
}

/**
 * DateTimeOriginal out of a JPEG's EXIF block.
 *
 * J5 backdates seeded photos to when they were actually taken, so a backfill
 * produces real history rather than three entries stamped today. Parsed by
 * hand because pulling in an EXIF library to read one tag is not a trade worth
 * making in an app whose dependency list is a privacy argument.
 *
 * Returns null on anything unexpected — a missing date is a minor degradation
 * (we fall back to file mtime), never a reason to fail an import.
 */
export async function readExifDate(blob: Blob): Promise<Date | null> {
  try {
    // The EXIF block lives near the start; 256KB is far more than enough.
    const head = await blob.slice(0, 256 * 1024).arrayBuffer()
    const view = new DataView(head)

    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null // not a JPEG

    let offset = 2
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return null
      const marker = view.getUint8(offset + 1)
      const size = view.getUint16(offset + 2, false)

      if (marker === 0xe1) {
        const app1 = offset + 4
        // "Exif\0\0"
        if (view.getUint32(app1, false) !== 0x45786966) return null
        const tiff = app1 + 6
        const little = view.getUint16(tiff, false) === 0x4949
        if (view.getUint16(tiff + 2, little) !== 42) return null

        const ifd0 = tiff + view.getUint32(tiff + 4, little)
        const exifIfd = findTag(view, ifd0, little, 0x8769)
        if (exifIfd === null) return null

        const raw = readAscii(view, tiff + exifIfd, tiff, little, 0x9003)
        return raw ? parseExifTimestamp(raw) : null
      }

      if (marker === 0xd9 || marker === 0xda) return null // image data begins
      offset += 2 + size
    }
    return null
  } catch {
    return null
  }
}

/** Returns the LONG value of `tag` in the IFD at `dirStart`, or null. */
function findTag(
  view: DataView,
  dirStart: number,
  little: boolean,
  tag: number,
): number | null {
  if (dirStart + 2 > view.byteLength) return null
  const count = view.getUint16(dirStart, little)
  for (let i = 0; i < count; i++) {
    const entry = dirStart + 2 + i * 12
    if (entry + 12 > view.byteLength) return null
    if (view.getUint16(entry, little) === tag) return view.getUint32(entry + 8, little)
  }
  return null
}

/** Reads an ASCII tag out of the IFD at `dirStart`. */
function readAscii(
  view: DataView,
  dirStart: number,
  tiff: number,
  little: boolean,
  tag: number,
): string | null {
  if (dirStart + 2 > view.byteLength) return null
  const count = view.getUint16(dirStart, little)
  for (let i = 0; i < count; i++) {
    const entry = dirStart + 2 + i * 12
    if (entry + 12 > view.byteLength) return null
    if (view.getUint16(entry, little) !== tag) continue

    const length = view.getUint32(entry + 4, little)
    const start = tiff + view.getUint32(entry + 8, little)
    if (start + length > view.byteLength) return null

    let text = ''
    for (let c = 0; c < length - 1; c++) text += String.fromCharCode(view.getUint8(start + c))
    return text
  }
  return null
}

/** EXIF timestamps look like "2025:01:14 08:31:02" and are local time. */
function parseExifTimestamp(raw: string): Date | null {
  const match = raw.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Best available "when was this taken", for J5's backfill. */
export async function inferPhotoDate(file: File): Promise<Date> {
  const exif = await readExifDate(file)
  if (exif) return exif
  if (file.lastModified) return new Date(file.lastModified)
  return new Date()
}
