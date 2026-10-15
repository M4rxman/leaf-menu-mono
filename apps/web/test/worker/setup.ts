import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach } from 'vitest'
import seedSql from '../../../../packages/shared/seed.sql?raw'

// seed.sql is written for `wrangler d1 execute` (multi-line statements, comments); D1 binding wants one statement at a time.
const seed = seedSql
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
  .split(/;\s*\n/).map(s => s.trim()).filter(Boolean)

await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS)

// Every test starts from the Casa Strega demo only.
beforeEach(async () => {
  // Wipe every venue first (cascades to dishes and likes), so extra venues created by a test don't leak into the next one.
  await env.DB.batch([env.DB.prepare('DELETE FROM restaurants'), ...seed.map(s => env.DB.prepare(s))])
})
