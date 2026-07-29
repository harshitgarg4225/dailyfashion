/// <reference lib="webworker" />
import { computeSignature } from './signature'
import type { ImageSignature } from '../types'

/**
 * Downscale, re-encode and fingerprint a photograph off the main thread.
 *
 * This runs at the single worst moment to block: the shutter has just been
 * tapped, J1 promised the whole interaction would take under five seconds, and
 * the main thread is what animates the transition away from the camera. Decoding
 * a 12-megapixel JPEG, drawing it twice and re-encoding it is comfortably enough
 * work to drop frames there.
 *
 * `OffscreenCanvas` is not universally available, so `capture.ts` keeps the
 * main-thread path and falls back to it. The two must stay behaviourally
 * identical — they share `computeSignature`, which is where all the actual
 * decisions live.
 */

const MAX_DIMENSION = 1400
const JPEG_QUALITY = 0.82
const ANALYSIS_DIMENSION = 128
const THUMB_DIMENSION = 320
const THUMB_QUALITY = 0.72

export interface PhotoWorkerRequest {
  id: number
  bitmap: ImageBitmap
}

export interface PhotoWorkerResponse {
  id: number
  ok: boolean
  blob?: Blob
  thumb?: Blob
  signature?: ImageSignature
  width?: number
  height?: number
  error?: string
}

function scaledSize(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height }
  const scale = max / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function draw(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('offscreen 2d unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

self.onmessage = async (event: MessageEvent<PhotoWorkerRequest>) => {
  const { id, bitmap } = event.data

  try {
    const stored = scaledSize(bitmap.width, bitmap.height, MAX_DIMENSION)
    const storedCanvas = draw(bitmap, stored.width, stored.height)
    const blob = await storedCanvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })

    // The grid rendition, made here while the bitmap is already decoded —
    // making it later would mean decoding the full JPEG a second time.
    const thumbSize = scaledSize(bitmap.width, bitmap.height, THUMB_DIMENSION)
    const thumbCanvas = draw(bitmap, thumbSize.width, thumbSize.height)
    const thumb = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: THUMB_QUALITY })

    const analysis = scaledSize(bitmap.width, bitmap.height, ANALYSIS_DIMENSION)
    const analysisCanvas = draw(bitmap, analysis.width, analysis.height)
    const context = analysisCanvas.getContext('2d', { willReadFrequently: true })!
    const imageData = context.getImageData(0, 0, analysis.width, analysis.height)

    const response: PhotoWorkerResponse = {
      id,
      ok: true,
      blob,
      thumb,
      signature: computeSignature({
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      }),
      width: stored.width,
      height: stored.height,
    }
    ;(self as unknown as Worker).postMessage(response)
  } catch (error) {
    const response: PhotoWorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'unknown',
    }
    ;(self as unknown as Worker).postMessage(response)
  } finally {
    bitmap.close()
  }
}
