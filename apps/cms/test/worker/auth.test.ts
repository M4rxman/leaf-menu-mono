// The built CMS worker in workerd: auth routes under /admin/api, cookie attributes, CSRF, throttling, sessions in D1.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, test } from 'vitest'
import { PASSWORD } from './setup'

const ORIGIN = 'https://example.com' // production is always HTTPS
let ipSeq = 0
const newIp = () => `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`

interface Opts { method?: string, origin?: string | null, cookie?: string | null, ip?: string, body?: unknown }
function call(path: string, o: Opts = {}) {
  const method = o.method ?? 'GET'
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? newIp() }
  if (o.origin !== null && (o.origin !== undefined || method !== 'GET')) headers.origin = o.origin ?? ORIGIN
  if (o.cookie) headers.cookie = o.cookie
  if (o.body !== undefined) headers['content-type'] = 'application/json'
  return exports.default.fetch(`${ORIGIN}/admin/api${path}`, {
    method, headers, redirect: 'manual', body: o.body === undefined ? undefined : JSON.stringify(o.body)
  })
}
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? null
const login = (email: string, password = PASSWORD, ip?: string) => call('/auth/login', { method: 'POST', body: { email, password }, ip })
// Plan §8: every API error is exactly `{ "error": { "code", "message" } }`.
const errorCode = async (res: Response) => {
  const body = (await res.json()) as { error: { code: string, message: string } }
  expect(Object.keys(body)).toEqual(['error'])
  expect(typeof body.error.message).toBe('string')
  return body.error.code
}

async function signIn(email = 'admin@x.pt') {
  const res = await login(email)
  expect(res.status).toBe(204)
  return cookieOf(res)!
}

