import { defineConfig, devices } from '@playwright/test'

/**
 * Runs the suite against the production build served by server.js — the same
 * artifact Railway runs — rather than the dev server, so the CSP headers and
 * caching behaviour under test are the real ones.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  timeout: 45_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    // A phone-shaped viewport, since every screen is designed for one hand.
    ...devices['Pixel 7'],
    // Grant the camera up front and feed it a synthetic stream, so the capture
    // path is exercised for real instead of falling back to the file picker.
    permissions: ['camera'],
    launchOptions: {
      // Use whatever Chromium the environment already provides when it is set,
      // rather than downloading a matching build. CI images commonly ship a
      // browser that is close enough and a download that is not allowed.
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },

  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
