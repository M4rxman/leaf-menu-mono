// The order of operations in one like request: this is where "cookie only on a real like" and the rate limit live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runLike } from '../src/domain/like-flow.ts'
import { LikeService } from '../src/domain/like-service.ts'
import { D1LikeStore } from '../src/infra/d1-like-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

function setup({ allow = true } = {}) {
  const sqlite = seededSqlite()
  const events = []
  const limiter = { allow: async (key) => { events.push(['limit', key]); return typeof allow === 'function' ? allow(key) : allow } }
  const likes = new LikeService(new D1LikeStore(nodeSqliteDb(sqlite)))
  const req = (over = {}) => ({
    dishId: '7', ip: '203.0.113.9', liked: true,
    readDevice: async () => { events.push(['read']); return 'dev-1' },
    ensureDevice: async () => { events.push(['ensure']); return 'dev-1' },
    ...over
  })
  const count = id => sqlite.prepare('SELECT likes FROM dishes WHERE id = ?').get(id).likes
  return { sqlite, events, limiter, likes, req, count, run: over => runLike(likes, limiter, req(over)) }
}

test('a real like: rate-limit check, then the cookie is issued, then the like is stored', async () => {
  const t = setup()
  const out = await t.run()
  assert.deepEqual(out, { ok: true, result: { slug: 'demo', dishId: 7, liked: true, count: 1 } })
  assert.deepEqual(t.events, [['limit', '203.0.113.9|7'], ['ensure']])
})

test('no cookie is issued when the dish is unknown, hidden, deleted or in a hidden category', async () => {
  const t = setup()
  t.sqlite.exec(`UPDATE dishes SET is_visible = 0 WHERE id = 1; UPDATE dishes SET deleted_at = datetime('now') WHERE id = 2;
                 UPDATE categories SET is_visible = 0 WHERE id = (SELECT category_id FROM dishes WHERE id = 4)`)
  for (const dishId of ['9999', '1', '2', '4'])
    assert.deepEqual(await t.run({ dishId }), { ok: false, status: 404, code: 'not_found' }, dishId)
  assert.ok(!t.events.some(e => e[0] === 'ensure'), 'ensureDevice must not run for a dish that cannot be liked')
  assert.equal(t.events.filter(e => e[0] === 'limit').length, 4) // the budget is spent either way: probing is limited too
})

test('no cookie and no write when the request is rate limited', async () => {
  const t = setup({ allow: false })
  assert.deepEqual(await t.run(), { ok: false, status: 429, code: 'rate_limited' })
  assert.deepEqual(t.events, [['limit', '203.0.113.9|7']])
  assert.equal(t.count(7), 0)
})

test('a malformed id is a 404 before the limiter or the database are touched', async () => {
  const t = setup()
  for (const dishId of [undefined, '', '0', '-1', '1e1', '0x7', 'abc', '7 ', '9'.repeat(30)])
    assert.deepEqual(await t.run({ dishId }), { ok: false, status: 404, code: 'not_found' }, String(dishId))
  assert.deepEqual(t.events, [])
})

test('unlike reads the cookie but never issues one; without a cookie it is a no-op', async () => {
  const t = setup()
  await t.run() // like first
  t.events.length = 0
  const out = await t.run({ liked: false })
  assert.deepEqual(out.result, { slug: 'demo', dishId: 7, liked: false, count: 0 })
  assert.deepEqual(t.events, [['limit', '203.0.113.9|7'], ['read']])

  await t.run() // like again
  const none = await t.run({ liked: false, readDevice: async () => null })
  assert.deepEqual(none.result, { slug: 'demo', dishId: 7, liked: false, count: 1 }) // nothing removed
})

test('the limiter key is per IP and per dish; IPv6 addresses cannot collide with another dish', async () => {
  const t = setup()
  await t.run({ ip: '2001:db8::1', dishId: '7' })
  await t.run({ ip: '2001:db8::1', dishId: '8' })
  await t.run({ ip: '2001:db8:', dishId: '17' })
  const keys = t.events.filter(e => e[0] === 'limit').map(e => e[1])
  assert.equal(new Set(keys).size, 3)
})

test('the 11th request is the first one refused when the limit is 10 per key', async () => {
  const seen = new Map()
  const t = setup({ allow: (k) => { seen.set(k, (seen.get(k) ?? 0) + 1); return seen.get(k) <= 10 } })
  const codes = []
  for (let i = 0; i < 12; i++) codes.push((await t.run()).ok ? 200 : 429)
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429, 429])
  assert.equal((await t.run({ dishId: '8' })).ok, true) // another dish has its own budget
  assert.equal((await t.run({ ip: '198.51.100.1' })).ok, true) // so does another IP
})

test('a failing limiter binding surfaces as an error, not as "allowed"', async () => {
  const t = setup()
  await assert.rejects(runLike(t.likes, { allow: async () => { throw new Error('binding down') } }, t.req()), /binding down/)
})
