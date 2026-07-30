import { useCallback, useEffect, useState } from 'react'
import type { Entry, EntryItem, Item, Outfit, Settings } from '../types'
import type { Dismissal } from '../lib/insights'
import {
  allEntries,
  allEntryItems,
  allItems,
  allOutfits,
  dismissedInsights,
  getSettings,
} from '../db/db'

/**
 * The whole log, in memory.
 *
 * At MVP scale this is a few hundred rows of small JSON — photos live in a
 * separate store and are loaded per-thumbnail — so paging or a query layer
 * would be complexity bought for a problem nobody has. If someone reaches ten
 * thousand entries this becomes a real decision; until then, a single read and
 * plain array operations keep every screen trivially correct.
 */
export interface LogState {
  loading: boolean
  entries: Entry[]
  outfits: Outfit[]
  items: Item[]
  entryItems: EntryItem[]
  settings: Settings
  dismissed: Dismissal[]
}

export interface Log extends LogState {
  refresh: () => Promise<void>
  /**
   * Swaps one entry in place without touching the database.
   *
   * The hot paths — tapping a felt score, setting a temperature — used to
   * trigger a full reload of every entry, item, link and setting. That is an
   * O(n) round trip for a one-field change, and by a few hundred entries it is
   * felt as lag on the single most frequent interaction in the app. Structural
   * changes (linking, deleting, importing) still go through `refresh`.
   */
  patchEntry: (entry: Entry) => void
}

const EMPTY: LogState = {
  loading: true,
  entries: [],
  outfits: [],
  items: [],
  entryItems: [],
  settings: {
    reminder_time: '20:30',
    reminder_enabled: false,
    consecutive_ignores: 0,
    blur_thumbnails: false,
    passcode_lock: false,
    onboarded: false,
    camera_facing: 'user',
    softened_at: null,
    garment_naming: true,
    last_export_at: null,
    share_usage: false,
    client_id: null,
    last_style_sent: null,
    last_reminder_for: null,
  },
  dismissed: [],
}

export function useLog(): Log {
  const [state, setState] = useState<LogState>(EMPTY)

  const refresh = useCallback(async () => {
    const [entries, outfits, items, entryItems, settings, dismissed] = await Promise.all([
      allEntries(),
      allOutfits(),
      allItems(),
      allEntryItems(),
      getSettings(),
      dismissedInsights(),
    ])
    setState({ loading: false, entries, outfits, items, entryItems, settings, dismissed })
  }, [])

  const patchEntry = useCallback((entry: Entry) => {
    setState((current) => ({
      ...current,
      entries: current.entries.map((existing) => (existing.id === entry.id ? entry : existing)),
    }))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh, patchEntry }
}
