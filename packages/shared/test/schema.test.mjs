// Run: npm test. Applies migration + seed to in-memory SQLite and checks the invariants D1 relies on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

function db() {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON') // D1 enforces FKs by default
  d.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
  d.exec(readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'))
  return d
}
const likes = (d, id) => d.prepare('SELECT likes FROM dishes WHERE id = ?').get(id).likes
const count = (d, t) => d.prepare(`SELECT count(*) AS n FROM ${t}`).get().n

test('seed loads Casa Strega', () => {
  const d = db()
  assert.equal(count(d, 'categories'), 7)
  assert.equal(count(d, 'dishes'), 9)
})

test('seed is re-runnable', () => {
  const d = db()
  d.exec(readFileSync(new URL('../seed.sql', import.meta.url), 'utf8'))
  assert.equal(count(d, 'dishes'), 9)
})

test('like triggers keep dishes.likes in sync, retries are idempotent', () => {
  const d = db()
  const like = d.prepare('INSERT OR IGNORE INTO likes (dish_id, device_id) VALUES (?, ?)')
  like.run(7, 'a'); like.run(7, 'a'); like.run(7, 'b')
  assert.equal(likes(d, 7), 2)
  d.prepare('DELETE FROM likes WHERE dish_id = ? AND device_id = ?').run(7, 'a')
  d.prepare('DELETE FROM likes WHERE dish_id = ? AND device_id = ?').run(7, 'a')
  assert.equal(likes(d, 7), 1)
})

test('one owner per restaurant', () => {
  const d = db()
  const add = d.prepare("INSERT INTO users (email, password_hash, role, restaurant_id) VALUES (?, 'x', 'owner', 1)")
  add.run('a@x.pt')
  assert.throws(() => add.run('b@x.pt'), /UNIQUE/)
})

test('role / restaurant_id check', () => {
  const d = db()
  assert.throws(() => d.exec("INSERT INTO users (email, password_hash, role, restaurant_id) VALUES ('ad@x.pt', 'x', 'admin', 1)"), /CHECK/)
  assert.throws(() => d.exec("INSERT INTO users (email, password_hash, role) VALUES ('ow@x.pt', 'x', 'owner')"), /CHECK/)
})

test('malformed language tag rejected, any well-formed tag accepted by the DB', () => {
  const d = db()
  assert.throws(() => d.exec("INSERT INTO restaurant_langs VALUES (1, 'p', 30)"), /CHECK/)
  assert.throws(() => d.exec("INSERT INTO restaurant_langs VALUES (1, 'pt_BR', 30)"), /CHECK/)
  d.exec("INSERT INTO restaurant_langs VALUES (1, 'it', 30)") // pool membership is the app's job (shared/langs.ts)
})

test('deleting a restaurant cascades', () => {
  const d = db()
  d.prepare('INSERT INTO likes (dish_id, device_id) VALUES (7, ?)').run('a')
  d.exec('DELETE FROM restaurants WHERE id = 1')
  for (const t of ['categories', 'category_i18n', 'dishes', 'dish_i18n', 'likes', 'restaurant_langs', 'restaurant_i18n'])
    assert.equal(count(d, t), 0, t)
})
