/**
 * Local-calendar date helpers.
 *
 * Everything in the log is keyed by the user's local calendar day, never UTC.
 * A photo taken at 11pm belongs to that evening, not to tomorrow, and an
 * insight that said otherwise would be visibly wrong to the one person who
 * can check it.
 */

/** How far back J9 allows backdating. */
export const BACKDATE_LIMIT_DAYS = 7

export type DateKey = string // YYYY-MM-DD

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function daysBetween(a: DateKey, b: DateKey): number {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function isWeekend(key: DateKey): boolean {
  const day = parseDateKey(key).getDay()
  return day === 0 || day === 6
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

/** "Tue 14th" — the format the "same as…?" prompt uses. */
export function shortLabel(key: DateKey): string {
  const date = parseDateKey(key)
  return `${WEEKDAY_NAMES[date.getDay()]} ${ordinal(date.getDate())}`
}

/** "Tue 14 Jan" — unambiguous once the log spans months. */
export function mediumLabel(key: DateKey): string {
  const date = parseDateKey(key)
  return `${WEEKDAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`
}

/** Human phrase for a gap. Neutral by construction — no gap is a failure (J9). */
export function agoLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 31) return `${Math.round(days / 7)} weeks ago`
  if (days < 60) return 'last month'
  return `${Math.round(days / 30)} months ago`
}
