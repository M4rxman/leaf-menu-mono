import { env, exports } from 'cloudflare:workers'
import { expect, test } from 'vitest'

const get = (path: string) => exports.default.fetch(`http://example.com${path}`, { headers: { 'cf-connecting-ip': `10.0.1.${Math.floor(Math.random() * 250)}` } })

test('/img serves an R2 photo immutable, with its content type and no cookie', async () => {
  await env.PHOTOS.put('r/1/dishes/1/abc', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/webp' } })
  const res = await get('/img/r/1/dishes/1/abc')
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(res.headers.get('content-type')).toBe('image/webp')
  expect(res.headers.get('set-cookie')).toBeNull()
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
})

test('/img is 404 for a missing key, a key outside r/, and a key with ..', async () => {
  await env.PHOTOS.put('secret', 'x')
  expect((await get('/img/r/1/dishes/1/nope')).status).toBe(404)
  expect((await get('/img/secret')).status).toBe(404)
  expect((await get('/img/r/1/../../secret')).status).toBe(404)
  expect((await get('/img/r/1/%2e%2e/secret')).status).toBe(404)
})
