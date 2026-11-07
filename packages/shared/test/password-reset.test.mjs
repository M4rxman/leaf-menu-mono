import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthService, RESET_SECONDS } from '../src/domain/auth-service.ts'
import { hashPassword } from '../src/domain/password.ts'
import { D1AuthStore } from '../src/infra/d1-auth-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const PEPPER = 'test-pepper'
const OLD = 'old password 123'
const NEW = 'brand new password'
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

async function setup() {
  const sqlite = seededSqlite()
  const hash = await hashPassword(OLD, PEPPER, 1000)
  sqlite.prepare("INSERT INTO users (email, password_hash, role) VALUES ('admin@x.pt', ?, 'admin')").run(hash)
  sqlite.prepare("INSERT INTO users (email, password_hash, role, restaurant_id, must_change_password) VALUES ('owner@x.pt', ?, 'owner', 1, 1)").run(hash)
  let t = 1_000_000
  const auth = new AuthService(new D1AuthStore(nodeSqliteDb(sqlite)), PEPPER, () => t)
  return { sqlite, auth, advance: (s) => { t += s } }
}
const rows = sqlite => sqlite.prepare('SELECT * FROM password_resets').all()

test('request: stores only the SHA-256 of a 256-bit token, expiring in 30 minutes', async () => {
  const { sqlite, auth } = await setup()
  const r = await auth.requestReset('Owner@X.pt ', '1.1.1.1')
  assert.equal(r.email, 'owner@x.pt')
  assert.match(r.token, /^[A-Za-z0-9_-]{43}$/) // 32 random bytes, base64url
  const [row] = rows(sqlite)
  assert.equal(row.token_hash, await sha256(r.token))
  assert.notEqual(row.token_hash, r.token)
  assert.equal(row.expires_at, 1_000_000 + RESET_SECONDS)
  assert.equal(RESET_SECONDS, 1800)
  assert.equal(row.used, 0)
})

test('request: an unknown email gives null and stores nothing; tokens are never reused', async () => {
  const { sqlite, auth } = await setup()
  assert.equal(await auth.requestReset('ghost@x.pt', '1.1.1.1'), null)
  assert.equal(rows(sqlite).length, 0)
  const a = await auth.requestReset('admin@x.pt', '1.1.1.2')
  const b = await auth.requestReset('owner@x.pt', '1.1.1.3')
  assert.notEqual(a.token, b.token)
})

test('reset: sets the password, clears must_change_password, ends every session, lifts a lockout', async () => {
  const { sqlite, auth } = await setup()
  const login = await auth.login('owner@x.pt', OLD, '2.2.2.2')
  assert.ok(login.ok)
  for (let i = 0; i < 5; i++) await auth.login('owner@x.pt', 'wrong', '3.3.3.3') // lock the email out
  assert.deepEqual(await auth.login('owner@x.pt', OLD, '4.4.4.4'), { ok: false, reason: 'throttled' })

  const { token } = await auth.requestReset('owner@x.pt', '1.1.1.1')
  assert.deepEqual(await auth.resetPassword(token, NEW, '1.1.1.1'), { ok: true, email: 'owner@x.pt' })

  assert.equal(await auth.authenticate(login.token), null) // old session revoked
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
  assert.equal(sqlite.prepare("SELECT must_change_password AS m FROM users WHERE email = 'owner@x.pt'").get().m, 0)
  assert.equal((await auth.login('owner@x.pt', OLD, '5.5.5.5')).ok, false)
  const again = await auth.login('owner@x.pt', NEW, '5.5.5.5')
  assert.ok(again.ok)
  assert.equal(again.user.mustChangePassword, false)
})

test('reset: a link works once (replay is refused), even in parallel', async () => {
  const { auth } = await setup()
  const { token } = await auth.requestReset('owner@x.pt', '1.1.1.1')
  const results = await Promise.all([auth.resetPassword(token, NEW, '9.9.9.1'), auth.resetPassword(token, `${NEW}2`, '9.9.9.2')])
  assert.deepEqual(results.map(r => r.ok).sort(), [false, true])
  assert.deepEqual(await auth.resetPassword(token, NEW, '9.9.9.3'), { ok: false, reason: 'invalid' })
})