describe('CSRF origin check', () => {
  test.each([
    ['a foreign Origin', 'https://evil.example'],
    ['no Origin', null]
  ])('POST with %s -> 403, before any handler runs', async (_, origin) => {
    const res = await call('/auth/login', { method: 'POST', origin, body: { email: 'admin@x.pt', password: PASSWORD } })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('bad_origin')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  test('an unknown route is also refused', async () => {
    expect((await call('/nothing', { method: 'DELETE', origin: 'https://evil.example' })).status).toBe(403)
  })

  test('an unknown route with a good Origin is a plain 404 in the same error shape', async () => {
    const res = await call('/nothing', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('not_found')
  })

  test('GET needs no Origin', async () => {
    expect((await call('/auth/me')).status).toBe(401)
  })
})

describe('POST /auth/login', () => {
  test('sets a strict, HttpOnly, Secure __Host- cookie and stores only its hash', async () => {
    const res = await login('admin@x.pt')
    expect(res.status).toBe(204)
    const setCookie = res.headers.get('set-cookie')!
    expect(setCookie).toMatch(/^__Host-session=[\w-]{43};/)
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=1209600', 'Path=/']) expect(setCookie).toContain(attr)
    expect(setCookie).not.toContain('Domain')
    const token = cookieOf(res)!.split('=')[1]
    const rows = (await env.DB.prepare('SELECT id FROM sessions').all<{ id: string }>()).results
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]!.id).not.toBe(token)
  })

  test('unknown email and wrong password get the same status, code and message', async () => {
    const a = await login('ghost@x.pt')
    const b = await login('admin@x.pt', 'wrong password')
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(await errorCode(a)).toBe('invalid_credentials')
    expect(await errorCode(b)).toBe('invalid_credentials')
  })

  test('email is case-insensitive', async () => {
    expect((await login(' ADMIN@x.pt ')).status).toBe(204)
  })

  test.each([
    ['no body', undefined],
    ['numbers instead of strings', { email: 1, password: 2 }],
    ['missing password', { email: 'admin@x.pt' }],
    ['a huge password', { email: 'admin@x.pt', password: 'x'.repeat(5000) }]
  ])('%s -> 400 validation_failed', async (_, body) => {
    const res = await call('/auth/login', { method: 'POST', body })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
  })

  test('the 6th failure in 15 minutes -> 429, even with the right password; other emails are unaffected', async () => {
    for (let i = 0; i < 5; i++) expect((await login('admin@x.pt', 'wrong password')).status).toBe(401)
    const blocked = await login('admin@x.pt')
    expect(blocked.status).toBe(429)
    expect(await errorCode(blocked)).toBe('rate_limited')
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect((await login('owner@x.pt')).status).toBe(204)
  })

  test('parallel guesses cannot get past the throttle', async () => {
    const ip = newIp()
    const statuses = (await Promise.all(Array.from({ length: 20 }, () => login('admin@x.pt', 'wrong password', ip)))).map(r => r.status)
    expect(statuses.filter(s => s === 429).length).toBeGreaterThanOrEqual(14)
    expect(statuses.filter(s => s === 401).length).toBeLessThanOrEqual(6)
  })

  test('failures from one IP block that IP for other emails too', async () => {
    const ip = newIp()
    for (let i = 0; i < 5; i++) await login(`ghost${i}@x.pt`, 'wrong password', ip)
    expect((await login('admin@x.pt', PASSWORD, ip)).status).toBe(429)
    expect((await login('admin@x.pt', PASSWORD, newIp())).status).toBe(204)
  })
})

describe('GET /auth/me and POST /auth/logout', () => {
  test('me returns the user without the password hash; the owner is tied to a venue', async () => {
    const res = await call('/auth/me', { cookie: await signIn('owner@x.pt') })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 2, email: 'owner@x.pt', role: 'owner', restaurantId: 1, mustChangePassword: true })
  })

  test.each([
    ['a made-up token', '__Host-session=nope'],
    ['an empty cookie', '__Host-session=']
  ])('%s -> 401', async (_, cookie) => {
    expect((await call('/auth/me', { cookie })).status).toBe(401)
  })

  test('an expired session -> 401', async () => {
    const cookie = await signIn()
    await env.DB.prepare('UPDATE sessions SET expires_at = 1').run()
    expect((await call('/auth/me', { cookie })).status).toBe(401)
  })

  test('logout deletes the session row and clears the cookie', async () => {
    const cookie = await signIn()
    const res = await call('/auth/logout', { method: 'POST', cookie })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-session=;.*(Max-Age=0|Expires=)/)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>())!.n).toBe(0)
    expect((await call('/auth/me', { cookie })).status).toBe(401)
  })

  test('logout without a session is fine', async () => {
    expect((await call('/auth/logout', { method: 'POST' })).status).toBe(204)
  })
})

describe('POST /auth/password', () => {
  const change = (cookie: string | null, body: unknown) => call('/auth/password', { method: 'POST', cookie, body })

  test('needs a session', async () => {
    expect((await change(null, { current: PASSWORD, next: 'a-brand-new-password' })).status).toBe(401)
  })

  test('wrong current password -> 422; too short -> 422; nothing changes', async () => {
    const cookie = await signIn('owner@x.pt')
    const wrong = await change(cookie, { current: 'nope', next: 'a-brand-new-password' })
    expect(wrong.status).toBe(422)
    expect(await errorCode(wrong)).toBe('wrong_password')
    const short = await change(cookie, { current: PASSWORD, next: 'short' })
    expect(short.status).toBe(422)
    expect(await errorCode(short)).toBe('password_too_short')
    expect((await login('owner@x.pt')).status).toBe(204) // old password still works
  })

  test('changing it clears mustChangePassword, keeps this session, ends the others, and swaps the password', async () => {
    const mine = await signIn('owner@x.pt')
    const other = await signIn('owner@x.pt')
    expect((await change(mine, { current: PASSWORD, next: 'a-brand-new-password' })).status).toBe(204)
    expect(((await (await call('/auth/me', { cookie: mine })).json()) as { mustChangePassword: boolean }).mustChangePassword).toBe(false)
    expect((await call('/auth/me', { cookie: other })).status).toBe(401)
    expect((await login('owner@x.pt', PASSWORD)).status).toBe(401)
    expect((await login('owner@x.pt', 'a-brand-new-password')).status).toBe(204)
  })

  test('guessing the current password is throttled: the 6th wrong guess -> 429, even with the right one', async () => {
    const cookie = await signIn('owner@x.pt')
    for (let i = 0; i < 5; i++) expect((await change(cookie, { current: `guess ${i}`, next: 'a-brand-new-password' })).status).toBe(422)
    const blocked = await change(cookie, { current: PASSWORD, next: 'a-brand-new-password' })
    expect(blocked.status).toBe(429)
    expect(await errorCode(blocked)).toBe('rate_limited')
  })

  test('a cross-origin change is refused', async () => {
    const cookie = await signIn('owner@x.pt')
    const res = await call('/auth/password', { method: 'POST', cookie, origin: 'https://evil.example', body: { current: PASSWORD, next: 'a-brand-new-password' } })
    expect(res.status).toBe(403)
  })
})

