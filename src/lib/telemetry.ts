import { getSettings, newId, saveSettings } from '../db/db'

/**
 * Usage analytics — off until the user turns it on, and narrow forever.
 *
 * What this file is allowed to send, in its entirety: an event name from a
 * short list ("a photo was taken today"), a random client id minted at
 * consent time, and an optional profile the user typed into a form on the
 * Settings screen. What it can never send is the log itself — there is no
 * code path here that touches photos, notes, felt scores or dates, and the
 * server drops any event name it does not recognise.
 *
 * Consent is checked at every call, not cached at startup, so flipping the
 * switch off stops the very next event. With the switch off this whole
 * module is a no-op, which is what keeps the onboarding claim true for
 * everyone who never opts in.
 *
 * Failures are silent everywhere: offline, native builds (whose origin has
 * no API), an unprovisioned database — none of it may ever cost the user a
 * capture.
 */

export type UsageEvent =
  | 'app_open'
  | 'capture'
  | 'reflection'
  | 'share_card'
  | 'export'
  | 'ads_view'
  | 'workout'

export interface UsageProfile {
  age_band: string | null
  gender: string | null
  location: string | null
  profession: string | null
}

export const AGE_BANDS = [
  { id: 'under_18', label: 'Under 18' },
  { id: '18_24', label: '18–24' },
  { id: '25_34', label: '25–34' },
  { id: '35_44', label: '35–44' },
  { id: '45_54', label: '45–54' },
  { id: '55_plus', label: '55+' },
] as const

/** Turns sharing on, minting the pseudonymous id on first consent. */
export async function enableSharing(): Promise<void> {
  const settings = await getSettings()
  await saveSettings({
    share_usage: true,
    client_id: settings.client_id ?? newId('c'),
  })
}

export async function disableSharing(): Promise<void> {
  await saveSettings({ share_usage: false })
}

function post(path: string, payload: unknown): void {
  const body = JSON.stringify(payload)
  try {
    if (navigator.sendBeacon?.(path, new Blob([body], { type: 'application/json' }))) return
  } catch {
    // Fall through to fetch.
  }
  void fetch(path, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => undefined)
}

/** Reports one event, if and only if the user has opted in. Never throws. */
export async function track(event: UsageEvent): Promise<void> {
  try {
    const settings = await getSettings()
    if (!settings.share_usage || !settings.client_id) return
    post('/api/events', { client_id: settings.client_id, event, props: {} })
  } catch {
    // Analytics must never cost the user anything.
  }
}

/** Sends the self-reported profile. Consent-gated like everything here. */
export async function sendProfile(profile: UsageProfile): Promise<boolean> {
  try {
    const settings = await getSettings()
    if (!settings.share_usage || !settings.client_id) return false
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: settings.client_id, ...profile }),
    })
    return response.ok
  } catch {
    return false
  }
}
