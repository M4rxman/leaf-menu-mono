import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Seed: venue `demo` (pt default, en), QR code cs7k2m. Only dish 7 has an English text; the rest falls back to pt.
// Each test hearts its own dish, so the like limit (per IP and dish, per minute) is never shared between tests.
const dish = (page: Page, id: number) => ({
  card: page.locator(`#dish-${id}`),
  heart: page.locator(`#dish-${id} button`),
  count: page.locator(`#dish-${id} [data-count]`)
})
const countOf = async (page: Page, id: number) => Number(await dish(page, id).count.textContent())

// fixme: GET /q/{code} is not implemented yet (issue #18). Remove the fixme in the PR that adds it.
test.fixme('scan: the permanent QR link lands on the menu in the guest language', async ({ page }) => {
  await page.goto('/q/cs7k2m')
  await expect(page).toHaveURL(/\/r\/demo\/pt$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Casa Strega')
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(7) // seven categories
})

test.describe('English browser', () => {
  test.use({ locale: 'en-GB' })
  test('/r/demo goes to the English menu', async ({ page }) => {
    await page.goto('/r/demo')
    await expect(page).toHaveURL(/\/r\/demo\/en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test('a visitor who only reads gets no cookie; the first heart sets one (HttpOnly)', async ({ page, context }) => {
  await page.goto('/r/demo/pt')
  expect(await context.cookies()).toEqual([])
  await dish(page, 1).heart.click()
  await expect(dish(page, 1).heart).toHaveAttribute('aria-pressed', 'true')
  const cookies = await context.cookies()
  expect(cookies.map(c => c.name)).toEqual(['chilly_device'])
  expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
})

test('heart: +1, survives a reload, and goes back on the second tap', async ({ page }) => {
  await page.goto('/r/demo/pt')
  const { heart } = dish(page, 7)
  const before = await countOf(page, 7)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(dish(page, 7).count).toHaveText(String(before + 1))

  await page.reload()
  await expect(heart).toHaveAttribute('aria-pressed', 'true') // menu.js restores it from the signed cookie
  await expect(dish(page, 7).count).toHaveText(String(before + 1))

  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await expect(dish(page, 7).count).toHaveText(String(before))
})

test('two devices count separately', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await a.goto('/r/demo/pt')
  await b.goto('/r/demo/pt')
  const before = await countOf(a, 2)
  await dish(a, 2).heart.click()
  await expect(dish(a, 2).count).toHaveText(String(before + 1))

  await b.reload()
  await expect(dish(b, 2).count).toHaveText(String(before + 1)) // the count is shared...
  await expect(dish(b, 2).heart).toHaveAttribute('aria-pressed', 'false') // ...the heart is not
  await dish(b, 2).heart.click()
  await expect(dish(b, 2).count).toHaveText(String(before + 2))
  await a.context().close()
  await b.context().close()
})

test('favorites lists exactly this browser\'s hearts, and says so when there are none', async ({ page }) => {
  await page.goto('/r/demo/pt/favorites')
  await expect(page.getByText('Ainda sem favoritos')).toBeVisible()

  await page.goto('/r/demo/pt')
  await dish(page, 3).heart.click()
  await expect(dish(page, 3).heart).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Favoritos' }).click()
  await expect(page).toHaveURL(/\/r\/demo\/pt\/favorites$/)
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('#dish-3')).toContainText('Aperol Spritz')
  await expect(page.locator('#dish-3 button')).toHaveAttribute('aria-pressed', 'true')

  await dish(page, 3).heart.click() // un-heart here: the page keeps the card until reload
  await page.reload()
  await expect(page.getByText('Ainda sem favoritos')).toBeVisible()
})

test('switch language: translated text changes, the rest falls back to Portuguese', async ({ page }) => {
  await page.goto('/r/demo/pt')
  await expect(dish(page, 7).card).toContainText('pesto')
  await page.getByRole('navigation', { name: 'Idioma' }).getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/r\/demo\/en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(dish(page, 7).card).toContainText('Tomato, Mozzarella di Bufala Campana, pesto') // translated
  const fallback = dish(page, 8).card.getByText('Mortadela italiana')
  await expect(fallback).toBeVisible() // not translated: shown in the default language...
  await expect(fallback).toHaveAttribute('lang', 'pt') // ...and marked as such for screen readers
  await expect(page.getByRole('link', { name: 'Favorites' })).toBeVisible() // UI chrome follows the language
})

test('a language the venue does not offer goes to the default-language menu', async ({ page }) => {
  await page.goto('/r/demo/de')
  await expect(page).toHaveURL(/\/r\/demo\/pt$/)
})

test.describe('JavaScript off', () => {
  test.use({ javaScriptEnabled: false })
  test('the heart is a form: it posts and comes back to the dish', async ({ page, context }) => {
    await page.goto('/r/demo/pt')
    const before = await countOf(page, 9)
    await dish(page, 9).heart.click()
    await expect(page).toHaveURL(/\/r\/demo\/pt#dish-9$/)
    await expect(dish(page, 9).count).toHaveText(String(before + 1))
    expect((await context.cookies()).map(c => c.name)).toEqual(['chilly_device'])
    // without JS nothing marks the heart as pressed on the menu, but Favorites is rendered on the server
    await page.goto('/r/demo/pt/favorites')
    await expect(page.locator('#dish-9')).toBeVisible()
  })
})

test.describe('right-to-left venue', () => {
  test('Arabic menu: dir=rtl and the layout mirrors (the heart is left of the title)', async ({ page }, info) => {
    await page.goto('/r/rtl')
    await expect(page).toHaveURL(/\/r\/rtl\/ar$/) // single language: no switch
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    const heart = await dish(page, 100).heart.boundingBox()
    const title = await dish(page, 100).card.getByRole('heading', { level: 3 }).boundingBox()
    expect(heart!.x).toBeLessThan(title!.x)
    await page.screenshot({ path: info.outputPath('rtl-menu.png'), fullPage: true }) // for a human; not a pixel baseline (differs per OS)
  })
})
