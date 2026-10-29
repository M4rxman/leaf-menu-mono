import { expect, test } from '@playwright/test'

// Venue `big` (big-venue.sql): 64 dishes, the even ones with a photo (one shared R2 object).
const URL = '/r/big/en'
const IMGS = '[id^="dish-"] img'

test.use({ locale: 'en-GB' })

test('dishes and photos are in the server HTML', async ({ request }) => {
  const html = await (await request.get(URL)).text()
  expect(html).toContain('Dish 1')
  expect(html).toContain('Dish 64')
  expect(html).toMatch(/<img[^>]+src="\/img\/r\/3\/dishes\/shared\/test"/)
})

test('viewport meta does not block zooming', async ({ page }) => {
  await page.goto(URL)
  const content = await page.locator('meta[name=viewport]').getAttribute('content')
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/)
})

test('photos have dimensions, load, and lazy-load only below the fold', async ({ page }) => {
  await page.goto(URL)
  const imgs = await page.locator(IMGS).evaluateAll(els => els.map(e => {
    const i = e as HTMLImageElement
    const r = i.getBoundingClientRect()
    return {
      w: i.getAttribute('width'), h: i.getAttribute('height'), loading: i.getAttribute('loading'),
      prio: i.getAttribute('fetchpriority'), top: r.top, bottom: r.bottom, vh: innerHeight
    }
  }))
  expect(imgs.length).toBe(32)
  for (const i of imgs) expect(i.w && i.h).toBeTruthy()
  const visible = imgs.filter(i => i.bottom > 0 && i.top < i.vh)
  const below = imgs.filter(i => i.top >= i.vh)
  expect(visible.length).toBeGreaterThan(0)
  expect(below.length).toBeGreaterThan(0)
  for (const i of visible) expect(i.loading).not.toBe('lazy')
  // DishCard makes the first 6 dishes eager even if the last of them sit just below the fold; everything past that is lazy
  expect(imgs.filter(i => i.loading !== 'lazy').length).toBeLessThanOrEqual(6)
  for (const i of below.slice(6)) expect(i.loading).toBe('lazy')
  expect(imgs.filter(i => i.prio === 'high').length).toBeLessThanOrEqual(1)
  // the first photo really arrives (verifies the R2 upload and /img route)
  await expect.poll(() => page.locator(IMGS).first().evaluate(e => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test('CLS stays under 0.1 on Slow 4G with a throttled CPU', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number }
    w.__cls = 0
    new PerformanceObserver(list => {
      for (const e of list.getEntries() as unknown as { hadRecentInput: boolean, value: number }[]) if (!e.hadRecentInput) w.__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(URL, { waitUntil: 'load' })
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)) }
    scrollTo(0, document.body.scrollHeight)
  })
  await page.waitForTimeout(1000)
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  expect(cls).toBeLessThanOrEqual(0.1)
})
