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
 * The mark is a ring — a mirror, an aperture — on the app's own background.
 * Deliberately not a coat hanger or a dress: this is a log about how days felt,
 * and a garment icon would frame it as a wardrobe tool.
 */

const BG = [0x12, 0x10, 0x0f]
const RING = [0xd9, 0xa4, 0x41]

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
function renderPng(size, inset) {
  const centre = (size - 1) / 2
  const outer = (size / 2) * (1 - inset)
  const thickness = Math.max(2, size * 0.085)
  const inner = outer - thickness

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x - centre
      const dy = y - centre
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Antialias the ring edges so it does not look like a jagged donut.
      const outerEdge = Math.min(1, Math.max(0, outer - distance))
      const innerEdge = Math.min(1, Math.max(0, distance - inner))
      const alpha = Math.min(outerEdge, innerEdge)

      const offset = 1 + x * 3
      for (let c = 0; c < 3; c++) {
        row[offset + c] = Math.round(BG[c] * (1 - alpha) + RING[c] * alpha)
      }
    }
    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
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
  <rect width="512" height="512" rx="112" fill="#12100f"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#d9a441" stroke-width="44"/>
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
]

for (const [path, data] of targets) {
  const full = resolve(path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, data)
  console.log(`wrote ${path} (${data.length} bytes)`)
}
