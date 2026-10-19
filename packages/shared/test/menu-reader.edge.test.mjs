// Reader edge cases on the real schema: data shapes the CMS will produce once owners start editing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D1MenuReader } from '../src/infra/d1-menu-reader.ts'
import { MenuService } from '../src/domain/menu-service.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const sqlite = seededSqlite()
const reader = new D1MenuReader(nodeSqliteDb(sqlite))
const service = new MenuService(reader)

test('a soft-deleted venue is gone: no menu, and its old slugs do not resolve', async () => {
  sqlite.exec("INSERT INTO slug_history VALUES ('casa-old', 1); UPDATE restaurants SET deleted_at = datetime('now') WHERE id = 1")
  assert.equal(await reader.getMenu('demo'), null)
  assert.equal(await reader.currentSlugFor('casa-old'), null)
  assert.deepEqual(await service.getMenu('casa-old', 'pt'), { kind: 'notfound' })
  sqlite.exec('UPDATE restaurants SET deleted_at = NULL WHERE id = 1')
  assert.equal((await reader.getMenu('demo')).slug, 'demo')
})

test('corrupt or non-object info_json degrades to an empty info instead of failing the menu', async () => {
  for (const bad of ['{not json', '[1,2]', '"text"', 'null', '']) {
    sqlite.prepare('UPDATE restaurants SET info_json = ? WHERE id = 1').run(bad)
    assert.deepEqual((await reader.getMenu('demo')).info, {}, JSON.stringify(bad))
  }
  sqlite.prepare('UPDATE restaurants SET info_json = ? WHERE id = 1').run('{"address":"Rua 1"}')
  assert.deepEqual((await reader.getMenu('demo')).info, { address: 'Rua 1' })
})

test('slug lookup is case-sensitive at the database; the service owns the case rule', async () => {
  assert.equal(await reader.getMenu('Demo'), null)
  assert.equal((await service.getMenu('Demo', 'pt')).kind, 'redirect')
})

test('a venue with no languages, no translations and no categories still reads', async () => {
  sqlite.exec(`INSERT INTO restaurants (id, slug, qr_code, default_lang) VALUES (9, 'empty', 'e9e9e9', 'en')`)
  const m = await reader.getMenu('empty')
  assert.deepEqual([m.langs, m.names, m.categories], [[], {}, []])
  const r = await service.getMenu('empty', 'en')
  assert.equal(r.kind, 'ok')
  assert.equal(r.menu.name, '')
})

test('a dish with no translation in any language reads with an empty name (the CMS must prevent it)', async () => {
  sqlite.exec(`INSERT INTO categories (id, restaurant_id, position) VALUES (90, 9, 10);
               INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents) VALUES (900, 9, 90, 10, 100)`)
  const d = (await service.getMenu('empty', 'en')).menu.categories[0].dishes[0]
  assert.equal(d.name, '')
  assert.equal(d.nameLang, undefined)
})

test('empty-string and null i18n values count as missing, not as a translation', async () => {
  sqlite.exec(`INSERT INTO dish_i18n (dish_id, lang, name, description) VALUES (900, 'en', 'Soup', ''), (900, 'pt', 'Sopa', NULL)`)
  const d = (await service.getMenu('empty', 'en')).menu.categories[0].dishes[0]
  assert.equal(d.name, 'Soup')
  assert.equal(d.description, '')
})

test('likes counter and rows come back as numbers, ids as integers (no strings from the driver)', async () => {
  const dish = (await reader.getMenu('demo')).categories.flatMap(c => c.dishes)[0]
  assert.equal(typeof dish.id, 'number')
  assert.equal(typeof dish.likes, 'number')
  assert.equal(typeof dish.priceCents, 'number')
})
