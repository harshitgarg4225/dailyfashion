import { describe, expect, it } from 'vitest'
import { lookback } from './lookback'
import { makeEntry, resetFactory } from '../test/factory'
import type { Entry } from '../types'

const on = (date: string): Entry => makeEntry({ date })

describe('the lookback', () => {
  it('prefers exactly a week ago over exactly a month ago', () => {
    resetFactory()
    const entries = [on('2026-07-01'), on('2026-07-25'), on('2026-07-30'), on('2026-07-02')]
    const found = lookback(entries, '2026-08-01')
    expect(found?.span).toBe('week')
    expect(found?.entry.date).toBe('2026-07-25')
  })

  it('falls back to a month ago when the week is blank', () => {
    resetFactory()
    const entries = [on('2026-07-02'), on('2026-07-10'), on('2026-07-11'), on('2026-07-12')]
    const found = lookback(entries, '2026-08-01')
    expect(found?.span).toBe('month')
    expect(found?.entry.date).toBe('2026-07-02')
  })

  it('stays silent on a young log, and on days with no echo', () => {
    resetFactory()
    expect(lookback([on('2026-07-25')], '2026-08-01')).toBeNull()
    const entries = [on('2026-07-20'), on('2026-07-21'), on('2026-07-22'), on('2026-07-23')]
    expect(lookback(entries, '2026-08-01')).toBeNull()
  })
})
