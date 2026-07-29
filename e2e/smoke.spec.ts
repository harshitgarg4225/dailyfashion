import { test, expect, type Page } from '@playwright/test'

/**
 * End-to-end proof of the two claims the product rests on.
 *
 * The first is the loop: photo in the morning, reflection in the evening, both
 * fast. If that does not work in a real browser then nothing downstream of it
 * matters, because the insight engine starves.
 *
 * The second is J4. This suite fails the build if the app makes a single
 * request to anywhere that is not its own origin, or a single request of any
 * kind that could carry data out. That is the difference between a privacy
 * promise and a privacy property — and it is the reason someone might feel
 * safe photographing themselves in a mirror.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** Records every request the page attempts, so we can assert on them later. */
async function watchRequests(page: Page): Promise<string[]> {
  const external: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return
    external.push(url)
  })
  return external
}

/**
 * Records every request of a method that can carry a body, same-origin
 * included.
 *
 * `connect-src 'self'` permits the page to talk to its own origin, so
 * "no cross-origin request" stopped being the whole story. What matters now is
 * that nothing is ever *sent* anywhere: a GET names a file, a POST carries
 * data. If this list is empty then no user data left the device regardless of
 * where the request was pointed.
 */
async function watchUploads(page: Page): Promise<string[]> {
  const uploads: string[] = []
  page.on('request', (request) => {
    const method = request.method()
    if (method === 'GET' || method === 'HEAD') return
    uploads.push(`${method} ${request.url()}`)
  })
  return uploads
}

/**
 * Leaves whatever transient surface is on top — the camera, or one of the
 * optional post-capture sheets — and returns to the navigable app.
 */
async function dismissOverlays(page: Page) {
  // Wait for the app to actually leave the camera before hunting for overlays;
  // the capture is asynchronous and the sheets appear after the write lands.
  await page.locator('.tabs').waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined)

  // The single post-capture sheet.
  const followUp = page.getByRole('dialog', { name: /anything to add/i })
  if (await followUp.isVisible().catch(() => false)) {
    await followUp.getByRole('button', { name: 'Done', exact: true }).click()
  }

  const skip = page.getByRole('button', { name: 'Skip tonight', exact: true })
  if (await skip.isVisible().catch(() => false)) await skip.click()

  const close = page.getByRole('button', { name: 'Close', exact: true })
  if (await close.isVisible().catch(() => false)) await close.click()
}

async function completeOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: /nothing leaves this phone/i })).toBeVisible()
  // Each step's button names where it goes, rather than three identical "Next"s.
  await page.getByRole('button', { name: /how it works/i }).click()
  await page.getByRole('button', { name: /one last thing/i }).click()
  // Decline the camera-roll backfill; the app must work from zero.
  await page.getByRole('button', { name: /skip for now/i }).click()
}

test.describe('the daily loop', () => {
  test('onboards, captures a photo, and rates it', async ({ page }) => {
    const external = await watchRequests(page)

    await page.goto(BASE)
    await completeOnboarding(page)

    // J1: the app lands on the camera, so the shutter is the next tap.
    const shutter = page.getByRole('button', { name: 'Capture' })
    await expect(shutter).toBeEnabled({ timeout: 15_000 })
    await shutter.click()

    // The optional context tap appears after the entry is already saved.
    // Everything after the shutter now lives on one sheet, and every control
    // on it is optional (U1).
    const followUp = page.getByRole('dialog', { name: /anything to add/i })
    await expect(followUp).toBeVisible({ timeout: 10_000 })
    await followUp.getByRole('button', { name: 'Mild', exact: true }).click()
    await followUp.getByRole('button', { name: 'Done', exact: true }).click()

    // The entry exists in the log.
    await dismissOverlays(page)
    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(page.getByText(/1 day logged/)).toBeVisible()

    // J2: open the entry and complete the evening reflection.
    await page.locator('.grid-cell').first().click()
    await expect(page.getByRole('heading', { name: 'Tonight' })).toBeVisible()

    await page.getByRole('button', { name: 'Good', exact: true }).click()
    await page.getByRole('button', { name: /someone said something nice/i }).click()
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByText(/1 day logged/)).toBeVisible()
    // A rated entry shows its felt marker; an unrated one shows the dot.
    await expect(page.locator('.grid-cell .felt-badge')).toHaveText('4')

    expect(external, `unexpected outbound requests: ${external.join(', ')}`).toEqual([])
  })

  test('gates the insight engine on thin data', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Patterns', exact: true }).click()

    // J7: nothing is claimed, and the honest count is shown.
    await expect(page.getByText(/observations start once there is enough/i)).toBeVisible()
    await expect(page.getByText(/of 14 evenings answered/i)).toBeVisible()
  })

  test('hides the shortlist until the log can fill it', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    // J6 says hide the tab before ~10 entries.
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveCount(0)
  })
})

