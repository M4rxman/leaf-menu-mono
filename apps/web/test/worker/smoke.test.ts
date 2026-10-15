import { env, exports } from 'cloudflare:workers'
import { expect, test } from 'vitest'

test('the Nitro worker boots in workerd and serves the seeded menu', async () => {
  const res = await exports.default.fetch('http://example.com/r/demo/pt')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('Bufalina Panizza')
  expect(res.headers.get('set-cookie')).toBeNull()
  expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM dishes').first<{ n: number }>())?.n).toBe(9)
})
