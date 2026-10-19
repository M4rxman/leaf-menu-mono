import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthService } from '../src/domain/auth-service.ts'
import { hashPassword, verifyPassword } from '../src/domain/password.ts'
import { D1AuthStore } from '../src/infra/d1-auth-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const ITER = 1000 // fast hashes for tests; the stored string carries the count
const PASSWORD = 'correct horse battery'

async function setup() {
  const sqlite = seededSqlite()
  const hash = await hashPassword(PASSWORD, ITER)
  sqlite.prepare("INSERT INTO users (email, password_hash, role) VALUES ('admin@x.pt', ?, 'admin')").run(hash)
  sqlite.prepare("INSERT INTO users (email, password_hash, role, restaurant_id, must_change_password) VALUES ('Owner@x.pt', ?, 'owner', 1, 1)").run(hash)
  let t = 1_000_000
  const auth = new AuthService(new D1AuthStore(nodeSqliteDb(sqlite)), () => t)
  return { sqlite, auth, advance: (s) => { t += s } }
}

test('password: round trip, wrong password, malformed hash', async () => {
  const h = await hashPassword('secret-secret', ITER)
  assert.ok(await verifyPassword('secret-secret', h))
  assert.ok(!await verifyPassword('secret-secreT', h))
  assert.ok(!await verifyPassword('x', 'garbage'))
  assert.ok(!await verifyPassword('x', 'md5$1$a$b'))
})

test('login: session works, email is case-insensitive, user flags come through', async () => {
  const { auth } = await setup()
  const r = await auth.login(' owner@X.pt ', PASSWORD, '1.1.1.1')
  assert.ok(r.ok)
  const user = await auth.authenticate(r.token)
  assert.deepEqual(user, { id: 2, email: 'Owner@x.pt', role: 'owner', restaurantId: 1, mustChangePassword: true })
  assert.equal(await auth.authenticate('nope'), null)
  assert.equal(await auth.authenticate(undefined), null)
})

test('login: unknown email and wrong password are the same answer', async () => {
  const { auth } = await setup()
  assert.deepEqual(await auth.login('ghost@x.pt', PASSWORD, '1.1.1.1'), { ok: false, reason: 'invalid' })
  assert.deepEqual(await auth.login('admin@x.pt', 'wrong', '1.1.1.1'), { ok: false, reason: 'invalid' })
})

test('login: throttled after 5 failures per email, per ip, and frees after 15 minutes', async () => {
  const { auth, advance } = await setup()
  for (let i = 0; i < 5; i++) await auth.login('admin@x.pt', 'wrong', `9.9.9.${i}`)
  assert.equal((await auth.login('admin@x.pt', PASSWORD, '8.8.8.8')).reason, 'throttled') // right password, still blocked
  for (let i = 0; i < 5; i++) await auth.login(`u${i}@x.pt`, 'wrong', '7.7.7.7')
  assert.equal((await auth.login('admin@x.pt', PASSWORD, '7.7.7.7')).reason, 'throttled') // same ip, other email
  advance(15 * 60 + 1)
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '7.7.7.7')).ok)
})

test('login: success clears the email failures', async () => {
  const { auth } = await setup()
  for (let i = 0; i < 4; i++) await auth.login('admin@x.pt', 'wrong', `9.9.9.${i}`)
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '5.5.5.5')).ok)
  for (let i = 0; i < 4; i++) await auth.login('admin@x.pt', 'wrong', `6.6.6.${i}`)
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '5.5.5.5')).ok)
})

test('sessions: expire after 14 days, slide forward, die on logout', async () => {
  const { auth, advance, sqlite } = await setup()
  const { token } = await auth.login('admin@x.pt', PASSWORD, '1.1.1.1')
  advance(2 * 86400)
  assert.ok(await auth.authenticate(token))
  const exp = sqlite.prepare('SELECT expires_at FROM sessions').get().expires_at
  assert.equal(exp, 1_000_000 + 2 * 86400 + 14 * 86400) // slid
  advance(14 * 86400 + 1)
  assert.equal(await auth.authenticate(token), null)

  const b = (await auth.login('admin@x.pt', PASSWORD, '1.1.1.1')).token
  await auth.logout(b)
  assert.equal(await auth.authenticate(b), null)
})

test('the stored session id is a hash, not the cookie token', async () => {
  const { auth, sqlite } = await setup()
  const { token } = await auth.login('admin@x.pt', PASSWORD, '1.1.1.1')
  const id = sqlite.prepare('SELECT id FROM sessions').get().id
  assert.notEqual(id, token)
  assert.match(id, /^[0-9a-f]{64}$/)
})

test('changePassword: checks current + length, keeps this session, drops the others, clears the flag', async () => {
  const { auth } = await setup()
  const a = (await auth.login('owner@x.pt', PASSWORD, '1.1.1.1')).token
  const b = (await auth.login('owner@x.pt', PASSWORD, '1.1.1.2')).token
  const user = await auth.authenticate(a)
  assert.equal(await auth.changePassword(user, a, 'wrong', 'a-brand-new-password'), 'wrong_current')
  assert.equal(await auth.changePassword(user, a, PASSWORD, 'short'), 'too_short')
  assert.equal(await auth.changePassword(user, a, PASSWORD, 'a-brand-new-password'), 'ok')
  assert.ok(await auth.authenticate(a))
  assert.equal(await auth.authenticate(b), null)
  assert.equal((await auth.authenticate(a)).mustChangePassword, false)
  assert.ok(!(await auth.login('owner@x.pt', PASSWORD, '1.1.1.1')).ok)
  assert.ok((await auth.login('owner@x.pt', 'a-brand-new-password', '1.1.1.1')).ok)
})