describe('hostile input', () => {
  test('case and whitespace variants of one email share one throttle budget', async () => {
    for (const email of ['ADMIN@x.pt', ' admin@x.pt', 'Admin@X.pt ', 'admin@X.PT', ' ADMIN@x.pt ']) {
      expect((await login(email, 'wrong password')).status).toBe(401)
    }
    expect((await login('admin@x.PT ')).status).toBe(429)
  })

  test('SQL in the email is just a wrong email: 401, users untouched', async () => {
    for (const email of ["' OR 1=1 --", "admin@x.pt'; DROP TABLE users; --", "x' UNION SELECT password_hash FROM users --"]) {
      expect((await login(email, PASSWORD)).status).toBe(401)
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())!.n).toBe(2)
  })

  test('Origin "null" (sandboxed iframe, file://) is refused like any foreign origin', async () => {
    expect((await call('/auth/login', { method: 'POST', origin: 'null', body: { email: 'admin@x.pt', password: PASSWORD } })).status).toBe(403)
  })

  test('a cross-origin logout is refused and the session survives', async () => {
    const cookie = await signIn()
    expect((await call('/auth/logout', { method: 'POST', cookie, origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/auth/me', { cookie })).status).toBe(200)
  })

  test('only the __Host- cookie counts: the same token under another name is ignored', async () => {
    const cookie = await signIn()
    expect((await call('/auth/me', { cookie: cookie.replace('__Host-session', 'session') })).status).toBe(401)
  })

  test('a session token is never accepted back after logout, and each login gets a new one', async () => {
    const first = await signIn()
    const second = await signIn()
    expect(second).not.toBe(first)
    await call('/auth/logout', { method: 'POST', cookie: first })
    expect((await call('/auth/me', { cookie: first })).status).toBe(401)
    expect((await call('/auth/me', { cookie: second })).status).toBe(200)
  })

  test.each([
    ['a non-string new password', { current: PASSWORD, next: 123456789012 }],
    ['an array', { current: PASSWORD, next: ['a-brand-new-password'] }],
    ['a 1001-character new password', { current: PASSWORD, next: 'x'.repeat(1001) }]
  ])('password change with %s -> 400 and nothing changes', async (_, body) => {
    const cookie = await signIn('owner@x.pt')
    const res = await call('/auth/password', { method: 'POST', cookie, body })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('validation_failed')
    expect((await login('owner@x.pt')).status).toBe(204)
  })

  test('passwords are not trimmed or normalised: spaces and non-Latin text round-trip exactly', async () => {
    const cookie = await signIn('owner@x.pt')
    const next = '  пароль 密码 🔑 with spaces  '
    expect((await call('/auth/password', { method: 'POST', cookie, body: { current: PASSWORD, next } })).status).toBe(204)
    expect((await login('owner@x.pt', next)).status).toBe(204)
    expect((await login('owner@x.pt', next.trim())).status).toBe(401)
  })
})
