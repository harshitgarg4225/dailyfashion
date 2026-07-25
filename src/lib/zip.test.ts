import { describe, expect, it } from 'vitest'
import { createZip, crc32, csvCell, csvRow } from './zip'

const encoder = new TextEncoder()

function bytes(text: string): Uint8Array {
  return encoder.encode(text)
}

async function read(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

describe('crc32', () => {
  it('matches the known check value for "123456789"', () => {
    // The standard CRC-32 check vector. If this drifts, every archive we
    // produce is quietly corrupt in a way most tools only warn about.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('createZip', () => {
  it('writes a well-formed archive', async () => {
    const blob = createZip([
      { name: 'log.csv', data: bytes('date,felt\n2025-01-01,4\n') },
      { name: 'photos/a.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    ])

    const view = await read(blob)

    // Local file header signature at the start.
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    // End-of-central-directory signature at the end.
    expect(view.getUint32(view.byteLength - 22, true)).toBe(0x06054b50)
    // Two entries, counted in both fields.
    expect(view.getUint16(view.byteLength - 22 + 8, true)).toBe(2)
    expect(view.getUint16(view.byteLength - 22 + 10, true)).toBe(2)
  })

  it('points the central directory at the real local header offsets', async () => {
    const first = bytes('one')
    const second = bytes('two-and-a-bit-longer')
    const blob = createZip([
      { name: 'a.txt', data: first },
      { name: 'b.txt', data: second },
    ])
    const view = await read(blob)

    const centralOffset = view.getUint32(view.byteLength - 22 + 16, true)
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50)

    // First entry's local header sits at byte 0.
    expect(view.getUint32(centralOffset + 42, true)).toBe(0)

    // Second entry's offset must land on a local header signature, which is
    // the check that catches off-by-one arithmetic in the writer.
    const secondCentral = centralOffset + 46 + 'a.txt'.length
    const secondLocal = view.getUint32(secondCentral + 42, true)
    expect(view.getUint32(secondLocal, true)).toBe(0x04034b50)
  })

  it('records sizes and crc for stored entries', async () => {
    const data = bytes('hello world')
    const view = await read(createZip([{ name: 'a.txt', data }]))

    expect(view.getUint32(14, true)).toBe(crc32(data))
    expect(view.getUint32(18, true)).toBe(data.length) // compressed
    expect(view.getUint32(22, true)).toBe(data.length) // uncompressed
  })

  it('flags filenames as UTF-8 so non-ASCII names survive', async () => {
    const view = await read(createZip([{ name: 'café.txt', data: bytes('x') }]))
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
  })

  it('produces a valid empty archive', async () => {
    const blob = createZip([])
    const view = await read(blob)
    expect(blob.size).toBe(22)
    expect(view.getUint32(0, true)).toBe(0x06054b50)
  })
})

describe('csv escaping', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('blue jacket')).toBe('blue jacket')
    expect(csvCell(4)).toBe('4')
  })

  it('renders a missing value as empty rather than "null"', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('quotes and doubles as RFC 4180 requires', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('escapes a note containing a comma without breaking the row', () => {
    const row = csvRow(['2025-01-01', 4, 'felt good, wore it twice'])
    expect(row).toBe('2025-01-01,4,"felt good, wore it twice"')
    expect(row.split('","').length).toBe(1)
  })
})
