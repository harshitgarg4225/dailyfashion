import { defineConfig } from 'vitest/config'

/**
 * Kept separate from vite.config.ts on purpose: the two packages resolve
 * different copies of Vite's Plugin type, and merging them makes the build
 * config fail to typecheck. The suites here exercise the logic layer, which
 * needs no plugins.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // The Playwright suite has its own runner; vitest's default glob would
    // otherwise try to execute it and fail on the missing test context.
    include: ['src/**/*.test.ts'],
  },
})
