import type { Entry, EntryItem, Item, Outfit, Settings } from '../types'
import type { Dismissal } from '../lib/insights'
import type { LockRecord } from '../lib/lock'
import { toDateKey } from '../lib/dates'

/**
 * Local storage layer. IndexedDB only — no network, no sync, no account (J4).
 *
 * Photo blobs live in this same database rather than in OPFS or the Cache API,
 * for one reason: J10 promises that "delete everything" deletes everything.
 * One `deleteDatabase` removes the entries and the photos together, atomically,
 * with no chance of orphaned images surviving in a second store the user was
 * never told about. That guarantee is worth more than the marginal performance
 * of a separate file backend.
 */

const DB_NAME = 'dailyfashion'

/**
 * Bump this and add a migration below for any schema change.
 *
 * Scaffolding this before launch rather than after is the whole point: once
 * there are logs in the wild, the first schema change has to work on databases
 * created by every version that shipped before it, and retrofitting an upgrade
 * path onto a bare `createObjectStore` block is where local-first apps lose
 * people's data.
 */
const DB_VERSION = 1

export const STORES = {
  entries: 'entries',
  photos: 'photos',
  outfits: 'outfits',
  items: 'items',
  entryItems: 'entry_items',
  settings: 'settings',
  dismissed: 'dismissed_insights',
} as const

