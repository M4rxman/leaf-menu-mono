// The built Nitro worker in workerd: handlers, middleware, cookie attributes and the real rate-limit binding.
import { env, exports } from 'cloudflare:workers'
import { verifyDevice } from '@chilly/shared/domain/device'
import { describe, expect, test } from 'vitest'

const ORIGIN = 'https://example.com' // production is always HTTPS
let ipSeq = 0
const runId = 1 + Math.floor(Math.random() * 250)
/**
 * Each test gets its own client IP, so the rate-limit budget of one test never leaks into another.
 * The prefix is random per run, so a quick re-run (watch mode) inside the 60 s window doesn't reuse an exhausted IP.
 */
const newIp = () => `10.${runId}.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`

interface Opts { method?: string, origin?: string | null, cookie?: string | null, ip?: string, body?: Record<string, string>, headers?: Record<string, string>, base?: string }
function call(path: string, o: Opts = {}) {
  const base = o.base ?? ORIGIN
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? newIp(), ...o.headers }
  if (o.origin !== null && (o.origin !== undefined || (o.method ?? 'GET') !== 'GET')) headers.origin = o.origin ?? base
  if (o.cookie) headers.cookie = o.cookie
  if (o.body) headers['content-type'] = 'application/x-www-form-urlencoded'
  return exports.default.fetch(base + path, {
    method: o.method ?? 'GET', headers, redirect: 'manual', body: o.body ? new URLSearchParams(o.body).toString() : undefined
  })
}
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? null
const likesIn = async (id: number) => (await env.DB.prepare('SELECT likes FROM dishes WHERE id = ?').bind(id).first<{ likes: number }>())!.likes

/** Likes dish 7 as a new device; returns the cookie to reuse. */
async function likeAsNewDevice(id = 7) {
  const res = await call(`/api/likes/${id}`, { method: 'PUT' })
  expect(res.status).toBe(200)
  return cookieOf(res)!
}

describe('PUT /api/likes/{id}', () => {
  test('likes, answers with the new count, and sets a signed HttpOnly cookie', async () => {
    const res = await call('/api/likes/7', { method: 'PUT' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ dishId: 7, liked: true, count: 1 })
    const setCookie = res.headers.get('set-cookie')!
    expect(setCookie).toMatch(/^chilly_device=[0-9a-f-]{36}\.[\w-]+;/)
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=31536000', 'Path=/']) expect(setCookie).toContain(attr)
    const id = decodeURIComponent(cookieOf(res)!.split('=')[1])
    expect(await verifyDevice(id, 'test-device-secret')).toMatch(/^[0-9a-f-]{36}$/)
    expect(await likesIn(7)).toBe(1)
  })

  test('over plain HTTP (phone testing on the LAN) the cookie has no Secure flag, so the browser keeps it', async () => {
    const res = await call('/api/likes/7', { method: 'PUT', base: 'http://192.168.1.20:8787' })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')!
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).not.toContain('Secure')
  })

  test('with the cookie again: same count, no new cookie (retry is idempotent)', async () => {
    const cookie = await likeAsNewDevice()
    const again = await call('/api/likes/7', { method: 'PUT', cookie })
    expect(await again.json()).toEqual({ dishId: 7, liked: true, count: 1 })
    expect(again.headers.get('set-cookie')).toBeNull()
  })

  test('two devices count separately', async () => {
    await likeAsNewDevice()
    await likeAsNewDevice()
    expect(await likesIn(7)).toBe(2)
  })

  test('a tampered or foreign-secret cookie is treated as no cookie: a new device is issued', async () => {
    const cookie = await likeAsNewDevice()
    const forged = cookie.replace(/.$/, c => (c === 'A' ? 'B' : 'A'))
    const res = await call('/api/likes/7', { method: 'PUT', cookie: forged })
    expect(res.status).toBe(200)
    expect(cookieOf(res)).not.toBe(forged)
    expect(await likesIn(7)).toBe(2)
  })

  test.each(['9999', '0', '-1', '1e1', '0x7', '007', 'abc', '7.5'])('dish id %s: 404, no cookie, nothing stored', async (id) => {
    const res = await call(`/api/likes/${id}`, { method: 'PUT' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found' } })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM likes').first<{ n: number }>())!.n).toBe(0)
  })

  test('hidden dish, deleted dish and hidden category: 404 and no cookie; sold-out dish can be liked', async () => {
    await env.DB.batch([
      env.DB.prepare('UPDATE dishes SET is_visible = 0 WHERE id = 1'),
      env.DB.prepare("UPDATE dishes SET deleted_at = datetime('now') WHERE id = 2"),
      env.DB.prepare('UPDATE categories SET is_visible = 0 WHERE id = (SELECT category_id FROM dishes WHERE id = 4)'),
      env.DB.prepare('UPDATE dishes SET is_sold_out = 1 WHERE id = 3')
    ])
    for (const id of [1, 2, 4]) {
      const res = await call(`/api/likes/${id}`, { method: 'PUT' })
      expect([id, res.status, res.headers.get('set-cookie')]).toEqual([id, 404, null])
    }
    expect((await call('/api/likes/3', { method: 'PUT' })).status).toBe(200)
  })

  test("another venue's dish is likeable under its own slug only (no leak through the menu of the first)", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO restaurants (id, slug, qr_code, default_lang) VALUES (2, 'other', 'zz9zz9', 'en')"),
      env.DB.prepare('INSERT INTO categories (id, restaurant_id, position) VALUES (50, 2, 10)'),
      env.DB.prepare('INSERT INTO dishes (id, restaurant_id, category_id, position, price_cents) VALUES (100, 2, 50, 10, 900)')
    ])
    const cookie = await likeAsNewDevice(100)
    expect(await (await call('/api/r/demo/likes', { cookie })).json()).toMatchObject({ liked: [] })
    expect(await (await call('/api/r/other/likes', { cookie })).json()).toMatchObject({ liked: [100] })
  })
})