test.describe('editing the log', () => {
  test('backdates a day and removes it again', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await page.getByRole('button', { name: /add a past day/i }).click()

    // J9 allows the past week, offered as plain dates rather than a calendar.
    const picker = page.getByRole('dialog', { name: /which day/i })
    await expect(picker).toBeVisible()
    await picker.getByRole('button').first().click()

    const shutter = page.getByRole('button', { name: 'Capture' })
    await expect(shutter).toBeEnabled({ timeout: 15_000 })
    await shutter.click()
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(page.getByText(/1 day logged/)).toBeVisible()

    // F10: one bad photo must be removable without wiping everything.
    await page.locator('.grid-cell').first().click()
    await page.getByRole('button', { name: /remove this day/i }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(page.getByText(/your log starts with your first photo/i)).toBeVisible()
  })
})

test.describe('writing a day', () => {
  test('records a day in words, with no photograph', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await page.getByRole('button', { name: /write instead/i }).click()

    await page.locator('textarea').fill('Grey coat again. Warmer than it looked.')
    await page.getByRole('button', { name: 'Good', exact: true }).click()
    await page.getByRole('button', { name: /save this day/i }).click()

    await expect(page.getByText(/1 day logged/)).toBeVisible()
    // A written day gets the same footprint as a photographed one.
    await expect(page.locator('.grid-cell--written')).toHaveCount(1)
    await expect(page.getByText(/warmer than it looked/i)).toBeVisible()
  })

  test('shows what the log is building toward', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    // Available from day one — it answers "what is this for?", which is the
    // question only a new user still has.
    await expect(page.getByRole('heading', { name: /what you have built/i })).toBeVisible()
  })
})

test.describe('the sponsor slot', () => {
  test('renders nothing at all while the slot is unsold', async ({ page }) => {
    await page.goto(BASE)
    await completeOnboarding(page)
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await expect(page.locator('.sponsor')).toHaveCount(0)

    await page.getByRole('button', { name: 'Progress', exact: true }).click()
    await expect(page.locator('.sponsor')).toHaveCount(0)
  })
})

test.describe('privacy is a property, not a promise', () => {
  test('makes no cross-origin request, and uploads nothing, during a full session', async ({
    page,
  }) => {
    const external = await watchRequests(page)
    const uploads = await watchUploads(page)

    await page.goto(BASE)
    await completeOnboarding(page)

    const shutter = page.getByRole('button', { name: 'Capture' })
    await expect(shutter).toBeEnabled({ timeout: 15_000 })
    await shutter.click()
    await dismissOverlays(page)

    await page.getByRole('button', { name: 'Journal', exact: true }).click()
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Patterns', exact: true }).click()

    expect(external, `unexpected outbound requests: ${external.join(', ')}`).toEqual([])
    // Same-origin is now permitted, so "went nowhere else" is no longer
    // sufficient on its own. Nothing may be sent at all.
    expect(uploads, `unexpected outbound data: ${uploads.join(', ')}`).toEqual([])
  })

  test('serves a policy that permits this origin and nothing beyond it', async ({ request }) => {
    const response = await request.get(BASE)
    const csp = response.headers()['content-security-policy'] ?? ''

    // 'self' rather than 'none' so the vision model can be fetched from our own
    // origin. Every other destination stays unreachable.
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("form-action 'none'")

    /*
     * The failure this guards against is someone widening the directive later
     * to reach an API or a model CDN. Any host, scheme or wildcard source
     * added to connect-src ends the guarantee, so the allowed set is asserted
     * exactly rather than by substring.
     */
    const connect = csp.split(';').find((part) => part.trim().startsWith('connect-src'))
    expect(connect?.trim()).toBe("connect-src 'self'")
  })

  test('blocks a cross-origin fetch at the browser level', async ({ page }) => {
    await page.goto(BASE)

    // Proves the CSP is enforced rather than merely declared. This is the test
    // that would catch a relaxation from 'self' to something wider.
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/collect', { method: 'POST', body: 'x' })
        return false
      } catch {
        return true
      }
    })

    expect(blocked).toBe(true)
  })

  test('offers no route that accepts data, on any path', async ({ request }) => {
    /*
     * The other half of the guarantee. Same-origin requests are allowed by the
     * CSP, so the reason nothing can be uploaded is that this origin refuses
     * to receive it — including on paths that do not exist, since the
     * single-page fallback would otherwise answer them with the shell.
     */
    const paths = ['/', '/healthz', '/collect', '/api/events', '/index.html']
    const methods = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

    for (const path of paths) {
      for (const method of methods) {
        const response = await request.fetch(`${BASE}${path}`, {
          method,
          data: 'photo=leaked',
          failOnStatusCode: false,
        })
        expect(response.status(), `${method} ${path} was not refused`).toBe(405)
        expect(response.headers()['allow']).toBe('GET, HEAD')
      }
    }
  })
})