export const DEFAULT_SETTINGS: Settings = {
  reminder_time: '20:30',
  reminder_enabled: false,
  consecutive_ignores: 0,
  blur_thumbnails: false,
  passcode_lock: false,
  onboarded: false,
  camera_facing: 'user',
  softened_at: null,
  last_reminder_for: null,
  // On by default: the model runs on-device, sends nothing, and its output is
  // an editable suggestion. The off switch exists for anyone who wants no
  // machine opinion at all, which is a preference worth honouring.
  garment_naming: true,
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const from = event.oldVersion

      // v1: initial schema. Every creation is guarded so this block is also
      // safe to run against a partially-created database.
      if (from < 1) {
        if (!db.objectStoreNames.contains(STORES.entries)) {
          const entries = db.createObjectStore(STORES.entries, { keyPath: 'id' })
          entries.createIndex('by_date', 'date')
          entries.createIndex('by_outfit', 'outfit_id')
        }
        if (!db.objectStoreNames.contains(STORES.photos)) {
          db.createObjectStore(STORES.photos)
        }
        if (!db.objectStoreNames.contains(STORES.outfits)) {
          db.createObjectStore(STORES.outfits, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORES.items)) {
          const items = db.createObjectStore(STORES.items, { keyPath: 'id' })
          items.createIndex('by_label', 'label', { unique: true })
        }
        if (!db.objectStoreNames.contains(STORES.entryItems)) {
          const links = db.createObjectStore(STORES.entryItems, { autoIncrement: true })
          links.createIndex('by_entry', 'entry_id')
          links.createIndex('by_item', 'item_id')
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings)
        }
        if (!db.objectStoreNames.contains(STORES.dismissed)) {
          db.createObjectStore(STORES.dismissed)
        }
      }

      // Future migrations go here, each guarded by `from < N` and each written
      // to run after every earlier one — never as a replacement for them.
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction {
  return db.transaction(stores, mode)
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

// --- ids ------------------------------------------------------------------

export function newId(prefix: string): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return `${prefix}_${source.randomUUID()}`

  // Every browser with the camera APIs this app needs has getRandomValues.
  // Math.random has no business generating identifiers, even harmless ones.
  const bytes = source.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex}`
}

// --- entries --------------------------------------------------------------

export async function putEntry(entry: Entry): Promise<void> {
  const db = await openDb()
  const transaction = tx(db, [STORES.entries], 'readwrite')
  transaction.objectStore(STORES.entries).put(entry)
  await done(transaction)
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await openDb()
  return promisify(tx(db, [STORES.entries], 'readonly').objectStore(STORES.entries).get(id))
}

/** Newest first. The whole log fits comfortably in memory at MVP scale. */
export async function allEntries(): Promise<Entry[]> {
  const db = await openDb()
  const rows = await promisify<Entry[]>(
    tx(db, [STORES.entries], 'readonly').objectStore(STORES.entries).getAll(),
  )
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at - a.created_at))
}

/** Entries still waiting for an evening reflection, newest first. */
export async function unratedEntries(): Promise<Entry[]> {
  return (await allEntries()).filter((e) => e.felt_score === null)
}

export async function entriesOn(date: string): Promise<Entry[]> {
  const db = await openDb()
  const index = tx(db, [STORES.entries], 'readonly').objectStore(STORES.entries).index('by_date')
  return promisify<Entry[]>(index.getAll(IDBKeyRange.only(date)))
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await openDb()
  const entry = await getEntry(id)
  const transaction = tx(db, [STORES.entries, STORES.photos, STORES.entryItems], 'readwrite')
  transaction.objectStore(STORES.entries).delete(id)
  if (entry?.photo_id) transaction.objectStore(STORES.photos).delete(entry.photo_id)

  // Drop the tag links too, so a deleted day cannot keep voting in insights.
  const linkStore = transaction.objectStore(STORES.entryItems)
  const cursorRequest = linkStore.index('by_entry').openCursor(IDBKeyRange.only(id))
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }

  await done(transaction)
}

// --- photos ---------------------------------------------------------------

export async function putPhoto(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const transaction = tx(db, [STORES.photos], 'readwrite')
  transaction.objectStore(STORES.photos).put(blob, id)
  await done(transaction)
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  return promisify<Blob | undefined>(
    tx(db, [STORES.photos], 'readonly').objectStore(STORES.photos).get(id),
  )
}

// --- outfits --------------------------------------------------------------

export async function allOutfits(): Promise<Outfit[]> {
  const db = await openDb()
  return promisify<Outfit[]>(
    tx(db, [STORES.outfits], 'readonly').objectStore(STORES.outfits).getAll(),
  )
}

/**
 * Recompute an outfit's aggregates from its entries.
 *
 * The `Outfit` row denormalizes wear_count / avg_felt / last_worn for cheap
 * reads, which is only safe if it is never written by hand. Every mutation
 * that can change a cluster routes through here.
 */
export async function recomputeOutfit(outfitId: string): Promise<Outfit | null> {
  const db = await openDb()
  const entries = await promisify<Entry[]>(
    tx(db, [STORES.entries], 'readonly')
      .objectStore(STORES.entries)
      .index('by_outfit')
      .getAll(IDBKeyRange.only(outfitId)),
  )

  const transaction = tx(db, [STORES.outfits], 'readwrite')
  const store = transaction.objectStore(STORES.outfits)

  if (entries.length === 0) {
    store.delete(outfitId)
    await done(transaction)
    return null
  }

  const dates = entries.map((e) => e.date).sort()
  const scored = entries.filter((e) => e.felt_score !== null)
  const outfit: Outfit = {
    id: outfitId,
    first_seen: dates[0]!,
    wear_count: entries.length,
    avg_felt:
      scored.length === 0
        ? null
        : scored.reduce((sum, e) => sum + e.felt_score!, 0) / scored.length,
    last_worn: dates[dates.length - 1]!,
  }
  store.put(outfit)
  await done(transaction)
  return outfit
}

/**
 * Link two entries into one outfit cluster — the entirety of J3's cataloging.
 *
 * If either side already belongs to a cluster we reuse that id rather than
 * minting a new one, so repeated confirmations merge into a single outfit
 * instead of fragmenting into pairs.
 */
export async function linkEntries(entryId: string, matchId: string): Promise<string> {
  const [entry, match] = await Promise.all([getEntry(entryId), getEntry(matchId)])
  if (!entry || !match) throw new Error('cannot link entries that do not exist')

  const outfitId = match.outfit_id ?? entry.outfit_id ?? newId('outfit')
  const db = await openDb()
  const transaction = tx(db, [STORES.entries], 'readwrite')
  const store = transaction.objectStore(STORES.entries)
  store.put({ ...entry, outfit_id: outfitId })
  if (match.outfit_id !== outfitId) store.put({ ...match, outfit_id: outfitId })
  await done(transaction)

  await recomputeOutfit(outfitId)
  return outfitId
}

// --- items (lazy tagging) -------------------------------------------------

export async function allItems(): Promise<Item[]> {
  const db = await openDb()
  return promisify<Item[]>(tx(db, [STORES.items], 'readonly').objectStore(STORES.items).getAll())
}

export async function allEntryItems(): Promise<EntryItem[]> {
  const db = await openDb()
  return promisify<EntryItem[]>(
    tx(db, [STORES.entryItems], 'readonly').objectStore(STORES.entryItems).getAll(),
  )
}

/**
 * Attach a one-word tag to an entry, creating the item if it is new.
 *
 * Labels are matched case-insensitively so "Blue Jacket" and "blue jacket"
 * are the same thing. Someone typing a tag at 8am on a phone should not have
 * to match their own past capitalization to get credit for it.
 */
export async function tagEntry(entryId: string, rawLabel: string): Promise<Item | null> {
  const label = rawLabel.trim().toLowerCase().replace(/\s+/g, ' ')
  if (label.length === 0) return null

  const existing = (await allItems()).find((i) => i.label === label)
  const item: Item = existing ?? { id: newId('item'), label, created_at: Date.now() }

  const db = await openDb()
  const transaction = tx(db, [STORES.items, STORES.entryItems], 'readwrite')
  if (!existing) transaction.objectStore(STORES.items).put(item)

  const links = transaction.objectStore(STORES.entryItems)
  const existingLinks = links.index('by_entry').getAll(IDBKeyRange.only(entryId))
  existingLinks.onsuccess = () => {
    const already = (existingLinks.result as EntryItem[]).some((l) => l.item_id === item.id)
    if (!already) links.put({ entry_id: entryId, item_id: item.id })
  }

  await done(transaction)
  return item
}

/** Autocomplete source for the tag field — past labels only, never a catalog. */
export async function itemSuggestions(prefix: string, limit = 6): Promise<Item[]> {
  const needle = prefix.trim().toLowerCase()
  const items = await allItems()
  const matches = needle.length === 0 ? items : items.filter((i) => i.label.includes(needle))
  return matches.slice(0, limit)
}

/**
 * Copies an existing photo blob under a fresh id.
 *
 * Used by J6's "wearing this again", which must be one tap. Re-photographing
 * would be two taps and a camera launch; pointing two entries at one blob
 * would mean deleting either day destroys the other's image. Copying costs a
 * few hundred kilobytes and keeps every entry independently deletable.
 */
export async function clonePhoto(sourceId: string): Promise<string | null> {
  const blob = await getPhoto(sourceId)
  if (!blob) return null
  const id = newId('photo')
  await putPhoto(id, blob)
  return id
}

// --- settings -------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const db = await openDb()
  const stored = await promisify<Partial<Settings> | undefined>(
    tx(db, [STORES.settings], 'readonly').objectStore(STORES.settings).get('settings'),
  )
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  const db = await openDb()
  const transaction = tx(db, [STORES.settings], 'readwrite')
  transaction.objectStore(STORES.settings).put(next, 'settings')
  await done(transaction)
  return next
}

// --- passcode lock --------------------------------------------------------

export async function getLock(): Promise<LockRecord | null> {
  const db = await openDb()
  const stored = await promisify<LockRecord | undefined>(
    tx(db, [STORES.settings], 'readonly').objectStore(STORES.settings).get('lock'),
  )
  return stored ?? null
}

export async function saveLock(record: LockRecord | null): Promise<void> {
  const db = await openDb()
  const transaction = tx(db, [STORES.settings], 'readwrite')
  const store = transaction.objectStore(STORES.settings)
  if (record) store.put(record, 'lock')
  else store.delete('lock')
  await done(transaction)
}

// --- dismissed insights ---------------------------------------------------

/**
 * Dismissals, each remembering the sample size at the time.
 *
 * Stored under a new key rather than migrated in place: the old shape was a
 * bare array of ids, and reading it as objects would silently treat every past
 * dismissal as `n: undefined`. Anything written by the previous version is
 * simply forgotten, which costs a user one repeated card and nothing else.
 */
export async function dismissedInsights(): Promise<Dismissal[]> {
  const db = await openDb()
  const stored = await promisify<Dismissal[] | undefined>(
    tx(db, [STORES.dismissed], 'readonly').objectStore(STORES.dismissed).get('records'),
  )
  return stored ?? []
}

export async function dismissInsight(id: string, n: number): Promise<void> {
  const existing = (await dismissedInsights()).filter((record) => record.id !== id)
  const db = await openDb()
  const transaction = tx(db, [STORES.dismissed], 'readwrite')
  transaction.objectStore(STORES.dismissed).put([...existing, { id, n }], 'records')
  await done(transaction)
}

export async function clearDismissedInsights(): Promise<void> {
  const db = await openDb()
  const transaction = tx(db, [STORES.dismissed], 'readwrite')
  transaction.objectStore(STORES.dismissed).delete('records')
  await done(transaction)
}

// --- J10: wipe ------------------------------------------------------------

/**
 * Delete everything, for real.
 *
 * No soft-delete, no tombstones, no thirty-day grace period. The user asked
 * for it gone; anything less would make the privacy promise a lie with an
 * asterisk.
 */
export async function wipeEverything(): Promise<void> {
  /*
   * The database is the user's data, but the caches are also ours to clear.
   * "Delete everything" that left the app shell and an old worker installed
   * would be accurate-but-narrow in a way nobody asked for.
   */
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(registrations.map((registration) => registration.unregister()))
  } catch {
    // Never let cache cleanup block the thing the user actually asked for.
  }

  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    // Fires when another tab still holds the database open. Resolve anyway —
    // the delete completes once that tab releases it, and blocking the UI on
    // a tab the user forgot about is worse than a slightly delayed wipe.
    request.onblocked = () => resolve()
  })
}

// --- convenience ----------------------------------------------------------

export function today(): string {
  return toDateKey(new Date())
}

/** Test seam — lets suites reset the singleton between cases. */
export function __resetDbForTests(): void {
  dbPromise = null
}
