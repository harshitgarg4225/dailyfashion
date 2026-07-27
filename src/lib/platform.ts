import { Capacitor } from '@capacitor/core'

/**
 * The seam between the web build and the packaged apps.
 *
 * Everything native is reached through this module, and every call has a web
 * fallback that already worked. The rule is that no screen may import a
 * Capacitor plugin directly — otherwise the browser build starts depending on
 * a shell that is not there, and the version anyone can open from a URL quietly
 * degrades. The web app stays a first-class target, because it is how someone
 * tries this before they install anything.
 */

export type Platform = 'web' | 'ios' | 'android'

export function platform(): Platform {
  const name = Capacitor.getPlatform()
  return name === 'ios' || name === 'android' ? name : 'web'
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Whether the evening reminder can be scheduled with the operating system.
 *
 * This is the difference that matters between the web and packaged builds. On
 * the web the nudge is a page timer and only fires if the app was opened that
 * day; natively it is handed to the OS and arrives regardless. The distinction
 * is surfaced in Settings rather than hidden, because a reminder someone
 * believes in and does not receive is worse than no reminder.
 */
export function hasSystemScheduledReminders(): boolean {
  return isNative()
}

/**
 * Whether a rating can be given from the notification itself.
 *
 * Android supports notification actions; iOS supports them natively too, which
 * is the one place the packaged app beats the web build on iOS specifically —
 * Safari ignores them entirely.
 */
export function hasInlineNotificationActions(): boolean {
  return isNative()
}

/**
 * Whether stored data is safe from cache eviction.
 *
 * A packaged app's WebView storage is not subject to the browser's storage
 * pressure sweeps, so the log cannot be cleared to free space. On the web this
 * remains a real risk, mitigated but not eliminated by `storage.persist()`.
 */
export function hasDurableStorage(): boolean {
  return isNative()
}
