import type { EntryContext, TempBand } from '../types'
import { isWeekend, parseDateKey, type DateKey } from './dates'

/**
 * Passive context capture.
 *
 * Everything here is free — derived from the clock and the calendar date, with
 * no permission prompt and no network call. That is the entire point: context
 * is what stops J7 from saying "you hate this shirt" when the truth is "you
 * hate being too warm", and it only earns that job if collecting it costs the
 * user nothing.
 *
 * Weather is the one signal that would need the network, so the app does not
 * fetch it. The user taps cold/mild/hot, or skips, and the insight engine
 * degrades gracefully when the field is null. Coarser data with an intact
 * airplane-mode promise beats precise data that breaks it (J4).
 */

export function captureContext(date: DateKey, tempBand: TempBand | null, now = new Date()): EntryContext {
  const day = parseDateKey(date)
  return {
    weekday: day.getDay(),
    is_weekend: isWeekend(date),
    temp_band: tempBand,
    logged_hour: now.getHours(),
  }
}

/**
 * J1's launch routing: the app opens into the camera in the morning and into
 * the evening reflection at night.
 *
 * The windows are wide and the fallback is always the log, because being
 * dropped into the wrong screen is a small annoyance while being dropped into
 * the right one saves the two taps that decide whether this habit survives.
 */
export type LaunchIntent = 'camera' | 'tonight' | 'log'

export const MORNING_START_HOUR = 5
export const MORNING_END_HOUR = 12
export const EVENING_START_HOUR = 17

export interface LaunchState {
  hasEntryToday: boolean
  hasUnrated: boolean
  onboarded: boolean
}

export function launchIntent(state: LaunchState, now = new Date()): LaunchIntent {
  if (!state.onboarded) return 'log'

  const hour = now.getHours()

  // Morning, nothing logged yet — the case J1 exists for.
  if (hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR && !state.hasEntryToday) {
    return 'camera'
  }

  // Evening, something is waiting for a reflection.
  if (hour >= EVENING_START_HOUR && state.hasUnrated) return 'tonight'

  // Late-night stragglers who never got a photo up.
  if (hour >= EVENING_START_HOUR && !state.hasEntryToday) return 'camera'

  return 'log'
}

export const TEMP_BANDS: readonly { id: TempBand; label: string }[] = [
  { id: 'cold', label: 'Cold' },
  { id: 'mild', label: 'Mild' },
  { id: 'hot', label: 'Warm' },
]
