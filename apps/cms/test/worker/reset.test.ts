// Self-service password reset in workerd with real D1. The mailer is not configured here (no EMAIL binding), so tests
// plant a link by writing the token's hash themselves, exactly what the service stores.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, test } from 'vitest'
import { PASSWORD } from './setup'

const ORIGIN = 'https://example.com'
let ipSeq = 0
const newIp = () => `10.7.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`
const NEW = 'a brand new password'

interface Opts { origin?: string | null, ip?: string, cookie?: string, body?: unknown }
function post(path: string, o: Opts = {}) {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? newIp(), 'content-type': 'application/json' }
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN
  if (o.cookie) headers.cookie = o.cookie
  return exports.default.fetch(`${ORIGIN}/admin/api${path}`, { method: 'POST', headers, body: JSON.stringify(o.body ?? {}) })
}
const forgot = (email: string, ip?: string) => post('/auth/forgot', { body: { email }, ip })
const reset = (token: string, next = NEW, ip?: string) => post('/auth/reset', { body: { token, next }, ip })
const login = (email: string, password: string, ip?: string) => post('/auth/login', { body: { email, password }, ip })
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .map(b => b.toString(16).padStart(2, '0')).join('')
const now = () => Math.floor(Date.now() / 1000)

/** Plants a live link for a user and returns its token. */
async function plant(userId: number, ttl = 1800) {
  const token = `test-token-${userId}-${Math.random().toString(36).slice(2)}`
  await env.DB.prepare('INSERT OR REPLACE INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)')
    .bind(userId, await sha256(token), now() + ttl).run()
  return token
}
const resetRows = async () => (await env.DB.prepare('SELECT user_id, token_hash, used FROM password_resets').all<{ user_id: number, token_hash: string, used: number }>()).results

describe('POST /auth/forgot', () => {
  test('known and unknown emails get the same status, headers and (empty) body', async () => {
    const known = await forgot('owner@x.pt')
    const unknown = await forgot('ghost@x.pt')
    expect(known.status).toBe(204)
    expect(unknown.status).toBe(204)
    expect(await known.text()).toBe(await unknown.text())
    const names = (r: Response) => [...r.headers.keys()].filter(k => !['date', 'content-length'].includes(k)).sort()
    expect(names(known)).toEqual(names(unknown))
  })

  test('stores a hash for a known email only, one live link per user', async () => {
    await forgot('ghost@x.pt')
    expect(await resetRows()).toHaveLength(0)
    await forgot('owner@x.pt')
    const first = await resetRows()
    expect(first).toHaveLength(1)
    expect(first[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    await forgot('owner@x.pt')
    const second = await resetRows()
    expect(second).toHaveLength(1)
    expect(second[0]!.token_hash).not.toBe(first[0]!.token_hash)
  })

  test('response time does not tell known from unknown emails (medians within 20%)', async () => {
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
    const time = async (email: string) => {
      await env.DB.prepare('DELETE FROM login_failures').run() // stay under the throttle; it is not what is measured
      const t = performance.now()
      await forgot(email)
      return performance.now() - t
    }
    for (let i = 0; i < 3; i++) await time('owner@x.pt') // warm up
    const known: number[] = []
    const unknown: number[] = []
    for (let i = 0; i < 15; i++) {
      known.push(await time('owner@x.pt'))
      unknown.push(await time(`ghost${i}@x.pt`))
    }
    const [k, u] = [median(known), median(unknown)]
    expect(Math.abs(k - u) / Math.max(k, u)).toBeLessThan(0.2)
  })

  test('throttled per email (6th request -> 429) and per IP, with unknown emails counting too', async () => {
    for (let i = 0; i < 5; i++) expect((await forgot('owner@x.pt')).status).toBe(204)
    const blocked = await forgot('owner@x.pt')
    expect(blocked.status).toBe(429)
    expect(await errorCode(blocked)).toBe('rate_limited')
    const ip = newIp()
    for (let i = 0; i < 5; i++) expect((await forgot(`ghost${i}@x.pt`, ip)).status).toBe(204)
    expect((await forgot('admin@x.pt', ip)).status).toBe(429)
  })

  test('does not lock the account out of logging in', async () => {
    for (let i = 0; i < 6; i++) await forgot('admin@x.pt')
    expect((await login('admin@x.pt', PASSWORD)).status).toBe(204)
  })

  test('the Origin check applies, and bad bodies are 400', async () => {
    const bad = await post('/auth/forgot', { origin: 'https://evil.example', body: { email: 'owner@x.pt' } })
    expect(bad.status).toBe(403)
    expect(await resetRows()).toHaveLength(0)
    expect((await post('/auth/forgot', { origin: null, body: { email: 'owner@x.pt' } })).status).toBe(403)
    const res = await post('/auth/forgot', { body: { email: 5 } })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/reset', () => {
  test('sets the password, ends all sessions, clears the temporary-password flag, clears the cookie', async () => {
    const signedIn = await login('owner@x.pt', PASSWORD)
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0]!
    const token = await plant(2)
    const res = await reset(token, NEW, undefined)
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-session=;/)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>())!.n).toBe(0)
    const me = await exports.default.fetch(`${ORIGIN}/admin/api/auth/me`, { headers: { cookie } })
    expect(me.status).toBe(401)
    expect((await login('owner@x.pt', PASSWORD)).status).toBe(401)
    const fresh = await login('owner@x.pt', NEW)
    expect(fresh.status).toBe(204)
    const flag = await env.DB.prepare('SELECT must_change_password AS m FROM users WHERE id = 2').first<{ m: number }>()
    expect(flag!.m).toBe(0)
  })

  test('a link is single-use: the replay is 410 reset_link_invalid and changes nothing', async () => {
    const token = await plant(2)
    expect((await reset(token)).status).toBe(204)
    const replay = await reset(token, 'another new password')
    expect(replay.status).toBe(410)
    expect(await errorCode(replay)).toBe('reset_link_invalid')
    expect((await login('owner@x.pt', NEW)).status).toBe(204)
  })

  test('expired, superseded, unknown and malformed tokens all get the same 410', async () => {
    const expired = await plant(2, -1)
    const old = await plant(1)
    await plant(1) // supersedes `old`
    for (const t of [expired, old, 'nope', '', 'x'.repeat(900)]) {
      const res = await reset(t)
      expect(res.status).toBe(410)
      expect(await errorCode(res)).toBe('reset_link_invalid')
    }
  })

  test('a token only changes its own user', async () => {
    const token = await plant(2)
    expect((await reset(token)).status).toBe(204)
    expect((await login('admin@x.pt', PASSWORD)).status).toBe(204)
  })

  test('a too-short password is 422 and keeps the link alive', async () => {
    const token = await plant(2)
    const short = await reset(token, 'short')
    expect(short.status).toBe(422)
    expect(await errorCode(short)).toBe('password_too_short')
    expect((await reset(token)).status).toBe(204)
  })

  test('guessing is throttled per IP, and the Origin check applies', async () => {
    const ip = newIp()
    for (let i = 0; i < 5; i++) expect((await reset('guess', NEW, ip)).status).toBe(410)
    const blocked = await reset('guess', NEW, ip)
    expect(blocked.status).toBe(429)
    expect((await post('/auth/reset', { origin: 'https://evil.example', body: { token: 'x', next: NEW } })).status).toBe(403)
  })
})
