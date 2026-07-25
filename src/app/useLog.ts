import { useCallback, useEffect, useState } from 'react'
import type { Entry, EntryItem, Item, Outfit, Settings } from '../types'
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
  dismissed: string[]
}

export interface Log extends LogState {
  refresh: () => Promise<void>
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}
