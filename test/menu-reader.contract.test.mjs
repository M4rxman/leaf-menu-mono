// Contract for any MenuReader: run against the real schema + seed. A second implementation must pass the same file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D1MenuReader } from '../server/infra/d1-menu-reader.ts'
import { MenuService } from '../server/domain/menu-service.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const sqlite = seededSqlite()
const reader = new D1MenuReader(nodeSqliteDb(sqlite))
const service = new MenuService(reader)

test('unknown slug is null', async () => assert.equal(await reader.getMenu('nope'), null))

test('demo menu: 7 categories, 9 dishes, pt default', async () => {
  const m = await reader.getMenu('demo')
  assert.equal(m.defaultLang, 'pt')
  assert.deepEqual(m.langs, ['pt', 'en'])
  assert.equal(m.categories.length, 7)
  assert.equal(m.categories.flatMap(c => c.dishes).length, 9)
})

test('portuguese view: formatted prices, featured Bufalina', async () => {
  const { menu } = await service.getMenu('demo', 'pt')
  const dishes = menu.categories.flatMap(c => c.dishes)
  assert.match(dishes.find(d => d.name === 'Aperol Spritz').price, /^5,00\s€$/)
  assert.equal(dishes.find(d => d.isFeatured).name, 'Bufalina Panizza')
})

test('english view translates Bufalina only, the rest falls back to pt', async () => {
  const { menu } = await service.getMenu('demo', 'en')
  const d = menu.categories.flatMap(c => c.dishes)
  assert.match(d.find(x => x.id === 7).description, /^Tomato/)
  assert.match(d.find(x => x.id === 8).description, /^Mortadela/)
})

test('renamed slug redirects', async () => {
  sqlite.exec("INSERT INTO slug_history VALUES ('casa-old', 1)")
  assert.deepEqual(await service.getMenu('casa-old', 'pt'), { kind: 'redirect', slug: 'demo', lang: 'pt', permanent: true })
})
