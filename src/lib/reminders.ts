import type { Settings } from '../types'

/**
 * The evening reminder (J2) — the half of the loop that produces every rating
 * the insight engine eats.
 *
 * Deliberately scheduled by the page rather than by push. A push reminder
 * needs a server, an endpoint, and a subscription tied to this device, which
 * is exactly the architecture J4 promises does not exist. So the trade is
 * explicit: the reminder only fires if the app has been opened that day and
 * the tab or installed PWA is still resident. That is a real limitation, it is
 * the honest cost of having no backend, and it is worth it.
 *
 * Everything here fails soft. A blocked permission, an old browser, a
 * suspended tab — none of it breaks the app, it just means no nudge.
 */

/** Consecutive unanswered reminders before the app stops asking (J9). */
export const MAX_CONSECUTIVE_IGNORES = 5

export type ReminderPermission = 'granted' | 'denied' | 'default' | 'unsupported'

export function permissionState(): ReminderPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as ReminderPermission
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission as ReminderPermission
  try {
    return (await Notification.requestPermission()) as ReminderPermission
  } catch {
    return 'denied'
  }
}

/**
 * Milliseconds from `now` until the next occurrence of "HH:MM" local time.
 *
 * Returns null for an unparseable time rather than defaulting to something,
 * because a reminder firing at an hour the user did not choose is worse than
 * no reminder at all.
 */
export function msUntilNext(time: string, now = new Date()): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)

  return target.getTime() - now.getTime()
}

export interface ReminderContext {
  settings: Settings
  /** Id of the entry waiting on a reflection, if any. */
  pendingEntryId: string | null
  title: string
  body: string
}

let timer: ReturnType<typeof setTimeout> | null = null

export function cancelReminder(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/**
 * Arms a single timer for the next reminder. Called on launch and whenever the
 * settings change, so the schedule is rebuilt from scratch each time rather
 * than accumulating stale timers.
 */
export function scheduleReminder(context: ReminderContext, now = new Date()): boolean {
  cancelReminder()

  const { settings } = context
  if (!settings.reminder_enabled) return false
  if (settings.consecutive_ignores >= MAX_CONSECUTIVE_IGNORES) return false
  if (permissionState() !== 'granted') return false

  const delay = msUntilNext(settings.reminder_time, now)
  if (delay === null) return false

  // setTimeout saturates above ~24.8 days; a reminder is always under a day
  // away, so this is a guard against a nonsense clock rather than a real case.
  if (delay > 86_400_000) return false

  timer = setTimeout(() => {
    timer = null
    void showReminder(context)
  }, delay)

  return true
}

async function showReminder(context: ReminderContext): Promise<void> {
  if (permissionState() !== 'granted') return

  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration?.active) {
      // The worker owns display, because only a worker notification can carry
      // inline actions — the two-tap lock-screen rating J2 asks for.
      registration.active.postMessage({
        type: 'show-reminder',
        title: context.title,
        body: context.body,
        entryId: context.pendingEntryId,
      })
      return
    }
  } catch {
    // Fall through to the page-level notification below.
  }

  try {
    // No worker: a plain notification still gets the user back into the app,
    // just without the inline actions.
    new Notification(context.title, { body: context.body, tag: 'evening-reflection' })
  } catch {
    // Nothing more to try; the app is unaffected.
  }
}

/**
 * Did the last armed reminder go unanswered?
 *
 * Checked on launch rather than tracked live, because the page is usually not
 * running when a notification is ignored. If a reminder was scheduled for a
 * moment now in the past and the entry it pointed at is still unrated, that
 * counts as one ignore.
 */
export function countsAsIgnored(
  lastScheduledFor: number | null,
  pendingEntryStillUnrated: boolean,
  now = Date.now(),
): boolean {
  if (lastScheduledFor === null) return false
  if (lastScheduledFor > now) return false
  return pendingEntryStillUnrated
}
