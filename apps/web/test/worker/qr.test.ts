// GET /q/{code}: permanent QR link (plan §8), 302 to the venue's current slug, no cookies.
import { exports } from 'cloudflare:workers'
import { expect, test } from 'vitest'

const get = (path: string) => exports.default.fetch(`https://example.com${path}`, { redirect: 'manual' })

test('the seeded code redirects (302) to /r/demo without setting a cookie', async () => {
  const res = await get('/q/cs7k2m')
  expect(res.status).toBe(302)
  expect(new URL(res.headers.get('location')!, 'https://example.com').pathname).toBe('/r/demo')
  expect(res.headers.get('set-cookie')).toBeNull()
})

test('unknown and malformed codes are 404', async () => {
  for (const code of ['nope00', 'CS7K2M', 'a%20b', 'x'.repeat(200)]) {
    expect((await get(`/q/${code}`)).status, code).toBe(404)
  }
})
