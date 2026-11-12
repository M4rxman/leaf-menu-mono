// Slug rule (CLAUDE.md): ^[a-z0-9]+(-[a-z0-9]+)*$, 3-40 chars, reserved: admin, api. Enforced by triggers (migration 0005).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const dir = new URL('../migrations/', import.meta.url)
function db() {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(dir).sort()) d.exec(readFileSync(new URL(f, dir), 'utf8'))
  d.exec(readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'))
  d.exec(readFileSync(new URL('../../../apps/web/e2e/rtl-venue.sql', import.meta.url), 'utf8'))
  return d
}
const insert = (d, slug, n) =>
  d.prepare('INSERT INTO restaurants (slug, qr_code, default_lang) VALUES (?, ?, ?)').run(slug, `qr${n}`, 'en')

const good = ['abc', 'a1b', 'casa-strega', 'a-b-c', '123', 'x'.repeat(40)]
const bad = [
  'ab', 'x'.repeat(41), '', // length
  'Demo', 'casa_strega', 'casa strega', 'café', 'a.b.c', 'a/b/c', // characters
  '-abc', 'abc-', 'a--b', '---', // hyphens
  'admin', 'api', // reserved
]

test('valid slugs are accepted on insert', () => {
  const d = db()
  good.forEach((s, i) => insert(d, s, i))
})

test('invalid and reserved slugs are rejected on insert', () => {
  const d = db()
  bad.forEach((s, i) => assert.throws(() => insert(d, s, i), /slug/, JSON.stringify(s)))
})

test('invalid and reserved slugs are rejected on slug update', () => {
  const d = db()
  const upd = d.prepare('UPDATE restaurants SET slug = ? WHERE id = 1')
  bad.forEach((s) => assert.throws(() => upd.run(s), /slug/, JSON.stringify(s)))
  upd.run('casa-strega')
  assert.equal(d.prepare('SELECT slug FROM restaurants WHERE id = 1').get().slug, 'casa-strega')
})
