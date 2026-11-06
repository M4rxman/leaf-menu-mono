// Crawler policy while in development: nobody crawls or indexes, except Anthropic's bots.
// robots.txt is advisory (compliant bots only); the like routes' refusal of GET is what is actually enforced.
import { env, exports } from 'cloudflare:workers'
import robotsParser from 'robots-parser'
import { describe, expect, test } from 'vitest'

const BASE = 'https://example.com'
let n = 0
const get = (path: string, method = 'GET') =>
  exports.default.fetch(BASE + path, { method, redirect: 'manual', headers: { 'cf-connecting-ip': `10.77.0.${++n}` } })

describe('robots.txt', () => {
  test('is served as plain text', async () => {
    const res = await get('/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await res.text()).toContain('User-agent: *\nDisallow: /')
  })

  // Parsed by an independent RFC 9309 implementation, not by our own code.
  test.each([
    ['Googlebot', '/', false], ['Googlebot', '/r/demo/pt', false], ['Googlebot', '/admin/', false], ['Googlebot', '/api/likes/7', false],
    ['GPTBot', '/r/demo', false], ['CCBot', '/', false], ['bingbot', '/q/abc', false], ['SomethingElse/1.0', '/r/demo', false],
    ['ClaudeBot', '/', true], ['ClaudeBot', '/r/demo/pt', true],
    ['Claude-User', '/r/demo', true], ['Claude-SearchBot', '/r/demo', true]
  ])('%s on %s: allowed = %s', async (agent, path, allowed) => {
    const robots = robotsParser(`${BASE}/robots.txt`, await (await get('/robots.txt')).text())
    expect(robots.isAllowed(BASE + path, agent)).toBe(allowed)
  })
})

describe('X-Robots-Tag', () => {
  test.each(['/', '/pt', '/r/demo/pt', '/api/r/demo/likes', '/q/abc', '/robots.txt'])('noindex, nofollow on %s', async (path) => {
    expect((await get(path)).headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})

describe('GET never changes state', () => {
  test.each(['/api/likes/7'])('GET, HEAD and OPTIONS on %s are refused and no like is written', async (path) => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const res = await get(path, method)
      expect([404, 405]).toContain(res.status)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
    const row = await env.DB.prepare('SELECT likes FROM dishes WHERE id = 7').first<{ likes: number }>()
    const hits = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes').first<{ n: number }>()
    expect(row?.likes).toBe(0)
    expect(hits?.n).toBe(0)
  })
})
