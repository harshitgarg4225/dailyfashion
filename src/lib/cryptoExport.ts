/**
 * Optional passphrase protection for the export archive.
 *
 * The plain export is deliberately boring — a zip anyone can open — and it
 * stays the default. This wraps that same zip in AES-GCM when, and only
 * when, the user chooses a passphrase: for the backup that lives in a cloud
 * drive, an email to yourself, a shared family computer. The photographs are
 * of somebody in a mirror; where the archive travels beyond the device, the
 * option to seal it belongs to them.
 *
 * The passphrase is not stored, not recoverable, and not this app's to
 * reset. The copy in settings says so in exactly those words, because a
 * recovery story that does not exist must not be implied.
 *
 * Format, versioned by its magic: ASCII "DFSEAL1", 16-byte PBKDF2 salt,
 * 12-byte GCM nonce, ciphertext. Key = PBKDF2-SHA-256, 310,000 iterations —
 * OWASP's current floor — over the UTF-8 passphrase. GCM's tag doubles as
 * the wrong-passphrase check: decryption either yields the exact zip or
 * throws; there is no partially-decrypted state to mishandle.
 */

const MAGIC = new TextEncoder().encode('DFSEAL1')
const SALT_BYTES = 16
const NONCE_BYTES = 12
const PBKDF2_ITERATIONS = 310_000

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealArchive(zip: Blob, passphrase: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const key = await deriveKey(passphrase, salt)

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    await zip.arrayBuffer(),
  )

  return new Blob([MAGIC as BufferSource, salt as BufferSource, nonce as BufferSource, sealed], {
    type: 'application/octet-stream',
  })
}

/** Cheap check on the first bytes, so the import flow knows to ask. */
export async function isSealedArchive(blob: Blob): Promise<boolean> {
  if (blob.size < MAGIC.length + SALT_BYTES + NONCE_BYTES + 1) return false
  const head = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer())
  return head.every((byte, index) => byte === MAGIC[index])
}

/** The exact zip back, or a throw. A wrong passphrase fails GCM's tag check. */
export async function unsealArchive(blob: Blob, passphrase: string): Promise<Blob> {
  const saltStart = MAGIC.length
  const nonceStart = saltStart + SALT_BYTES
  const bodyStart = nonceStart + NONCE_BYTES

  const salt = new Uint8Array(await blob.slice(saltStart, nonceStart).arrayBuffer())
  const nonce = new Uint8Array(await blob.slice(nonceStart, bodyStart).arrayBuffer())
  const key = await deriveKey(passphrase, salt)

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    await blob.slice(bodyStart).arrayBuffer(),
  )
  return new Blob([plain], { type: 'application/zip' })
}
