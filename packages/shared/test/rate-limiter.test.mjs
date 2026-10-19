// D1RateLimiter against the real schema: fixed one-minute windows, per key, limit given per call.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D1RateLimiter } from '../src/infra/d1-like-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

function setup() {
  const sqlite = seededSqlite()
  const clock = { t: 1_000_000 * 60000 }
  return { sqlite, clock, limiter: new D1RateLimiter(nodeSqliteDb(sqlite), () => clock.t) }
}

test('allows `limit` calls per key per minute, refuses the next, and a new minute starts fresh', async () => {
  const { limiter, clock } = setup()
  const run = async n => Promise.all(Array.from({ length: n }, () => limiter.allow('ip|7', 3))).then(r => r)
  assert.deepEqual(await run(5), [true, true, true, false, false])
  clock.t += 59_000 // same minute
  assert.equal(await limiter.allow('ip|7', 3), false)
  clock.t += 2_000
  assert.equal(await limiter.allow('ip|7', 3), true)
})

test('each key has its own budget; the limit is read per call, so a CMS change applies at once', async () => {
  const { limiter } = setup()
  for (let i = 0; i < 3; i++) await limiter.allow('a|7', 3)
  assert.equal(await limiter.allow('a|7', 3), false)
  assert.equal(await limiter.allow('a|7', 5), true) // owner raised the limit to 5 (refused calls count too: this was the 5th)
  assert.equal(await limiter.allow('b|7', 3), true)
  assert.equal(await limiter.allow('a|8', 3), true)
})

test('the schema refuses a nonsensical venue limit', () => {
  const { sqlite } = setup()
  for (const bad of [0, -1, 601, 'x'])
    assert.throws(() => sqlite.prepare('UPDATE restaurants SET like_limit_per_min = ? WHERE id = 1').run(bad), /CHECK/, String(bad))
  assert.doesNotThrow(() => sqlite.prepare('UPDATE restaurants SET like_limit_per_min = 600 WHERE id = 1').run())
})
