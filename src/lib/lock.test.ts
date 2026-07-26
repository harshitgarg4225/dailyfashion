// @vitest-environment node
//
// Node's webcrypto provides subtle.deriveBits; happy-dom does not implement it.
import { describe, expect, it } from 'vitest'
import { createLock, passcodeIsAcceptable, verifyLock, MIN_PASSCODE_LENGTH } from './lock'

describe('the passcode lock', () => {
  it('accepts the right passcode', async () => {
    const record = await createLock('4821')
    expect(await verifyLock(record, '4821')).toBe(true)
  })

  it('rejects the wrong one', async () => {
    const record = await createLock('4821')
    expect(await verifyLock(record, '4822')).toBe(false)
    expect(await verifyLock(record, '')).toBe(false)
    expect(await verifyLock(record, '48210')).toBe(false)
  })

  it('never stores the passcode itself', async () => {
    const record = await createLock('4821')
    const serialised = JSON.stringify(record)
    expect(serialised).not.toContain('4821')
  })

  it('salts each lock, so identical passcodes produce different records', async () => {
    const a = await createLock('4821')
    const b = await createLock('4821')
    expect(a.salt).not.toBe(b.salt)
    expect(a.verifier).not.toBe(b.verifier)
  })

  it('uses a work factor worth having', async () => {
    // A trivially cheap KDF on a four-digit passcode is decoration.
    const record = await createLock('4821')
    expect(record.iterations).toBeGreaterThanOrEqual(100_000)
  })

  it('survives a corrupted record instead of throwing', async () => {
    const record = await createLock('4821')
    expect(await verifyLock({ ...record, salt: 'not base64 !!' }, '4821')).toBe(false)
  })

  it('holds a minimum length', () => {
    expect(passcodeIsAcceptable('123')).toBe(false)
    expect(passcodeIsAcceptable('1234')).toBe(true)
    expect(MIN_PASSCODE_LENGTH).toBe(4)
  })
})
