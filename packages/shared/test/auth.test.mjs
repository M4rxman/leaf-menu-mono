import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthService } from '../src/domain/auth-service.ts'
import { DUMMY_HASH, PBKDF2_ITERATIONS, hashPassword, verifyPassword } from '../src/domain/password.ts'
import { D1AuthStore } from '../src/infra/d1-auth-store.ts'
import { nodeSqliteDb, seededSqlite } from './helpers/node-sqlite-db.mjs'

const ITER = 1000 // fast hashes for tests; the stored string carries the count
const PASSWORD = 'correct horse battery'
const PEPPER = 'test-pepper'

async function setup(iterations = ITER) {
  const sqlite = seededSqlite()
  const hash = await hashPassword(PASSWORD, PEPPER, iterations)
  sqlite.prepare("INSERT INTO users (email, password_hash, role) VALUES ('admin@x.pt', ?, 'admin')").run(hash)
  sqlite.prepare("INSERT INTO users (email, password_hash, role, restaurant_id, must_change_password) VALUES ('Owner@x.pt', ?, 'owner', 1, 1)").run(hash)
  let t = 1_000_000
  const store = new D1AuthStore(nodeSqliteDb(sqlite))
  return { sqlite, store, auth: new AuthService(store, PEPPER, () => t), advance: (s) => { t += s } }
}

test('password: round trip, wrong password, malformed hash', async () => {
  const h = await hashPassword('secret-secret', PEPPER, ITER)
  assert.ok(await verifyPassword('secret-secret', PEPPER, h))
  assert.ok(!await verifyPassword('secret-secreT', PEPPER, h))
  assert.ok(!await verifyPassword('x', PEPPER, 'garbage'))
  assert.ok(!await verifyPassword('x', PEPPER, 'md5$1$a$b'))
})

test('password: the pepper is part of the hash (a dump without the secret is useless), and old un-peppered hashes are refused', async () => {
  const h = await hashPassword('secret-secret', PEPPER, ITER)
  assert.match(h, /^pbkdf2-sha256-p1\$1000\$/)
  assert.ok(!await verifyPassword('secret-secret', 'another-pepper', h))
  assert.ok(!await verifyPassword('secret-secret', PEPPER, h.replace('pbkdf2-sha256-p1', 'pbkdf2-sha256')))
})

test('DUMMY_HASH is well-formed and uses the real iteration count (so an unknown email costs one PBKDF2 run)', async () => {
  const [scheme, iter, salt, hash] = DUMMY_HASH.split('$')
  assert.equal(scheme, 'pbkdf2-sha256-p1')
  assert.equal(Number(iter), PBKDF2_ITERATIONS)
  assert.equal(atob(salt).length, 16)
  assert.equal(atob(hash).length, 32)
  assert.equal(await verifyPassword('anything', PEPPER, DUMMY_HASH), false) // must not throw
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

test('login: unknown email takes about as long as a wrong password, with a fresh service per call as in production', async () => {
  const { sqlite } = await setup(PBKDF2_ITERATIONS)
  const store = new D1AuthStore(nodeSqliteDb(sqlite))
  const time = async (email, i) => {
    const t0 = performance.now()
    await new AuthService(store, PEPPER).login(email, 'wrong password', `10.0.0.${i}`) // own ip: stay under the throttle
    return performance.now() - t0
  }
  const fastest = async (email, base) => {
    const ms = []
    for (let i = 0; i < 4; i++) ms.push(await time(email, base + i)) // + warm-up = 5 failures: the email throttle trips on the 6th
    return Math.min(...ms) // fastest run: least scheduler noise
  }
  await time('admin@x.pt', 99) // warm up
  const known = await fastest('admin@x.pt', 0)
  const unknown = await fastest('ghost@x.pt', 10)
  assert.ok(unknown / known > 0.7 && unknown / known < 1.3, `known ${known.toFixed(1)} ms, unknown ${unknown.toFixed(1)} ms`)
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

test('login: parallel guesses cannot get past the throttle', async () => {
  const { auth } = await setup()
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
    auth.login('admin@x.pt', i === 40 ? PASSWORD : 'wrong', '5.5.5.5')))
  const count = reason => results.filter(r => !r.ok && r.reason === reason).length
  assert.ok(count('invalid') <= 5, `${count('invalid')} requests got to check a password`)
  assert.ok(count('throttled') >= 44)
  assert.ok(results.filter(r => r.ok).length <= 1)
})

test('login: success clears the email failures and does not count against the ip', async () => {
  const { auth } = await setup()
  for (let i = 0; i < 4; i++) await auth.login('admin@x.pt', 'wrong', `9.9.9.${i}`)
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '5.5.5.5')).ok)
  for (let i = 0; i < 4; i++) await auth.login('admin@x.pt', 'wrong', `6.6.6.${i}`)
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '5.5.5.5')).ok)

  // 4 failures + a success + 1 failure from one ip is 5 failures, not 6
  for (let i = 0; i < 4; i++) await auth.login(`g${i}@x.pt`, 'wrong', '4.4.4.4')
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '4.4.4.4')).ok)
  assert.equal((await auth.login('g9@x.pt', 'wrong', '4.4.4.4')).reason, 'invalid')
})

test('login: without an ip address only the email is throttled (no shared empty key)', async () => {
  const { auth, sqlite } = await setup()
  for (let i = 0; i < 6; i++) await auth.login(`u${i}@x.pt`, 'wrong', '')
  assert.ok((await auth.login('admin@x.pt', PASSWORD, '')).ok)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE key LIKE 'ip:%'").get().n, 0)
})

test('login: old failure rows are deleted, the table does not grow forever', async () => {
  const { auth, advance, sqlite } = await setup()
  for (let i = 0; i < 3; i++) await auth.login(`u${i}@x.pt`, 'wrong', `3.3.3.${i}`)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM login_failures').get().n, 6)
  advance(15 * 60 + 1)
  await auth.login('u9@x.pt', 'wrong', '3.3.3.9')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM login_failures').get().n, 2)
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

test('changePassword: guessing the current password is throttled like a login', async () => {
  const { auth } = await setup()
  const token = (await auth.login('owner@x.pt', PASSWORD, '1.1.1.1')).token
  const user = await auth.authenticate(token)
  for (let i = 0; i < 5; i++) assert.equal(await auth.changePassword(user, token, `guess ${i}`, 'a-brand-new-password'), 'wrong_current')
  assert.equal(await auth.changePassword(user, token, PASSWORD, 'a-brand-new-password'), 'throttled')
})
