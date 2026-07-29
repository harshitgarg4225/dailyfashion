/**
 * Domain types for Daily Fashion.
 *
 * Two constraints shape this schema and neither is negotiable:
 *
 * 1. No body data. There is no weight, no measurement, no size, no
 *    body-part field anywhere in here, and there never will be (J8).
 *    Everything recorded is about the clothes and the feeling.
 *
 * 2. No cataloging burden. `Item` exists but is only ever populated as a
 *    side effect of optional one-word tagging during logging (J3). Nothing
 *    in the app asks the user to enumerate a wardrobe.
 */

/** How the day felt. Not a rating of the user, and never displayed as a score. */
export type FeltScore = 1 | 2 | 3 | 4 | 5

/**
 * The second of the two evening questions: "did anything happen?"
 *
 * These are events, not adjectives. Valence is what lets the insight engine
 * argue with receipts ("your worst days correlate with these") rather than
 * just averaging a number.
 */
export type ChipId =
  | 'complimented'
  | 'felt_like_myself'
  | 'forgot_wearing_it'
  | 'wanted_to_change'
  | 'uncomfortable'
  | 'overdressed'
  | 'underdressed'
  | 'right_for_the_day'

export type ChipValence = 'up' | 'down' | 'neutral'

export interface ChipDef {
  id: ChipId
  label: string
  valence: ChipValence
}

/** Coarse temperature, tapped manually. Keeps the airplane-mode promise (J4). */
export type TempBand = 'cold' | 'mild' | 'hot'

/**
 * Passive context, captured at log time with zero user effort except the
 * optional temp tap. This is what makes J7's insights honest instead of
 * spurious — it lets the engine suppress a claim when context confounds it.
 */
export interface EntryContext {
  /** 0 = Sunday .. 6 = Saturday, in the user's local time. */
  weekday: number
  is_weekend: boolean
  /** Null when the user skipped the tap. Insights degrade gracefully. */
  temp_band: TempBand | null
  /** Local hour the photo was taken, 0-23. */
  logged_hour: number
}

/**
 * Broad color families, derived from the photo automatically. This is the
 * one piece of garment knowledge the app gets for free — the histogram is
 * already computed for similarity matching (J3), so naming the dominant
 * family costs nothing and unlocks color insights with zero cataloging.
 */
export type ColorFamily =
  | 'black'
  | 'grey'
  | 'white'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'

/** Everything needed to say "have you worn this before?" without a database of garments. */
export interface ImageSignature {
  /**
   * Fingerprint format. Absent on entries written before subject detection.
   *
   * Signatures of different versions describe different things and are never
   * compared — see `similarity`.
   */
  v?: number
  /** 64-bit difference hash over the subject's box, as 16 hex chars. Structure. */
  dhash: string
  /** HSV histogram over the whole subject, normalized to sum 1. Palette. */
  hist: number[]
  /**
   * Histograms for the subject's top, middle and lower thirds.
   *
   * Keeps the outfit's vertical composition, which a single histogram throws
   * away — it is what distinguishes a navy top over grey trousers from the
   * reverse. Absent on signatures written before this existed.
   */
  bands?: number[][]
  /** Dominant color family of the outfit region. */
  color: ColorFamily
}

export interface Entry {
  id: string
  /** Local calendar date, YYYY-MM-DD. One entry per day is the norm, not a rule. */
  date: string
  /**
   * Key into the photos object store, or null for a written day.
   *
   * Not every day gets photographed. Someone in a hurry, in a changing room, or
   * simply not in the mood to look at themselves still has something to record,
   * and a log that only accepts photographs quietly excludes exactly the days
   * that are hardest — which are the days most worth having.
   *
   * A written day carries no image signature, so it cannot join an outfit
   * cluster or vote on colour. It still counts fully toward how days felt.
   */
  photo_id: string | null
  /** Null until the evening reflection. Skipping is always allowed (J2). */
  felt_score: FeltScore | null
  chips: ChipId[]
  outfit_id: string | null
  context: EntryContext
  /** Free text. The whole entry for a written day, optional on a photographed one. */
  note: string | null
  signature: ImageSignature | null
  created_at: number
  /** When the evening reflection was completed. Null = still unrated. */
  rated_at: number | null
  /** True when logged for a past date (J9 allows backdating up to 7 days). */
  backdated: boolean
  /**
   * The day's garment, named.
   *
   * Three states, and the difference matters: `undefined` means naming has
   * never been attempted (the backfill will try), `null` means it was tried
   * and nothing cleared the confidence floor (the backfill must not retry
   * forever), and a value is a name — the model's suggestion, or the user's
   * own word, which permanently outranks it.
   */
  garment?: EntryGarment | null
  /**
   * Unit-normalised vision-model embedding of the photograph, or null when
   * the model could not produce one. Same three-state convention as
   * `garment`. Stored as plain numbers (rounded) so it survives the JSON
   * export round-trip; ~6KB per entry, which a year of days carries easily.
   *
   * Used as a second matching signal beside the signature: the hash sees
   * structure and palette, the embedding sees *content*, and fusing them is
   * what lets "same as Tuesday?" survive a different mirror, a different
   * room, or a step closer to the glass.
   */
  embedding?: number[] | null
}

export interface EntryGarment {
  name: string
  source: 'model' | 'user'
  /** Model confidence at naming time; null when the user typed the name. */
  confidence: number | null
}

/**
 * A cluster of entries the user confirmed are the same outfit.
 *
 * The aggregate fields are denormalized for cheap reads but are always
 * recomputed from the entries in the same transaction that mutates them,
 * so they cannot drift.
 */
export interface Outfit {
  id: string
  first_seen: string
  wear_count: number
  /** Mean felt score across *rated* wears only. Null if none are rated. */
  avg_felt: number | null
  last_worn: string
  /**
   * What the outfit cost, in the user's own currency, entered by them and
   * never required. Cost per wear = cost / wear_count — the one fashion
   * metric everybody already understands, and the number that goes *down*
   * every time they show up, the way a gym number goes up.
   */
  cost?: number | null
}

/** Populated only by lazy one-word chip tagging. Never by a cataloging flow. */
export interface Item {
  id: string
  label: string
  created_at: number
}

export interface EntryItem {
  entry_id: string
  item_id: string
}

export interface Settings {
  /** Local time "HH:MM" for the evening reflection nudge. */
  reminder_time: string
  reminder_enabled: boolean
  /** Auto-mutes after 5 consecutive ignores, then offers re-opt-in (J9). */
  consecutive_ignores: number
  blur_thumbnails: boolean
  passcode_lock: boolean
  /** Set when the user has seen and dismissed onboarding. */
  onboarded: boolean
  /** Remembered camera facing, so J1 is one tap for everyone. */
  camera_facing: 'user' | 'environment'
  /**
   * Set when felt-scores have trended low for 7+ days and the app has
   * offered to soften (J8). Suppresses insight cards until cleared.
   */
  softened_at: number | null
  /**
   * When the last reminder was armed for. Checked on the next launch to work
   * out whether it went unanswered, since the page is rarely running at the
   * moment a notification is ignored.
   */
  last_reminder_for: number | null
  /** Whether the on-device model may suggest garment names. Always editable, never uploaded. */
  garment_naming: boolean
  /** When the last export finished. Drives the quiet back-up nudge. */
  last_export_at: number | null
  /**
   * Whether the app may report anonymous usage counts to us. Off by
   * default and off until the user flips it themselves; see telemetry.ts
   * for the exact — and deliberately short — list of what can be sent.
   */
  share_usage: boolean
  /** Pseudonymous id minted at first consent. Null until then. */
  client_id: string | null
}
