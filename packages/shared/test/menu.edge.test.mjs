// Edge cases for prices, text fallback and the menu view that guests see.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackLang, resolveText } from '../src/domain/i18n.ts'
import { formatPrice } from '../src/domain/money.ts'
import { MenuService, onlyDishes } from '../src/domain/menu-service.ts'

const dish = (id, over = {}) => ({
  id, position: id * 10, priceCents: 500, photoKey: null, isVisible: true, isSoldOut: false,
  isFeatured: false, deleted: false, allergens: null, likes: 0,
  names: { pt: `Prato ${id}` }, descriptions: {}, photoAlts: {}, ...over
})
const cat = (id, dishes, over = {}) => ({
  id, parentId: null, position: id * 10, isVisible: true, deleted: false, names: { pt: `Cat ${id}` }, dishes, ...over
})
const raw = (categories, over = {}) => ({
  id: 1, slug: 'x', defaultLang: 'pt', currency: 'EUR', info: {}, langs: ['pt', 'en'],
  names: { pt: 'Casa' }, about: {}, hours: {}, categories, ...over
})
const view = async (menu, lang = 'pt') =>
  (await new MenuService({ getMenu: async () => menu, currentSlugFor: async () => null }).getMenu('x', lang)).menu

test('formatPrice: zero, cents, thousands, other languages, never rounds to the wrong cent', () => {
  assert.match(formatPrice(0, 'EUR', 'pt'), /^0,00\s€$/)
  assert.match(formatPrice(5, 'EUR', 'en'), /^€0\.05$/)
  assert.match(formatPrice(1005, 'EUR', 'pt'), /^10,05\s€$/)
  assert.match(formatPrice(1999, 'EUR', 'pt'), /^19,99\s€$/)
  assert.match(formatPrice(123456789, 'EUR', 'de'), /^1\.234\.567,89\s€$/)
  assert.match(formatPrice(800, 'USD', 'en'), /^\$8\.00$/)
  for (let c = 0; c < 20000; c += 7) // every price a menu could plausibly hold keeps exactly two decimals
    assert.match(formatPrice(c, 'EUR', 'en'), /\.\d\d$/, String(c))
})

test('formatPrice: a malformed currency code throws instead of printing a wrong price', () => {
  assert.throws(() => formatPrice(100, 'EURO', 'pt'), RangeError)
})

test('resolveText: whitespace-only or empty translations count as missing; output is trimmed', () => {
  assert.equal(resolveText({ pt: ' Olá ', en: '' }, 'en', 'pt'), 'Olá')
  assert.equal(resolveText({ pt: 'Olá', en: '   ' }, 'en', 'pt'), 'Olá')
  assert.equal(resolveText({ pt: 'Olá', en: undefined }, 'en', 'pt'), 'Olá')
  assert.equal(resolveText({ en: 'Hi' }, 'pt', 'pt'), '') // default language missing: nothing, not another language
})

test('fallbackLang: no mark when there is nothing to fall back to, or the text is the wanted language', () => {
  assert.equal(fallbackLang({ pt: '' }, 'en', 'pt'), undefined)
  assert.equal(fallbackLang({ en: 'Hi' }, 'en', 'pt'), undefined)
  assert.equal(fallbackLang({ pt: 'Olá', en: ' ' }, 'en', 'pt'), 'pt')
})

test('categories: hidden and deleted ones disappear with their dishes; order follows position', async () => {
  const m = await view(raw([
    cat(3, [dish(30)]),
    cat(1, [dish(10)]),
    cat(2, [dish(20)], { isVisible: false }),
    cat(4, [dish(40)], { deleted: true })
  ]))
  assert.deepEqual(m.categories.map(c => c.id), [1, 3])
  assert.deepEqual(m.categories.flatMap(c => c.dishes.map(d => d.id)), [10, 30])
})

test('dishes: sold-out stay visible and flagged; featured flag and likes pass through', async () => {
  const m = await view(raw([cat(1, [dish(1, { isSoldOut: true, isFeatured: true, likes: 329 })])]))
  assert.deepEqual([m.categories[0].dishes[0].isSoldOut, m.categories[0].dishes[0].isFeatured, m.categories[0].dishes[0].likes], [true, true, 329])
})

test('allergens: comma list is trimmed, empty entries dropped, null means none', async () => {
  const m = await view(raw([cat(1, [dish(1, { allergens: ' gluten, milk ,,' }), dish(2, { allergens: '' }), dish(3)])]))
  assert.deepEqual(m.categories[0].dishes.map(d => d.allergens), [['gluten', 'milk'], [], []])
})

