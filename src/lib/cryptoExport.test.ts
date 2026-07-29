import { describe, expect, it } from 'vitest'
import { isSealedArchive, sealArchive, unsealArchive } from './cryptoExport'

const sample = () => new Blob([new TextEncoder().encode('PK\x03\x04 not really a zip')])

describe('the sealed export', () => {
  it('round-trips exactly', async () => {
    const original = sample()
    const sealed = await sealArchive(original, 'correct horse')
    const opened = await unsealArchive(sealed, 'correct horse')
    expect(new Uint8Array(await opened.arrayBuffer())).toEqual(
      new Uint8Array(await original.arrayBuffer()),
    )
  })

  it('refuses the wrong passphrase outright', async () => {
    const sealed = await sealArchive(sample(), 'right')
    // GCM authentication makes this a hard failure, never garbage output.
    await expect(unsealArchive(sealed, 'wrong')).rejects.toThrow()
  })

  it('is recognisable without the passphrase', async () => {
    const sealed = await sealArchive(sample(), 'x')
    expect(await isSealedArchive(sealed)).toBe(true)
    expect(await isSealedArchive(sample())).toBe(false)
    expect(await isSealedArchive(new Blob([]))).toBe(false)
  })

  it('never seals two archives alike', async () => {
    // Fresh salt and nonce per seal: identical inputs must not produce
    // identical outputs, or the archive leaks that nothing changed.
    const a = await sealArchive(sample(), 'p')
    const b = await sealArchive(sample(), 'p')
    expect(new Uint8Array(await a.arrayBuffer())).not.toEqual(
      new Uint8Array(await b.arrayBuffer()),
    )
  })
})
