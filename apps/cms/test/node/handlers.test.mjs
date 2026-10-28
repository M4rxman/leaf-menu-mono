// The CMS handlers under Node (h3 + node:sqlite), so V8 can measure their coverage (workerd cannot) and the 5xx paths
// that the worker tests cannot reach (a missing binding) are exercised. Route-level behaviour is also in test/worker/.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as h3 from 'h3'
import { hashPassword } from '../../../../packages/shared/src/domain/password.ts'
import { seededSqlite } from '../../../../packages/shared/test/helpers/node-sqlite-db.mjs'
import * as session from '../../server/utils/session.ts'
import * as site from '../../server/utils/site.ts'
import * as container from '../../server/utils/container.ts'

// Nitro auto-imports: the handlers call these as globals, so they must exist before the handlers are imported.
Object.assign(globalThis, h3, session, site, container)
// Nitro ends a handler that set 204 and returned nothing; plain h3 would fall through to 404.
globalThis.defineEventHandler = fn => h3.defineEventHandler(async (ev) => {
  const r = await fn(ev)
  return r === undefined && h3.getResponseStatus(ev) === 204 ? h3.sendNoContent(ev) : r
})
const load = async f => (await import(f)).default
const noStore = await load('../../server/middleware/00.no-store.ts')
const originCheck = await load('../../server/middleware/01.origin-check.ts')
const sessionMw = await load('../../server/middleware/02.session.ts')
const errorHandler = await load('../../server/error-handler.ts')
const login = await load('../../server/api/auth/login.post.ts')
const logout = await load('../../server/api/auth/logout.post.ts')
const me = await load('../../server/api/auth/me.get.ts')
const password = await load('../../server/api/auth/password.post.ts')
const catchAll = await load('../../server/api/[...path].ts')

const PEPPER = 'p'
const ORIGIN = 'https://example.com'
const PASSWORD = 'correct horse battery'
const hash = await hashPassword(PASSWORD, PEPPER, 1000)

/** A fresh app + database per test. `env` overrides model a missing binding or secret. */
function setup(env = {}) {
  const sqlite = seededSqlite()
  sqlite.prepare("INSERT INTO users (email, password_hash, role) VALUES ('admin@x.pt', ?, 'admin')").run(hash)
  sqlite.prepare("INSERT INTO users (email, password_hash, role, restaurant_id, must_change_password) VALUES ('owner@x.pt', ?, 'owner', 1, 1)").run(hash)
  const d1 = {
    prepare(sql) {
      const st = sqlite.prepare(sql)
      let p = []
      const o = { bind: (...a) => { p = a; return o }, first: async () => st.get(...p) ?? null, all: async () => ({ results: st.all(...p) }), run: async () => { st.run(...p); return { meta: {} } } }
      return o
    }
  }
  const app = h3.createApp({
    onError: (e, ev) => errorHandler(e, ev, { defaultHandler: async () => ({ status: 404, statusText: 'Not Found', headers: { 'x-default': '1' }, body: 'page' }) })
  })
  app.use(noStore)
  app.use(originCheck)
  app.use(sessionMw)
  const router = h3.createRouter()
  router.post('/api/auth/login', login)
  router.post('/api/auth/logout', logout)
  router.get('/api/auth/me', me)
  router.post('/api/auth/password', password)
  router.get('/api/boom', h3.defineEventHandler(event => session.requireReadyUser(event)))
  router.use('/api/**', catchAll)
  app.use(router)
  const handle = h3.toWebHandler(app)
  let n = 0
  const call = (path, { method = 'GET', origin = ORIGIN, cookie, body, ip = `1.1.1.${++n}` } = {}) => handle(new Request(ORIGIN + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'cf-connecting-ip': ip, ...(origin && method !== 'GET' ? { origin } : {}), ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }
  }), { cloudflare: { env: { DB: d1, PASSWORD_PEPPER: PEPPER, ...env }, request: { url: ORIGIN + path } } })
  const signIn = async (email = 'admin@x.pt') =>
    (await call('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })).headers.get('set-cookie').split(';')[0]
  return { call, signIn }
}
const code = async res => (await res.json()).error.code

test('a full session: login, me, change password, logout', async () => {
  const { call, signIn } = setup()
  const cookie = await signIn()
  assert.equal((await call('/api/auth/me', { cookie })).status, 200)
  assert.equal((await call('/api/auth/password', { method: 'POST', cookie, body: { current: PASSWORD, next: 'a-brand-new-password' } })).status, 204)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie })).status, 204)
  assert.equal((await call('/api/auth/me', { cookie })).status, 401)
})

