// @vitest-environment node
//
// happy-dom's Blob loses `arrayBuffer` once it has been through
// fake-indexeddb's structured clone. Node's native Blob does not, and nothing
// in the export path needs a DOM — `triggerDownload` is the only part that
// touches `document`, and it is not exercised here.
import { beforeEach, describe, expect, it } from 'vitest'
import { buildExport, importArchive } from './exportData'
import { readZip } from './zip'
import {
  allEntries,
  putEntry,
  putPhoto,
  wipeEverything,
  __resetDbForTests,
} from '../db/db'
import { makeEntry, resetFactory } from '../test/factory'

/**
 * The round trip is the test that matters.
 *
 * Export on its own is easy to get subtly wrong in a way nobody notices until
 * someone actually needs it — on a new phone, with the old one already wiped.
 * These cases assert that what comes out can go back in.
 */

async function seed(count: number) {
  const entries = []
  for (let i = 0; i < count; i++) {
    const entry = makeEntry({ felt: 4 })
    // A tiny but real payload, so photo bytes are genuinely round-tripped.
    await putPhoto(entry.photo_id, new Blob([new Uint8Array([0xff, 0xd8, i, 0xff, 0xd9])]))
    await putEntry(entry)
    entries.push(entry)
  }
  return entries
}

beforeEach(async () => {
  await wipeEverything()
  __resetDbForTests()
  resetFactory()
})

describe('export', () => {
  it('includes a spreadsheet, a manifest, and one photo per day', async () => {
    await seed(3)
    const result = await buildExport()
    const names = (await readZip(result.blob)).map((f) => f.name)

    expect(names).toContain('log.csv')
    expect(names).toContain('log.json')
    expect(names).toContain('README.txt')
    expect(names.filter((n) => n.startsWith('photos/'))).toHaveLength(3)
  })

  it('names every photo in the manifest', async () => {
    const seeded = await seed(2)
    const files = await readZip((await buildExport()).blob)
    const manifest = JSON.parse(
      new TextDecoder().decode(files.find((f) => f.name === 'log.json')!.data),
    )

    for (const entry of seeded) {
      expect(manifest.photoNames[entry.id]).toBeTruthy()
      expect(files.some((f) => f.name === manifest.photoNames[entry.id])).toBe(true)
    }
  })
})

describe('import', () => {
  it('restores a log into an empty device', async () => {
    const seeded = await seed(3)
    const archive = await buildExport()

    await wipeEverything()
    __resetDbForTests()
    expect(await allEntries()).toHaveLength(0)

    const result = await importArchive(archive.blob)

    expect(result.added).toBe(3)
    const restored = await allEntries()
    expect(restored.map((e) => e.id).sort()).toEqual(seeded.map((e) => e.id).sort())
  })

  it('preserves the things a spreadsheet cannot carry', async () => {
    // Fingerprints and outfit clusters are the accumulated knowledge that makes
    // the log worth keeping; a CSV-only import would silently discard them.
    const entry = makeEntry({ felt: 5, outfitId: 'outfit_x', colour: 'blue' })
    await putPhoto(entry.photo_id, new Blob([new Uint8Array([1, 2, 3])]))
    await putEntry(entry)

    const archive = await buildExport()
    await wipeEverything()
    __resetDbForTests()
    await importArchive(archive.blob)

    const restored = (await allEntries())[0]!
    expect(restored.outfit_id).toBe('outfit_x')
    expect(restored.signature?.dhash).toBe(entry.signature?.dhash)
    expect(restored.signature?.color).toBe('blue')
    expect(restored.felt_score).toBe(5)
    expect(restored.chips).toEqual(entry.chips)
  })

  it('is idempotent — importing twice does not duplicate', async () => {
    await seed(2)
    const archive = await buildExport()

    const second = await importArchive(archive.blob)

    expect(second.added).toBe(0)
    expect(second.skipped).toBe(2)
    expect(await allEntries()).toHaveLength(2)
  })

  it('merges into an existing log rather than replacing it', async () => {
    await seed(2)
    const archive = await buildExport()

    await wipeEverything()
    __resetDbForTests()
    resetFactory()
    await seed(1) // a different device with its own day

    const result = await importArchive(archive.blob)

    // The seeded entry re-uses ids from the factory counter, so at least the
    // archive's own days must be present and nothing may be lost.
    expect(result.added + result.skipped).toBe(2)
    expect((await allEntries()).length).toBeGreaterThanOrEqual(2)
  })

  it('rejects an archive that is not one of ours', async () => {
    const notOurs = new Blob([new Uint8Array([1, 2, 3, 4])])
    await expect(importArchive(notOurs)).rejects.toThrow()
  })
})
