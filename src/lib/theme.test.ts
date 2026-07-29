import { describe, expect, it } from 'vitest'
import { BANNED_WORDS } from './copy'
import { isoWeek, themeForWeek, THEMES } from './theme'

describe('the weekly theme', () => {
  it('is the same for every day of one week and changes across weeks', () => {
    // 2026-07-27 (Mon) through 2026-08-02 (Sun) are one ISO week.
    expect(themeForWeek('2026-07-27')).toEqual(themeForWeek('2026-08-02'))
    expect(themeForWeek('2026-07-27')).not.toEqual(themeForWeek('2026-08-03'))
  })

  it('computes ISO weeks at the year boundary correctly', () => {
    // 2027-01-01 is a Friday, belonging to ISO week 53 of 2026.
    expect(isoWeek('2027-01-01')).toBe(53)
    expect(isoWeek('2026-01-01')).toBe(1)
  })

  it('speaks only about clothes and days', () => {
    // Whole words, as the copy suite matches: "thing" must not trip "thin".
    for (const theme of THEMES) {
      const text = `${theme.title} ${theme.prompt}`
      for (const banned of BANNED_WORDS) {
        const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const hit = new RegExp(`\\b${escaped}\\b`, 'i').test(text)
        expect(hit, `"${text}" contains banned "${banned}"`).toBe(false)
      }
    }
  })
})
