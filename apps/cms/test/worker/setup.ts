import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { hashPassword } from '@chilly/shared/domain/password'
import { beforeEach } from 'vitest'
import seedSql from '../../../../packages/shared/seed.sql?raw'

// seed.sql is written for `wrangler d1 execute` (multi-line statements, comments); D1 binding wants one statement at a time.
const seed = seedSql
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
  .split(/;\s*\n/).map(s => s.trim()).filter(Boolean)

export const PASSWORD = 'correct horse battery'
const hash = await hashPassword(PASSWORD, 1000) // the stored string carries the count, so tests stay fast

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

// Every test starts from the Casa Strega demo plus two accounts: admin (id 1) and the demo venue's owner (id 2,
// still on a temporary password).
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM restaurants'),
    env.DB.prepare('DELETE FROM users'),
    env.DB.prepare('DELETE FROM login_failures'),
    ...seed.map(s => env.DB.prepare(s)),
    env.DB.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@x.pt', ?, 'admin')").bind(hash),
    env.DB.prepare("INSERT INTO users (id, email, password_hash, role, restaurant_id, must_change_password) VALUES (2, 'owner@x.pt', ?, 'owner', 1, 1)").bind(hash)
  ])
})
