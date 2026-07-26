/**
 * Optional passcode lock (J4, F8).
 *
 * What this is: a gate in front of the app, so a phone handed to someone else
 * does not open onto a grid of mirror selfies. That is the thing J4 actually
 * asks for, and it is the thing that makes the app feel safe to use.
 *
 * What this deliberately is *not*: encryption of the photographs at rest.
 * That sounds like a strict improvement and is not, for one reason — there is
 * no account and no server, so there is nowhere to recover a forgotten
 * passcode from. Encrypting the log would mean a forgotten four digits
 * destroys years of history permanently, on a product whose entire value is
 * that the history accumulates. Until there is a real recovery story (an
 * export-backed key escrow, or a device keychain), a lock that protects
 * against the realistic threat is worth more than encryption that introduces
 * an unrecoverable one. The reasoning is recorded in docs/CPTO-AUDIT.md under
 * S1 rather than left implicit.
 *
 * The verifier below is a PBKDF2 hash, not the passcode. Storing the passcode
 * itself — even locally — would be indefensible.
 */

const ITERATIONS = 210_000
const SALT_BYTES = 16
const KEY_BITS = 256

export interface LockRecord {
  /** Base64. */
  salt: string
  /** Base64 PBKDF2 output. Compared, never reversed. */
  verifier: string
  iterations: number
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function createLock(passcode: string): Promise<LockRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const verifier = await derive(passcode, salt, ITERATIONS)
  return {
    salt: toBase64(salt),
    verifier: toBase64(verifier),
    iterations: ITERATIONS,
  }
}

/** Constant-time comparison, so a wrong passcode leaks nothing by timing. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function verifyLock(record: LockRecord, passcode: string): Promise<boolean> {
  try {
    const candidate = await derive(
      passcode,
      fromBase64(record.salt),
      record.iterations || ITERATIONS,
    )
    return equal(candidate, fromBase64(record.verifier))
  } catch {
    return false
  }
}

/** Minimum length. Short enough to type one-handed, long enough to matter. */
export const MIN_PASSCODE_LENGTH = 4

export function passcodeIsAcceptable(passcode: string): boolean {
  return passcode.trim().length >= MIN_PASSCODE_LENGTH
}
