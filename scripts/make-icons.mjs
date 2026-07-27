import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/**
 * Generates the app icons.
 *
 * Written by hand rather than added as binary blobs so the icons are
 * reviewable in a diff and reproducible from source. It also avoids adding an
 * image-processing dependency for four small squares.
 *
 * The mark is two rings, one offset inside the other: a reflection that does
 * not quite line up with the thing reflected. That is the product — a mirror
 * with a memory, showing you something slightly different from what you
 * expected to see.
 *
 * Deliberately not a coat hanger or a dress. This is a log about how days
 * felt, and a garment icon would frame it as a wardrobe tool. A single plain
 * ring, which is what this was, said nothing at all.
 */

/*
 * Ivory paper and ink, matching the app.
 *
 * The first version was dark with an amber ring, from before the design
 * settled — an icon that does not match the first screen reads as a different
 * product, and it is the only part of the app someone sees before opening it.
 */
const BG = [0xf7, 0xf4, 0xef]
const RING = [0x1a, 0x17, 0x14]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * @param size pixel dimension
 * @param inset fraction of the canvas left as padding around the mark.
 *        Maskable icons need a generous safe zone or launchers crop the ring.
 */
function renderPng(size, inset, height = size) {
  const centreX = (size - 1) / 2
  const centreY = (height - 1) / 2
  const span = Math.min(size, height)
  const outer = (span / 2) * (1 - inset)
  // Hairlines, matching the interface. The design language is rules, not slabs.
  const thickness = Math.max(1.5, span * 0.035)

  // The echo: smaller, and shifted up-left so the two never sit concentric.
  const echoRadius = outer * 0.62
  const echoShift = outer * 0.16

  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      // Coverage of a ring of the given radius at this pixel, antialiased so
      // the curve does not read as a staircase at 48px.
      const ringAlpha = (cx, cy, radius) => {
        const dx = x - cx
        const dy = y - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        return Math.min(
          1,
          Math.max(0, radius + thickness / 2 - d),
          Math.max(0, d - (radius - thickness / 2)),
        )
      }

      const alpha = Math.max(
        ringAlpha(centreX, centreY, outer),
        ringAlpha(centreX - echoShift, centreY - echoShift, echoRadius),
      )

      const offset = 1 + x * 3
      for (let c = 0; c < 3; c++) {
        row[offset + c] = Math.round(BG[c] * (1 - alpha) + RING[c] * alpha)
      }
    }
    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Daily Fashion">
  <rect width="512" height="512" fill="#f7f4ef"/>
  <circle cx="256" cy="256" r="168" fill="none" stroke="#1a1714" stroke-width="18"/>
  <circle cx="229" cy="229" r="104" fill="none" stroke="#1a1714" stroke-width="18"/>
</svg>
`

const targets = [
  ['public/icon-192.png', renderPng(192, 0.18)],
  ['public/icon-512.png', renderPng(512, 0.18)],
  // Maskable icons get cropped to a circle or squircle by the launcher, so the
  // mark sits well inside the safe zone.
  ['public/icon-maskable.png', renderPng(512, 0.3)],
  ['public/icon-180.png', renderPng(180, 0.14)],
  ['public/icon.svg', Buffer.from(SVG, 'utf8')],

  /*
   * iOS launch images. Without them an installed PWA flashes white before the
   * first paint, which on an ivory app is a visible jolt every single launch.
   * Three sizes cover the current iPhone range; iOS picks the closest match and
   * a mismatch simply falls back to the flash we have today.
   */
  ['public/splash-1170x2532.png', renderPng(1170, 0.72, 2532)],
  ['public/splash-1284x2778.png', renderPng(1284, 0.72, 2778)],
  ['public/splash-1179x2556.png', renderPng(1179, 0.72, 2556)],
]

for (const [path, data] of targets) {
  const full = resolve(path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, data)
  console.log(`wrote ${path} (${data.length} bytes)`)
}
