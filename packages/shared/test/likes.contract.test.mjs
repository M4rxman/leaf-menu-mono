// Contract for any LikeStore: run against the real schema + seed (triggers keep dishes.likes right).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D1LikeStore } from '../src/infra/d1-like-store.ts'
import { LikeService } from '../src/domain/like-service.ts'
import { MenuService, onlyDishes } from '../src/domain/menu-service.ts'
import { D1MenuReader } from '../src/infra/d1-menu-reader.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const sqlite = seededSqlite()
const db = nodeSqliteDb(sqlite)
const likes = new LikeService(new D1LikeStore(db))
const dishId = 7 // Bufalina Panizza

test('like +1, retrying the same like does not double-count, unlike goes back', async () => {
  const before = (await likes.set(dishId, 'dev-a', false)).count
  assert.equal((await likes.set(dishId, 'dev-a', true)).count, before + 1)
  assert.equal((await likes.set(dishId, 'dev-a', true)).count, before + 1)
  assert.deepEqual(await likes.set(dishId, 'dev-a', false), { slug: 'demo', dishId, liked: false, count: before })
  assert.equal((await likes.set(dishId, 'dev-a', false)).count, before) // unlike twice is fine
})

test('devices count separately; no device means no change', async () => {
  const before = (await likes.set(dishId, null, true)).count
  assert.equal((await likes.set(dishId, null, true)).liked, false)
  await likes.set(dishId, 'dev-a', true)
  await likes.set(dishId, 'dev-b', true)
  assert.equal((await likes.set(dishId, null, true)).count, before + 2)
})

test('hidden, deleted and unknown dishes cannot be liked; sold-out can', async () => {
  sqlite.exec('UPDATE dishes SET is_visible = 0 WHERE id = 1; UPDATE dishes SET deleted_at = datetime(\'now\') WHERE id = 2; UPDATE dishes SET is_sold_out = 1 WHERE id = 3')
  assert.equal(await likes.set(1, 'dev-a', true), null)
  assert.equal(await likes.set(2, 'dev-a', true), null)
  assert.equal(await likes.set(9999, 'dev-a', true), null)
  assert.equal(await likes.slugOf(3), 'demo')
  assert.equal(await likes.slugOf(1), null)
  assert.equal((await likes.set(3, 'dev-a', true)).liked, true)
})

test('venueLikes and favorites list exactly this device\'s dishes', async () => {
  await likes.set(5, 'dev-c', true)
  await likes.set(6, 'dev-c', true)
  await likes.set(6, 'dev-d', true)
  assert.deepEqual((await likes.venueLikes('demo', 'dev-c')).liked.sort(), [5, 6])
  assert.deepEqual((await likes.venueLikes('demo', 'dev-d')).liked, [6])
  assert.deepEqual((await likes.venueLikes('demo', null)).liked, [])
  const all = await likes.venueLikes('demo', null)
  assert.equal(all.counts[6], 2)
  assert.equal(1 in all.counts, false) // hidden dish not exposed

  const { menu } = await new MenuService(new D1MenuReader(db)).getMenu('demo', 'pt')
  const fav = onlyDishes(menu, await likes.likedDishIds('demo', 'dev-c'))
  assert.deepEqual(fav.categories.flatMap(c => c.dishes.map(d => d.id)).sort(), [5, 6])
  assert.deepEqual(onlyDishes(menu, []).categories, [])
})