describe('DELETE /api/likes/{id}', () => {
  test('takes the like back; twice is fine', async () => {
    const cookie = await likeAsNewDevice()
    const first = await call('/api/likes/7', { method: 'DELETE', cookie })
    expect(await first.json()).toEqual({ dishId: 7, liked: false, count: 0 })
    expect(first.headers.get('set-cookie')).toBeNull()
    expect(await (await call('/api/likes/7', { method: 'DELETE', cookie })).json()).toEqual({ dishId: 7, liked: false, count: 0 })
  })

  test("without a cookie it changes nothing and never issues one (another device's like stays)", async () => {
    await likeAsNewDevice()
    const res = await call('/api/likes/7', { method: 'DELETE' })
    expect(await res.json()).toEqual({ dishId: 7, liked: false, count: 1 })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('CSRF: Origin check on every non-GET request', () => {
  test.each([['missing', null], ['foreign', 'https://evil.example'], ['other scheme', 'http://example.com'], ['null', 'null'], ['other port', 'https://example.com:8443']])('%s Origin: 403 and nothing happens', async (_n, origin) => {
    for (const method of ['PUT', 'DELETE', 'POST']) {
      const res = await call('/api/likes/7', { method, origin, body: method === 'POST' ? { liked: '1', lang: 'pt' } : undefined })
      expect([method, res.status, res.headers.get('set-cookie')]).toEqual([method, 403, null])
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM likes').first<{ n: number }>())!.n).toBe(0)
  })

  test('reads never need an Origin', async () => {
    expect((await call('/api/r/demo/likes')).status).toBe(200)
    expect((await call('/r/demo/pt')).status).toBe(200)
  })
})

describe('rate limit: 10 like requests per minute per IP and dish', () => {
  test('the 11th request gets 429 with the documented body; no cookie for a refused first request', async () => {
    const ip = newIp()
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push((await call('/api/likes/7', { method: 'PUT', ip })).status)
    expect(codes).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429, 429])
    const refused = await call('/api/likes/7', { method: 'PUT', ip })
    expect(await refused.json()).toEqual({ error: { code: 'rate_limited' } })
    const fresh = await call('/api/likes/7', { method: 'PUT', ip })
    expect(fresh.headers.get('set-cookie')).toBeNull() // a refused request must not hand out a device
  })

  test('another dish and another IP each have their own budget', async () => {
    const ip = newIp()
    for (let i = 0; i < 11; i++) await call('/api/likes/7', { method: 'PUT', ip })
    expect((await call('/api/likes/7', { method: 'PUT', ip })).status).toBe(429)
    expect((await call('/api/likes/8', { method: 'PUT', ip })).status).toBe(200)
    expect((await call('/api/likes/7', { method: 'PUT', ip: newIp() })).status).toBe(200)
  })

  test('DELETE shares the budget of its dish', async () => {
    const ip = newIp()
    for (let i = 0; i < 10; i++) await call('/api/likes/7', { method: 'DELETE', ip })
    expect((await call('/api/likes/7', { method: 'PUT', ip })).status).toBe(429)
  })
})

describe('POST /api/likes/{id} (no-JS form)', () => {
  test('likes and 303s back to the dish in the guest language; sets the cookie', async () => {
    const res = await call('/api/likes/7', { method: 'POST', body: { liked: '1', lang: 'pt' } })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/r/demo/pt#dish-7')
    expect(cookieOf(res)).toMatch(/^chilly_device=/)
    expect(await likesIn(7)).toBe(1)
  })

  test('liked=0 unlikes; a hostile or unknown lang is dropped from the redirect (no open redirect)', async () => {
    const cookie = await likeAsNewDevice()
    const res = await call('/api/likes/7', { method: 'POST', cookie, body: { liked: '0', lang: '//evil.example' } })
    expect([res.status, res.headers.get('location')]).toEqual([303, '/r/demo#dish-7'])
    expect(await likesIn(7)).toBe(0)
    const upper = await call('/api/likes/7', { method: 'POST', body: { liked: '1', lang: 'PT' } })
    expect(upper.headers.get('location')).toBe('/r/demo/pt#dish-7')
  })

  test('errors still redirect, never a JSON page: rate limited, unknown dish, malformed id', async () => {
    const ip = newIp()
    for (let i = 0; i < 10; i++) await call('/api/likes/8', { method: 'PUT', ip })
    const limited = await call('/api/likes/8', { method: 'POST', ip, body: { liked: '1', lang: 'pt' } })
    expect([limited.status, limited.headers.get('location'), limited.headers.get('set-cookie')]).toEqual([303, '/r/demo/pt#dish-8', null])
    for (const id of ['9999', 'abc', '1e1']) {
      const res = await call(`/api/likes/${id}`, { method: 'POST', body: { liked: '1', lang: 'pt' } })
      expect([id, res.status, res.headers.get('location')]).toEqual([id, 303, '/'])
    }
  })

  test('a missing or odd liked value means like, never crashes', async () => {
    const bodies: Record<string, string>[] = [{ lang: 'pt' }, { liked: 'yes', lang: 'pt' }, { liked: '', lang: 'pt' }]
    for (const body of bodies) {
      const res = await call('/api/likes/7', { method: 'POST', body })
      expect(res.status).toBe(303)
    }
  })
})

describe('GET /api/r/{slug}/likes', () => {
  test('is private, counts every visible dish, and lists only this device\'s likes', async () => {
    const cookie = await likeAsNewDevice(7)
    await likeAsNewDevice(8)
    const res = await call('/api/r/demo/likes', { cookie })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.json() as { counts: Record<string, number>, liked: number[] }
    expect(body.liked).toEqual([7])
    expect(body.counts).toMatchObject({ 7: 1, 8: 1, 1: 0 })
    expect(Object.keys(body.counts)).toHaveLength(9)
    expect(res.headers.get('set-cookie')).toBeNull() // reading never issues a cookie
  })

  test('without or with a forged cookie nothing is liked; unknown slug is just empty', async () => {
    await likeAsNewDevice()
    expect((await (await call('/api/r/demo/likes')).json() as { liked: number[] }).liked).toEqual([])
    expect((await (await call('/api/r/demo/likes', { cookie: 'chilly_device=abc.def' })).json() as { liked: number[] }).liked).toEqual([])
    expect(await (await call('/api/r/nope/likes')).json()).toEqual({ counts: {}, liked: [] })
  })

  test('hidden dishes are not exposed in the counts', async () => {
    await env.DB.prepare('UPDATE dishes SET is_visible = 0 WHERE id = 1').run()
    const body = await (await call('/api/r/demo/likes')).json() as { counts: Record<string, number> }
    expect(1 in body.counts).toBe(false)
  })
})

describe('guest pages', () => {
  test('the menu: same HTML for everyone, no cookie, no private caching, hearts + menu.js present', async () => {
    const anon = await call('/r/demo/pt')
    const html = await anon.text()
    expect(anon.headers.get('set-cookie')).toBeNull()
    expect(anon.headers.get('cache-control') ?? '').not.toMatch(/private|no-store/)
    expect(html).toContain('/menu.js')
    expect((html.match(/data-heart/g) ?? []).length).toBe(9)
    expect(html).not.toContain('aria-pressed="true"') // per-device state is never in the HTML

    // The page cannot depend on who is looking: with a device cookie the HTML is byte-identical.
    const cookie = await likeAsNewDevice()
    const [a, b] = await Promise.all([call('/r/demo/pt'), call('/r/demo/pt', { cookie })])
    expect(await b.text()).toBe(await a.text())
  })

  test('favorites: private, lists exactly this device\'s dishes, pressed hearts that unlike', async () => {
    const cookie = await likeAsNewDevice(7)
    await call('/api/likes/6', { method: 'PUT', cookie })
    await likeAsNewDevice(8) // someone else's
    const res = await call('/r/demo/pt/favorites', { cookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const html = await res.text()
    expect([...html.matchAll(/id="dish-(\d+)"/g)].map(m => m[1]).sort()).toEqual(['6', '7'])
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(2)
    expect((html.match(/name="liked" value="0"/g) ?? []).length).toBe(2)
    expect(html).toContain('noindex')
  })

  test('favorites with no likes shows the empty message in the guest language', async () => {
    const pt = await (await call('/r/demo/pt/favorites')).text()
    expect(pt).toContain('Ainda sem favoritos')
    expect(pt).not.toContain('id="dish-')
    const en = await (await call('/r/demo/en/favorites')).text()
    expect(en).toContain('No favorites yet')
    expect(en).toContain('lang="en"')
  })

  test('a favorite that gets hidden disappears from the page; it returns when shown again', async () => {
    const cookie = await likeAsNewDevice(6)
    await env.DB.prepare('UPDATE dishes SET is_visible = 0 WHERE id = 6').run()
    expect(await (await call('/r/demo/pt/favorites', { cookie })).text()).not.toContain('id="dish-6"')
    await env.DB.prepare('UPDATE dishes SET is_visible = 1 WHERE id = 6').run()
    expect(await (await call('/r/demo/pt/favorites', { cookie })).text()).toContain('id="dish-6"')
  })

  test('favorites URLs follow the same language rules as the menu', async () => {
    const bad = await call('/r/demo/xx/favorites')
    expect([bad.status, bad.headers.get('location')]).toEqual([302, '/r/demo/pt/favorites'])
    const upper = await call('/r/demo/PT/favorites')
    expect([upper.status, upper.headers.get('location')]).toEqual([301, '/r/demo/pt/favorites'])
    expect((await call('/r/nope/pt/favorites')).status).toBe(404)
  })

  test('slugs are lower case: upper-case URLs 301, unknown ones 404', async () => {
    for (const [from, to] of [['/r/Demo', '/r/demo/pt'], ['/r/DEMO/PT', '/r/demo/pt'], ['/r/demo/PT', '/r/demo/pt']]) {
      const res = await call(from, { headers: { 'accept-language': 'pt-PT,pt;q=0.9' } })
      expect([from, res.status, res.headers.get('location')]).toEqual([from, 301, to])
    }
    expect((await call('/r/NOPE/pt')).status).toBe(404)
  })

  test('Accept-Language negotiation, including optional whitespace around q', async () => {
    const res = await call('/r/demo', { headers: { 'accept-language': 'de, en; q=0.9' } })
    expect([res.status, res.headers.get('location')]).toEqual([302, '/r/demo/en'])
  })
})

describe('/api/menu/{slug}', () => {
  test('favorites=1 is private and filtered; the plain menu is not', async () => {
    const cookie = await likeAsNewDevice(7)
    const fav = await call('/api/menu/demo?lang=pt&favorites=1', { cookie })
    expect(fav.headers.get('cache-control')).toBe('private, no-store')
    const body = await fav.json() as { menu: { categories: { dishes: { id: number }[] }[] } }
    expect(body.menu.categories.flatMap(c => c.dishes.map(d => d.id))).toEqual([7])
    const plain = await call('/api/menu/demo?lang=pt', { cookie })
    expect(plain.headers.get('cache-control') ?? '').not.toContain('private')
    expect(((await plain.json()) as { menu: { categories: { dishes: unknown[] }[] } }).menu.categories.flatMap(c => c.dishes)).toHaveLength(9)
  })
})
