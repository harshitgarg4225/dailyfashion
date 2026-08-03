import type { Entry } from '../types'
import { addDays, type DateKey } from './dates'

/**
 * "A week ago today": the log giving something back, daily.
 *
 * The best-loved feature of every long-running journal is the moment it
 * hands you your own past — Day One's "On this day", a photo app's memories.
 * It costs no model and no waiting period: the log simply looks up what you
 * wore exactly a week ago, or a month ago, and shows it.
 *
 * A week is preferred over a month because "last Tuesday's outfit" is close
 * enough to act on — wear it again, or don't — while a month is nostalgia.
 * Both beat a grid cell you would never have scrolled to.
 */

export interface Lookback {
  entry: Entry
  span: 'week' | 'month'
}

export function lookback(entries: readonly Entry[], today: DateKey): Lookback | null {
  // Below a week of history the "past" is still the present.
  if (entries.length < 4) return null

  const weekAgo = addDays(today, -7)
  const monthAgo = addDays(today, -30)

  const onDate = (date: DateKey) => entries.find((entry) => entry.date === date)

  const week = onDate(weekAgo)
  if (week) return { entry: week, span: 'week' }

  const month = onDate(monthAgo)
  if (month) return { entry: month, span: 'month' }

  return null
}