test.describe('the download page', () => {
  test('is served as itself rather than as the app shell', async ({ page }) => {
    // The single-page fallback in server.js hands unknown paths the app shell.
    // /download is a real file and must win that race, or a shared link drops
    // the visitor into onboarding instead of onto the page describing what
    // they are about to install.
    await page.goto(`${BASE}/download`)

    await expect(page.getByRole('heading', { name: /you already know what works/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /download for android/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /open it in your browser/i })).toBeVisible()
  })

  test('loads nothing from anywhere but this origin', async ({ page }) => {
    const external = await watchRequests(page)
    await page.goto(`${BASE}/download`)
    // The page claims the app cannot phone home. It has to be able to stand
    // behind that itself.
    expect(external, `unexpected outbound requests: ${external.join(', ')}`).toEqual([])
  })

  test('leads back into the app', async ({ page }) => {
    await page.goto(`${BASE}/download`)
    await page.getByRole('link', { name: /open it in your browser/i }).click()
    await expect(page.getByRole('heading', { name: /nothing leaves this phone/i })).toBeVisible()
  })
})

test.describe('the week', () => {
  test('renders a share card and hands it over without a network request', async ({ page }) => {
    const external = await watchRequests(page)

    await page.goto(BASE)
    await completeOnboarding(page)

    // Three days, so the recap clears its own threshold.
    for (let day = 0; day < 3; day++) {
      if (day > 0) {
        await page.getByRole('button', { name: 'Journal', exact: true }).click()
        await page.getByRole('button', { name: /add a past day/i }).click()
        const picker = page.getByRole('dialog', { name: /which day/i })
        await picker.waitFor({ state: 'visible' })
        await picker.getByRole('button').nth(day - 1).click()
      }

      const shutter = page.getByRole('button', { name: 'Capture' })
      await expect(shutter).toBeEnabled({ timeout: 20_000 })
      await shutter.click()

      const followUp = page.getByRole('dialog', { name: /anything to add/i })
      await followUp.waitFor({ state: 'visible', timeout: 20_000 })
      await followUp.getByRole('button', { name: 'Done', exact: true }).click()
      await followUp.waitFor({ state: 'detached', timeout: 10_000 })
    }

    await page.getByRole('button', { name: 'Week', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your week', level: 1 })).toBeVisible()

    /*
     * The card is drawn to a canvas and encoded on-device. Headless Chromium
     * has no share sheet, so `shareImage` falls back to saving — which is the
     * path this asserts, since a download proves the bytes were produced.
     */
    const download = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: /make the image/i }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(/^daily-fashion-\d{4}-\d{2}-\d{2}\.jpg$/)

    // The whole point of sharing this way: the image is made here, and nothing
    // about it leaves except by the user's own hand.
    expect(external, `unexpected outbound requests: ${external.join(', ')}`).toEqual([])

    /*
     * The community links: anchors, not fetches. They must point at the one
     * community and open in a new tab — and their mere presence on the page
     * must not have produced a request, which the assertion above already
     * proved.
     */
    const communityLink = page.getByRole('link', { name: /post it in the community/i })
    await expect(communityLink).toBeVisible()
    await expect(communityLink).toHaveAttribute('href', /reddit\.com\/r\/DailyFashionLog/)
    await expect(communityLink).toHaveAttribute('target', '_blank')
  })
})
