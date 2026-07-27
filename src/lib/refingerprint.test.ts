// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refingerprintOldEntries, __resetRefingerprintForTests } from './refingerprint'
import { SIGNATURE_VERSION } from './signature'
import { allEntries, putEntry, putPhoto, wipeEverything, __resetDbForTests } from '../db/db'
import { makeEntry, resetFactory } from '../test/factory'

/**
 * The upgrade path for an existing log.
 *
 * Without this pass, changing the descriptor quietly severs every user's
 * history at the update — nothing photographed before could match anything
 * after. That is invisible in testing and fatal in use, so it is pinned here.
 */

// preparePhoto needs canvas and createImageBitmap; the pass itself is what is
// under test, not the decoding.
vi.mock('./capture', () => ({
  preparePhoto: async () => ({
    blob: new Blob([new Uint8Array([1])]),
    signature: { v: SIGNATURE_VERSION, dhash: 'abcdef0123456789', hist: [1], bands: [[1]], color: 'blue' },
    width: 10,
    height: 10,
  }),
}))

function stale() {
  const entry = makeEntry({ felt: 4 })
  return { ...entry, signature: { dhash: 'old0000000000000', hist: [1], color: 'grey' as const } }
}

beforeEach(async () => {
  await wipeEverything()
  __resetDbForTests()
  __resetRefingerprintForTests()
  resetFactory()
})

describe('re-fingerprinting', () => {
  it('upgrades entries written before the descriptor changed', async () => {
    const entry = stale()
    await putPhoto(entry.photo_id!, new Blob([new Uint8Array([0xff, 0xd8])]))
    await putEntry(entry)

    const result = await refingerprintOldEntries()

    expect(result.updated).toBe(1)
    expect((await allEntries())[0]!.signature?.v).toBe(SIGNATURE_VERSION)
  })

  it('leaves current entries alone', async () => {
    const entry = makeEntry({ felt: 4 })
    await putPhoto(entry.photo_id!, new Blob([new Uint8Array([0xff, 0xd8])]))
    await putEntry({ ...entry, signature: { ...entry.signature!, v: SIGNATURE_VERSION } })

    expect((await refingerprintOldEntries()).updated).toBe(0)
  })

  it('skips an entry whose photograph is gone rather than failing the pass', async () => {
    // One missing image must not strand every later entry on an old signature.
    const orphan = stale()
    await putEntry(orphan)

    const withPhoto = stale()
    await putPhoto(withPhoto.photo_id!, new Blob([new Uint8Array([0xff, 0xd8])]))
    await putEntry(withPhoto)

    const result = await refingerprintOldEntries()

    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(1)
  })

  it('ignores written days, which never had a photograph', async () => {
    const written = { ...stale(), photo_id: null, signature: null }
    await putEntry(written)

    const result = await refingerprintOldEntries()
    expect(result.updated).toBe(0)
    expect(result.skipped).toBe(0)
  })
})
