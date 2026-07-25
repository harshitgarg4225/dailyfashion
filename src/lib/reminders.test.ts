import { describe, expect, it } from 'vitest'
import { countsAsIgnored, msUntilNext } from './reminders'

describe('msUntilNext', () => {
  it('returns the gap to later today', () => {
    const now = new Date(2025, 5, 1, 18, 0, 0)
    expect(msUntilNext('20:30', now)).toBe((2 * 60 + 30) * 60_000)
  })

  it('rolls to tomorrow once the time has passed', () => {
    const now = new Date(2025, 5, 1, 21, 0, 0)
    expect(msUntilNext('20:30', now)).toBe((23 * 60 + 30) * 60_000)
  })

  it('rolls over rather than firing instantly at the exact minute', () => {
    // Scheduling zero delay would fire a duplicate notification immediately
    // for anyone opening the app at precisely their reminder time.
    const now = new Date(2025, 5, 1, 20, 30, 0)
    expect(msUntilNext('20:30', now)).toBe(24 * 60 * 60_000)
  })

  it('handles a single-digit hour', () => {
    const now = new Date(2025, 5, 1, 6, 0, 0)
    expect(msUntilNext('9:15', now)).toBe((3 * 60 + 15) * 60_000)
  })

  it('refuses a malformed or impossible time instead of guessing', () => {
    // A reminder firing at an hour the user did not choose is worse than none.
    expect(msUntilNext('')).toBeNull()
    expect(msUntilNext('half eight')).toBeNull()
    expect(msUntilNext('25:00')).toBeNull()
    expect(msUntilNext('20:70')).toBeNull()
  })
})

describe('countsAsIgnored', () => {
  const now = Date.parse('2025-06-01T22:00:00')

  it('counts a passed reminder with the entry still unrated', () => {
    expect(countsAsIgnored(Date.parse('2025-06-01T20:30:00'), true, now)).toBe(true)
  })

  it('does not count one that was answered', () => {
    expect(countsAsIgnored(Date.parse('2025-06-01T20:30:00'), false, now)).toBe(false)
  })

  it('does not count a reminder that has not fired yet', () => {
    expect(countsAsIgnored(Date.parse('2025-06-02T20:30:00'), true, now)).toBe(false)
  })

  it('does not count when nothing was ever scheduled', () => {
    expect(countsAsIgnored(null, true, now)).toBe(false)
  })
})
