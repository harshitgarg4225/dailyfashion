import type { DateKey } from './dates'

/**
 * The community's weekly theme.
 *
 * A community whose only activity is broadcasting week cards is a feed, and
 * feeds go quiet. A shared theme turns posting into a ritual — everyone's
 * card this week answers the same small prompt — which is the difference
 * between a noticeboard and a room.
 *
 * Deterministic on the ISO week, computed locally: every copy of the app
 * shows the same theme in the same week with no network request and nobody's
 * server deciding anything. The themes rotate; the year has more weeks than
 * the list has entries, and repetition is fine — rituals repeat.
 *
 * Every prompt is about clothes and days, never about the person. The ban
 * list is asserted over these strings by test like all other copy.
 */

export interface WeeklyTheme {
  title: string
  prompt: string
}

export const THEMES: readonly WeeklyTheme[] = [
  { title: 'Repeat week', prompt: 'The outfit you reached for twice.' },
  { title: 'One colour', prompt: 'A week that leans on a single colour.' },
  { title: 'The oldest thing', prompt: 'The piece that has been with you longest.' },
  { title: 'Borrowed rules', prompt: 'A combination you copied from somebody.' },
  { title: 'Weather won', prompt: 'The day the forecast dressed you.' },
  { title: 'The comfortable one', prompt: 'What you wear when nobody needs impressing.' },
  { title: 'Out of season', prompt: 'A piece worn against its season.' },
  { title: 'Two textures', prompt: 'A week of mixing materials.' },
  { title: 'The unworn', prompt: 'Something that finally left the wardrobe.' },
  { title: 'Plain and one thing', prompt: 'A quiet outfit with a single loud detail.' },
  { title: 'The uniform', prompt: 'Your default, worn proudly.' },
  { title: 'A colour you avoid', prompt: 'One day of the colour you never pick.' },
]

/** ISO-8601 week number, so every device lands on the same theme. */
export function isoWeek(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y!, m! - 1, d!))
  // Thursday of this week decides the ISO year.
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function themeForWeek(date: DateKey): WeeklyTheme {
  return THEMES[isoWeek(date) % THEMES.length]!
}
