import { LocalNotifications } from '@capacitor/local-notifications'
import type { Settings } from '../types'
import { isNative } from './platform'

/**
 * The evening reminder, handed to the operating system.
 *
 * This is the single biggest functional gain from packaging. On the web the
 * nudge is a `setTimeout` inside a page: it only fires if the app was opened
 * that day and the tab is still alive, which means the reminder fails exactly
 * for the person who most needs it — the one who forgot. Scheduled natively it
 * arrives regardless, carries actions so a rating is two taps from the lock
 * screen, and survives a reboot.
 *
 * Still no server involved. `LocalNotifications` schedules on the device; there
 * is no push endpoint, no token, and nothing registered anywhere. The privacy
 * promise is unchanged.
 */

/** Fixed id so re-arming replaces rather than stacks duplicates. */
const REMINDER_ID = 1

const ACTION_TYPE = 'EVENING_REFLECTION'

/**
 * The three answers offered on the notification.
 *
 * Deliberately not all five. A lock-screen list of five options is a menu, and
 * the point of answering from the lock screen is that it takes no thought — the
 * ends and the middle are enough, and anyone who wants precision opens the app.
 */
export const NOTIFICATION_ACTIONS = [
  { id: 'felt-5', title: 'Really good' },
  { id: 'felt-3', title: 'Fine' },
  { id: 'felt-1', title: 'Not great' },
] as const

let actionsRegistered = false

async function ensureActionTypes(): Promise<void> {
  if (actionsRegistered) return
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE,
        actions: NOTIFICATION_ACTIONS.map((action) => ({
          id: action.id,
          title: action.title,
          // Answering should not drag the app open — the whole value is that
          // it does not interrupt.
          foreground: false,
        })),
      },
    ],
  })
  actionsRegistered = true
}

export async function requestNativePermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const current = await LocalNotifications.checkPermissions()
    if (current.display === 'granted') return true
    const asked = await LocalNotifications.requestPermissions()
    return asked.display === 'granted'
  } catch {
    return false
  }
}

export interface NativeReminderContent {
  title: string
  body: string
}

/**
 * Arms a repeating daily reminder at the chosen time.
 *
 * Cancels first so changing the time never leaves the old one behind — the
 * failure mode there is two notifications a day, which reads as the app being
 * broken and is the fastest route to reminders being switched off entirely.
 */
export async function scheduleNativeReminder(
  settings: Settings,
  content: NativeReminderContent,
): Promise<boolean> {
  if (!isNative()) return false

  try {
    await cancelNativeReminder()

    if (!settings.reminder_enabled) return false
    if (!(await requestNativePermission())) return false

    const match = /^(\d{1,2}):(\d{2})$/.exec(settings.reminder_time.trim())
    if (!match) return false
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour > 23 || minute > 59) return false

    await ensureActionTypes()

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: content.title,
          body: content.body,
          actionTypeId: ACTION_TYPE,
          // `on` with no date component repeats daily at that clock time, and
          // keeps working across reboots without the app re-arming it.
          schedule: { on: { hour, minute }, allowWhileIdle: true },
        },
      ],
    })

    return true
  } catch {
    // A refused permission or an unsupported device must never break the app.
    return false
  }
}

export async function cancelNativeReminder(): Promise<void> {
  if (!isNative()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] })
  } catch {
    // Nothing scheduled, which is the state we wanted anyway.
  }
}

/**
 * Wires up taps on the notification.
 *
 * An inline action carries the rating straight through; a plain tap opens the
 * app on tonight's question. Returns a cleanup function.
 */
export function onReminderAction(
  handler: (rating: number | null) => void,
): () => void {
  if (!isNative()) return () => undefined

  const registration = LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (event) => {
      const id = event.actionId
      const rating = id?.startsWith('felt-') ? Number(id.slice('felt-'.length)) : null
      handler(Number.isFinite(rating) ? rating : null)
    },
  )

  return () => {
    void registration.then((listener) => listener.remove())
  }
}
