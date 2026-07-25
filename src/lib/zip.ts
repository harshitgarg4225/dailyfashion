/**
 * Minimal ZIP writer (store method, no compression).
 *
 * Hand-rolled rather than pulled from npm for two reasons. First, J10 says
 * export must work offline in under 30 seconds for 200 entries, and storing
 * already-compressed JPEGs is both correct and instant — deflating them again
 * would burn CPU to make the file marginally larger. Second, every dependency
 * added to this app is a thing that could, in some future version, decide to
 * phone home; the privacy promise in J4 is easier to keep with a short
 * dependency list.
 *
 * Produces a standard archive that Finder, Explorer, and `unzip` all open.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array<ArrayBuffer>
  /** Modification time written into the archive. Defaults to now. */
  date?: Date
}

/** MS-DOS packed time/date, which is what the ZIP format still uses. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11)
  const packedDate =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(0, date.getFullYear() - 1980) & 0x7f) << 9)
  return { time, date: packedDate }
}

export function createZip(entries: readonly ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const { time, date } = dosDateTime(entry.date ?? new Date())

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flags: filename is UTF-8
    lv.setUint16(8, 0, true) // method: store
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, entry.data.length, true) // compressed size
    lv.setUint32(22, entry.data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra field length
    local.set(nameBytes, 30)

    chunks.push(local, entry.data)

    const dirEntry = new Uint8Array(46 + nameBytes.length)
    const dv = new DataView(dirEntry.buffer)
    dv.setUint32(0, 0x02014b50, true) // central directory signature
    dv.setUint16(4, 20, true) // version made by
    dv.setUint16(6, 20, true) // version needed
    dv.setUint16(8, 0x0800, true)
    dv.setUint16(10, 0, true)
    dv.setUint16(12, time, true)
    dv.setUint16(14, date, true)
    dv.setUint32(16, crc, true)
    dv.setUint32(20, entry.data.length, true)
    dv.setUint32(24, entry.data.length, true)
    dv.setUint16(28, nameBytes.length, true)
    dv.setUint16(30, 0, true) // extra
    dv.setUint16(32, 0, true) // comment
    dv.setUint16(34, 0, true) // disk number start
    dv.setUint16(36, 0, true) // internal attributes
    dv.setUint32(38, 0, true) // external attributes
    dv.setUint32(42, offset, true) // relative offset of local header
    dirEntry.set(nameBytes, 46)
    central.push(dirEntry)

    offset += local.length + entry.data.length
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0)

  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory signature
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with central directory
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true) // comment length

  return new Blob([...chunks, ...central, end], { type: 'application/zip' })
}

/** RFC 4180 escaping — quotes doubled, field wrapped when it needs it. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}