test('prices are formatted for the guest language, not the venue default', async () => {
  const raw1 = raw([cat(1, [dish(1, { priceCents: 1250 })])])
  assert.match((await view(raw1, 'pt')).categories[0].dishes[0].price, /^12,50\s€$/)
  assert.match((await view(raw1, 'en')).categories[0].dishes[0].price, /^€12\.50$/)
})

test('photo alt text falls back to the default language like any other text', async () => {
  const d = dish(1, { photoAlts: { pt: 'Pizza na mesa' } })
  assert.equal((await view(raw([cat(1, [d])]), 'en')).categories[0].dishes[0].photoAlt, 'Pizza na mesa')
})

test('building a view does not mutate the data the reader returned', async () => {
  const menu = raw([cat(2, [dish(2), dish(1)]), cat(1, [dish(3)])])
  const before = JSON.stringify(menu)
  await view(menu)
  assert.equal(JSON.stringify(menu), before)
})

test('a venue with no categories still renders (empty menu)', async () => {
  assert.deepEqual((await view(raw([]))).categories, [])
})

test('slug lookups: unknown slug with a hostile language hint is a plain 404, never a redirect', async () => {
  const s = new MenuService({ getMenu: async () => null, currentSlugFor: async () => null })
  for (const lang of ['', 'PT', '../../etc', 'x'.repeat(500)])
    assert.deepEqual(await s.getMenu('nope', lang), { kind: 'notfound' })
  assert.deepEqual(await s.enter('nope', 'en'), { kind: 'notfound' })
})

test('a renamed slug keeps only a valid language hint (no open redirect through the hint)', async () => {
  const s = new MenuService({ getMenu: async x => (x === 'new' ? raw([]) : null), currentSlugFor: async o => (o === 'old' ? 'new' : null) })
  assert.deepEqual(await s.getMenu('old', 'EN'), { kind: 'redirect', slug: 'new', lang: 'en', permanent: true })
  assert.deepEqual(await s.getMenu('old', '//evil.example'), { kind: 'redirect', slug: 'new', lang: undefined, permanent: true })
})

test('onlyDishes: keeps order and categories that still have a dish; unknown ids are ignored; input untouched', async () => {
  const m = await view(raw([cat(1, [dish(1), dish(2)]), cat(2, [dish(3)]), cat(3, [dish(4)])]))
  const before = JSON.stringify(m)
  const fav = onlyDishes(m, [3, 2, 999])
  assert.deepEqual(fav.categories.map(c => [c.id, c.dishes.map(d => d.id)]), [[1, [2]], [2, [3]]])
  assert.equal(fav.name, m.name)
  assert.equal(JSON.stringify(m), before)
  assert.deepEqual(onlyDishes(m, []).categories, [])
  assert.equal(onlyDishes(m, [1, 2, 3, 4]).categories.length, 3)
})

test('slugs are lower case: /r/Demo 301s to /r/demo (language kept when valid), never serves a second URL', async () => {
  const s = new MenuService({
    getMenu: async x => (x === 'demo' ? raw([], { slug: 'demo' }) : null),
    currentSlugFor: async o => (o === 'old' ? 'demo' : null)
  })
  assert.deepEqual(await s.getMenu('Demo', 'pt'), { kind: 'redirect', slug: 'demo', lang: 'pt', permanent: true })
  assert.deepEqual(await s.getMenu('DEMO', 'PT'), { kind: 'redirect', slug: 'demo', lang: 'pt', permanent: true })
  assert.deepEqual(await s.getMenu('DEMO', 'zz'), { kind: 'redirect', slug: 'demo', lang: 'pt', permanent: true }) // invalid hint -> the venue default
  assert.deepEqual(await s.getMenu('OLD', 'pt'), { kind: 'redirect', slug: 'demo', lang: 'pt', permanent: true }) // renamed AND upper case
  assert.deepEqual((await s.enter('Demo', 'en')).permanent, true)
  assert.equal((await s.enter('Demo', 'en')).slug, 'demo')
  assert.deepEqual(await s.getMenu('NOPE', 'pt'), { kind: 'notfound' }) // upper-case typo of nothing is still a 404
  assert.deepEqual(await s.enter('NOPE', 'pt'), { kind: 'notfound' })
})