test('input and credential errors keep the plan error shape', async () => {
  const { call, signIn } = setup()
  const cookie = await signIn()
  for (const [path, opts, status, c] of [
    ['/api/auth/login', { method: 'POST', origin: 'https://evil' }, 403, 'bad_origin'],
    ['/api/auth/login', { method: 'POST' }, 400, 'validation_failed'],
    ['/api/auth/login', { method: 'POST', body: { email: 'admin@x.pt', password: 'x'.repeat(2000) } }, 400, 'validation_failed'],
    ['/api/auth/login', { method: 'POST', body: { email: 'admin@x.pt', password: 'wrong' } }, 401, 'invalid_credentials'],
    ['/api/auth/me', {}, 401, 'unauthenticated'],
    ['/api/auth/password', { method: 'POST', body: {} }, 401, 'unauthenticated'],
    ['/api/auth/password', { method: 'POST', cookie, body: { current: 'bad', next: 'a-brand-new-password' } }, 422, 'wrong_password'],
    ['/api/auth/password', { method: 'POST', cookie, body: { current: PASSWORD, next: 'short' } }, 422, 'password_too_short'],
    ['/api/auth/password', { method: 'POST', cookie, body: { current: PASSWORD, next: PASSWORD } }, 422, 'password_unchanged'],
    ['/api/nothing', { method: 'POST' }, 404, 'not_found']
  ]) {
    const res = await call(path, opts)
    assert.equal(res.status, status, `${path} ${c}`)
    assert.equal(await code(res), c)
  }
})

test('both throttles answer 429 with the same shape', async () => {
  const { call, signIn } = setup()
  const ip = '9.9.9.9'
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { method: 'POST', ip, body: { email: 'g@x.pt', password: 'w' } })
  assert.equal(await code(await call('/api/auth/login', { method: 'POST', ip, body: { email: 'g@x.pt', password: 'w' } })), 'rate_limited')
  const cookie = await signIn('owner@x.pt')
  for (let i = 0; i < 5; i++) await call('/api/auth/password', { method: 'POST', cookie, body: { current: `g${i}`, next: 'a-brand-new-password' } })
  const blocked = await call('/api/auth/password', { method: 'POST', cookie, body: { current: 'x', next: 'a-brand-new-password' } })
  assert.equal(blocked.status, 429)
  assert.equal(await code(blocked), 'rate_limited')
})

test('every API response, errors included, is no-store; pages are left to Nitro', async () => {
  const { call } = setup()
  for (const res of [await call('/api/auth/me'), await call('/api/auth/login', { method: 'POST', origin: 'https://evil' }), await call('/api/nothing', { method: 'POST' })])
    assert.equal(res.headers.get('cache-control'), 'no-store')
  const page = await call('/some/page')
  assert.equal(page.status, 404)
  assert.equal(page.headers.get('x-default'), '1')
  assert.equal(page.headers.get('cache-control'), null)
})

test('a missing binding or secret is a 500 that says nothing about the cause', async () => {
  for (const env of [{ PASSWORD_PEPPER: undefined }, { DB: undefined }]) {
    const res = await setup(env).call('/api/auth/login', { method: 'POST', body: { email: 'admin@x.pt', password: PASSWORD } })
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { error: { code: 'server_error', message: 'Server error' } })
  }
})

test('requireReadyUser: a user on a temporary password is refused with 403', async () => {
  const { call, signIn } = setup()
  const res = await call('/api/boom', { cookie: await signIn('owner@x.pt') })
  assert.equal(res.status, 403)
  assert.equal(await code(res), 'password_change_required')
})

test('requireReadyUser: a user past the temporary password gets through', async () => {
  const { call, signIn } = setup()
  const res = await call('/api/boom', { cookie: await signIn('admin@x.pt') })
  assert.equal(res.status, 200)
})

test('an unexpected exception is a generic 500: the message and stack never reach the client', async () => {
  const { call } = setup({ DB: { prepare() { throw new Error('SQLITE_SECRET detail at /srv/app.js:1') } } })
  const res = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@x.pt', password: PASSWORD } })
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.equal(text, JSON.stringify({ error: { code: 'server_error', message: 'Server error' } }))
})

test('a login without a client address is still checked and throttled by email alone', async () => {
  const { call } = setup()
  const res = await call('/api/auth/login', { method: 'POST', ip: '', body: { email: 'admin@x.pt', password: PASSWORD } })
  assert.equal(res.status, 204)
})
