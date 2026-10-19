// Worker tests: the built Nitro worker (.output/server/index.mjs, run `npm run build` first) inside workerd,
// with local D1 (real migrations + seed) and the same bindings as wrangler.toml. Plan §13.
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('../../packages/shared/migrations') } }
    })
  ],
  test: {
    include: ['test/worker/**/*.test.ts'],
    setupFiles: ['./test/worker/setup.ts']
  }
}))
