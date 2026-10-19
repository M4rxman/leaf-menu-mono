// E2E against the built worker in a real browser. Plan §13. Run: `npm run test:e2e` (builds first).
import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '8799'

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false, // one shared D1; tests use different dishes, but keep the run order stable
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'], // mobile first (wireframes)
    locale: 'pt-PT', // Accept-Language: /r/demo -> /r/demo/pt
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://localhost:${PORT}/r/demo/pt`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
