/**
 * Storage durability.
 *
 * This is the quiet existential risk in a local-only product. IndexedDB is
 * "best effort" by default, which means the browser may evict the whole
 * database under storage pressure — silently, with no prompt and no way to
 * recover. For an app whose entire premise is that it becomes more valuable
 * the longer you use it, losing a year of history to a cache sweep is not a
 * bug, it is the end of the relationship.
 *
 * `navigator.storage.persist()` moves the origin to durable storage, after
 * which eviction requires an explicit user action. On Chrome and Firefox an
 * installed or frequently-used app is usually granted it without a prompt.
 * Safari does not offer it at all and applies a seven-day eviction window to
 * sites that are not installed to the home screen — which is why the install
 * prompt is a data-safety feature on iOS, not a growth tactic.
 */

export type PersistenceState = 'persisted' | 'best-effort' | 'unsupported'

export async function currentPersistence(): Promise<PersistenceState> {
  if (!navigator.storage?.persisted) return 'unsupported'
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

/**
 * Asks the browser to keep this data. Safe to call repeatedly — it resolves
 * immediately if already granted.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  if (!navigator.storage?.persist) return 'unsupported'
  try {
    if (await navigator.storage.persisted()) return 'persisted'
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

export interface StorageUsage {
  usedBytes: number
  quotaBytes: number | null
  /** 0-1, or null when the browser will not say. */
  fraction: number | null
}

export async function storageUsage(): Promise<StorageUsage | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const estimate = await navigator.storage.estimate()
    const used = estimate.usage ?? 0
    const quota = estimate.quota ?? null
    return {
      usedBytes: used,
      quotaBytes: quota,
      fraction: quota && quota > 0 ? used / quota : null,
    }
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * Whether this is running as an installed app rather than a browser tab.
 *
 * Drives the install nudge: on iOS in particular, a home-screen install is the
 * difference between durable storage and a seven-day eviction clock.
 */
export function isInstalled(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari predates the display-mode media query for this.
  return (window.navigator as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ reports as a Mac; the touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}