test('reset: expiry is exact (valid 1 s before, refused at the expiry second)', async () => {
  const { auth, advance } = await setup()
  const a = await auth.requestReset('owner@x.pt', '1.1.1.1')
  advance(RESET_SECONDS - 1)
  assert.ok((await auth.resetPassword(a.token, NEW, '9.9.9.1')).ok)
  const b = await auth.requestReset('owner@x.pt', '1.1.1.1')
  advance(RESET_SECONDS)
  assert.deepEqual(await auth.resetPassword(b.token, NEW, '9.9.9.2'), { ok: false, reason: 'invalid' })
})

test('reset: a newer request supersedes the older link', async () => {
  const { sqlite, auth } = await setup()
  const first = await auth.requestReset('owner@x.pt', '1.1.1.1')
  const second = await auth.requestReset('owner@x.pt', '1.1.1.1')
  assert.equal(rows(sqlite).length, 1)
  assert.deepEqual(await auth.resetPassword(first.token, NEW, '9.9.9.1'), { ok: false, reason: 'invalid' })
  assert.ok((await auth.resetPassword(second.token, NEW, '9.9.9.2')).ok)
})

test('reset: a link only ever changes its own user (the request names no user)', async () => {
  const { auth } = await setup()
  const owner = await auth.requestReset('owner@x.pt', '1.1.1.1')
  assert.ok((await auth.resetPassword(owner.token, NEW, '9.9.9.1')).ok)
  assert.ok((await auth.login('admin@x.pt', OLD, '8.8.8.8')).ok) // the admin's password is untouched
  assert.equal((await auth.login('owner@x.pt', OLD, '8.8.8.9')).ok, false)
})

test('reset: garbage, empty and unknown tokens are refused; a too-short password does not burn the link', async () => {
  const { auth } = await setup()
  for (const bad of ['', 'x', 'a'.repeat(43), '\' OR 1=1 --'])
    assert.deepEqual(await auth.resetPassword(bad, NEW, '9.9.9.1'), { ok: false, reason: 'invalid' })
  const { token } = await auth.requestReset('owner@x.pt', '1.1.1.1')
  assert.deepEqual(await auth.resetPassword(token, 'short', '9.9.9.2'), { ok: false, reason: 'too_short' })
  assert.deepEqual(await auth.resetPassword(token, 'x'.repeat(11), '9.9.9.2'), { ok: false, reason: 'too_short' })
  assert.ok((await auth.resetPassword(token, 'x'.repeat(12), '9.9.9.2')).ok) // exactly 12 is enough
})

test('throttle: 5 requests per email per window, then refused; the window slides', async () => {
  const { auth, advance } = await setup()
  for (let i = 0; i < 5; i++) assert.notEqual(await auth.requestReset('owner@x.pt', `7.7.7.${i}`), 'throttled')
  assert.equal(await auth.requestReset('OWNER@x.pt', '7.7.7.9'), 'throttled') // case does not dodge it
  assert.equal(await auth.requestReset('ghost@x.pt', '7.7.7.9'), null) // another email is not blocked
  advance(15 * 60 + 1)
  assert.notEqual(await auth.requestReset('owner@x.pt', '7.7.7.9'), 'throttled')
})

test('throttle: per IP across different emails, and unknown emails count too (no oracle)', async () => {
  const { auth } = await setup()
  for (let i = 0; i < 5; i++) assert.equal(await auth.requestReset(`ghost${i}@x.pt`, '6.6.6.6'), null)
  assert.equal(await auth.requestReset('owner@x.pt', '6.6.6.6'), 'throttled')
})

test('throttle: reset requests never lock logins, and wrong-token guesses are throttled per IP', async () => {
  const { auth } = await setup()
  for (let i = 0; i < 6; i++) await auth.requestReset('owner@x.pt', '6.6.6.6')
  assert.ok((await auth.login('owner@x.pt', OLD, '6.6.6.6')).ok)
  for (let i = 0; i < 5; i++) await auth.resetPassword('nope', NEW, '5.5.5.5')
  assert.deepEqual(await auth.resetPassword('nope', NEW, '5.5.5.5'), { ok: false, reason: 'throttled' })
})

test('expired links are purged on the next request', async () => {
  const { sqlite, auth, advance } = await setup()
  await auth.requestReset('owner@x.pt', '1.1.1.1')
  advance(RESET_SECONDS + 1)
  assert.equal(await auth.requestReset('ghost@x.pt', '1.1.1.2'), null) // unknown path purges too
  assert.equal(rows(sqlite).length, 0)
})
