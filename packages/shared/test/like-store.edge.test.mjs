// D1LikeStore against the real schema: isolation between venues and devices, and the counter invariant.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D1LikeStore } from '../src/infra/d1-like-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const sqlite = seededSqlite()
const store = new D1LikeStore(nodeSqliteDb(sqlite))

// A second venue with one category and one dish (id 100), to prove nothing leaks between venues.
sqlite.exec(`
  INSERT INTO restaurants (id, slug, qr_code, default_lang) VALUES (2, 'other', 'zz9zz9', 'en');
  INSERT INTO categories (id, restaurant_id, position) VALUES (50, 2, 10);
  INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents) VALUES (100, 2, 50, 10, 900);
`)

const countRow = id => sqlite.prepare('SELECT likes FROM dishes WHERE id = ?').get(id).likes
const rows = id => sqlite.prepare('SELECT COUNT(*) AS n FROM likes WHERE dish_id = ?').get(id).n

test('venues are isolated: counts and liked ids only come from the requested slug', async () => {
  await store.setLiked(100, 'dev-x', true)
  await store.setLiked(7, 'dev-x', true)
  assert.deepEqual(await store.likedDishIds('demo', 'dev-x'), [7])
  assert.deepEqual(await store.likedDishIds('other', 'dev-x'), [100])
  assert.equal(100 in await store.counts('demo'), false)
  assert.equal(7 in await store.counts('other'), false)
  assert.deepEqual(await store.likedDishIds('nope', 'dev-x'), [])
  assert.deepEqual(await store.counts('nope'), {})
})

test('a deleted venue: nothing in it can be liked, counted or listed', async () => {
  sqlite.exec("UPDATE restaurants SET deleted_at = datetime('now') WHERE id = 2")
  assert.equal(await store.findLikeable(100), null)
  assert.deepEqual(await store.counts('other'), {})
  assert.deepEqual(await store.likedDishIds('other', 'dev-x'), [])
  sqlite.exec('UPDATE restaurants SET deleted_at = NULL WHERE id = 2')
  assert.deepEqual(await store.findLikeable(100), { slug: 'other' })
})

test('a hidden or deleted category hides its dishes from likes', async () => {
  sqlite.exec('UPDATE categories SET is_visible = 0 WHERE id = 50')
  assert.equal(await store.findLikeable(100), null)
  assert.equal(100 in await store.counts('other'), false)
  sqlite.exec("UPDATE categories SET is_visible = 1, deleted_at = datetime('now') WHERE id = 50")
  assert.equal(await store.findLikeable(100), null)
  sqlite.exec('UPDATE categories SET deleted_at = NULL WHERE id = 50')
  assert.deepEqual(await store.findLikeable(100), { slug: 'other' })
})

test('one device unliking never touches another device\'s like', async () => {
  const before = countRow(8)
  await store.setLiked(8, 'dev-1', true)
  await store.setLiked(8, 'dev-2', true)
  assert.equal(await store.setLiked(8, 'dev-1', false), before + 1)
  assert.deepEqual(await store.likedDishIds('demo', 'dev-2'), [8])
  await store.setLiked(8, 'dev-2', false)
})

test('unliking something never liked is a no-op: the counter cannot go below zero', async () => {
  const before = countRow(9)
  assert.equal(await store.setLiked(9, 'never-liked', false), before)
  assert.equal(await store.setLiked(9, 'never-liked', false), before)
  assert.ok(countRow(9) >= 0)
})

test('device ids are opaque text: odd values are stored as data, not interpreted', async () => {
  const odd = ["x'; DROP TABLE likes; --", '', ' ', '😀', 'a'.repeat(2000)]
  for (const id of odd) {
    await store.setLiked(4, id, true)
    assert.ok((await store.likedDishIds('demo', id)).includes(4), JSON.stringify(id).slice(0, 20))
    await store.setLiked(4, id, false)
  }
  assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'likes'").get())
})

test('a dish id that does not exist: no like row, count 0, not likeable', async () => {
  assert.equal(await store.findLikeable(424242), null)
  assert.equal(await store.currentCount(424242), 0)
  assert.throws(() => sqlite.prepare("INSERT INTO likes (dish_id, device_id) VALUES (424242, 'd')").run(), /FOREIGN KEY/) // schema is the last line of defence
})

test('deleting a dish removes its likes (cascade) and they drop out of favorites', async () => {
  await store.setLiked(5, 'dev-c', true)
  sqlite.exec('DELETE FROM dishes WHERE id = 5')
  assert.equal(rows(5), 0)
  assert.deepEqual(await store.likedDishIds('demo', 'dev-c'), [])
})

test('invariant: dishes.likes always equals the number of like rows, after a long random sequence', async () => {
  let seed = 12345
  const rand = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n
  const dishes = [1, 3, 4, 6, 7, 8, 9]
  const devices = ['a', 'b', 'c', 'd', 'e']
  for (let i = 0; i < 600; i++) await store.setLiked(dishes[rand(dishes.length)], devices[rand(devices.length)], rand(2) === 1)
  for (const id of dishes) assert.equal(countRow(id), rows(id), `dish ${id}`)
})

test('a hidden dish drops out of favorites but keeps its like; showing it again brings it back', async () => {
  await store.setLiked(6, 'dev-h', true)
  const before = countRow(6)
  sqlite.exec('UPDATE dishes SET is_visible = 0 WHERE id = 6')
  assert.deepEqual(await store.likedDishIds('demo', 'dev-h'), [])
  assert.equal(countRow(6), before) // the like is not lost
  sqlite.exec('UPDATE dishes SET is_visible = 1 WHERE id = 6')
  assert.deepEqual(await store.likedDishIds('demo', 'dev-h'), [6])
  await store.setLiked(6, 'dev-h', false)
})

test('removing a category removes its dishes and their likes, and the other categories are untouched', async () => {
  const keep = await store.counts('demo')
  await store.setLiked(1, 'dev-k', true)
  await store.setLiked(4, 'dev-k', true)
  const cat = sqlite.prepare('SELECT category_id AS c FROM dishes WHERE id = 4').get().c
  sqlite.prepare('DELETE FROM categories WHERE id = ?').run(cat)
  assert.equal(rows(4), 0)
  assert.equal(await store.findLikeable(4), null)
  assert.ok(!(4 in await store.counts('demo')))
  assert.ok(1 in keep && (await store.likedDishIds('demo', 'dev-k')).includes(1))
})

test('simultaneous taps from one device count once (the insert is idempotent)', async () => {
  const before = countRow(3)
  const results = await Promise.all(Array.from({ length: 25 }, () => store.setLiked(3, 'dev-race', true)))
  assert.equal(countRow(3), before + 1)
  assert.ok(results.every(c => c === before + 1))
  await Promise.all(Array.from({ length: 25 }, () => store.setLiked(3, 'dev-race', false)))
  assert.equal(countRow(3), before)
})

test('many devices on one dish: the counter equals the number of distinct devices', async () => {
  const before = countRow(9)
  for (let i = 0; i < 100; i++) await store.setLiked(9, `crowd-${i}`, true)
  assert.equal(countRow(9), before + 100)
  assert.equal((await store.counts('demo'))[9], before + 100)
})
