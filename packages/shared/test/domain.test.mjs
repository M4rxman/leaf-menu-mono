import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackLang, resolveText } from '../src/domain/i18n.ts'
import { formatPrice } from '../src/domain/money.ts'
import { MenuService } from '../src/domain/menu-service.ts'

test('resolveText falls back to the default language, then to empty', () => {
  assert.equal(resolveText({ pt: 'Olá', en: 'Hi' }, 'en', 'pt'), 'Hi')
  assert.equal(resolveText({ pt: 'Olá' }, 'en', 'pt'), 'Olá')
  assert.equal(resolveText({ pt: '  ' }, 'en', 'pt'), '')
  assert.equal(resolveText({}, 'en', 'pt'), '')
})

test('fallbackLang marks only text that fell back to the default language', () => {
  assert.equal(fallbackLang({ pt: 'Olá' }, 'en', 'pt'), 'pt')
  assert.equal(fallbackLang({ pt: 'Olá', en: 'Hi' }, 'en', 'pt'), undefined)
  assert.equal(fallbackLang({ pt: 'Olá' }, 'pt', 'pt'), undefined)
  assert.equal(fallbackLang({}, 'en', 'pt'), undefined)
})

test('formatPrice follows the language; pt means Portugal', () => {
  assert.match(formatPrice(800, 'EUR', 'pt'), /^8,00\s€$/)
  assert.match(formatPrice(350, 'EUR', 'en'), /^€3\.50$/)
})

const dish = (id, over = {}) => ({
  id, position: id * 10, priceCents: 500, photoKey: null, isVisible: true, isSoldOut: false,
  isFeatured: false, deleted: false, allergens: null, likes: 0,
  names: { pt: `Prato ${id}` }, descriptions: {}, photoAlts: {}, ...over
})
const raw = (over = {}) => ({
  id: 1, slug: 'x', defaultLang: 'pt', currency: 'EUR', info: {}, langs: ['pt', 'en', 'uk'],
  names: { pt: 'Casa' }, about: {}, hours: {},
  categories: [{ id: 1, parentId: null, position: 10, isVisible: true, deleted: false, names: { pt: 'Cat' },
    dishes: [dish(2), dish(1), dish(3, { isVisible: false }), dish(4, { deleted: true })] }],
  ...over
})
const service = (menu, slugs = {}) =>
  new MenuService({ getMenu: async s => (s === 'x' ? menu : null), currentSlugFor: async s => slugs[s] ?? null })

test('MenuService drops hidden and deleted dishes and orders by position', async () => {
  const r = await service(raw()).getMenu('x', 'pt')
  assert.equal(r.kind, 'ok')
  assert.deepEqual(r.menu.categories[0].dishes.map(d => d.id), [1, 2])
})

test('enabled language is served; a non-canonical tag 301s to the canonical URL', async () => {
  assert.equal((await service(raw()).getMenu('x', 'uk')).menu.lang, 'uk')
  assert.deepEqual(await service(raw()).getMenu('x', 'PT'), { kind: 'redirect', slug: 'x', lang: 'pt', permanent: true })
})

test('the view marks default-language fallback text with its language', async () => {
  const m = (await service(raw()).getMenu('x', 'en')).menu
  assert.equal(m.categories[0].dishes[0].nameLang, 'pt')
  assert.equal((await service(raw()).getMenu('x', 'pt')).menu.categories[0].dishes[0].nameLang, undefined)
})

test('the default language is always servable (no redirect loop when restaurant_langs is empty or lacks it)', async () => {
  for (const langs of [[], ['en']]) {
    const r = await service(raw({ langs })).getMenu('x', 'pt')
    assert.equal(r.kind, 'ok')
    assert.ok(r.menu.langs.includes('pt'))
  }
  const odd = await service(raw({ langs: [], defaultLang: 'xx' })).getMenu('x', 'xx') // default outside the pool
  assert.equal(odd.kind, 'ok')
})

test('a language that is not enabled (or not in the pool) redirects to the default-language URL', async () => {
  const expected = { kind: 'redirect', slug: 'x', lang: 'pt', permanent: false }
  assert.deepEqual(await service(raw()).getMenu('x', 'de'), expected) // in the pool, not enabled
  assert.deepEqual(await service(raw()).getMenu('x', 'xx'), expected) // not in the pool
})

test('/r/{slug} negotiates Accept-Language against the enabled languages', async () => {
  const s = service(raw())
  assert.equal((await s.enter('x', 'en-GB,en;q=0.9,pt;q=0.5')).lang, 'en')
  assert.equal((await s.enter('x', 'de,fr;q=0.8')).lang, 'pt') // nothing enabled matches -> default
  assert.equal((await s.enter('x', undefined)).lang, 'pt')
})

test('a venue with one language has nothing to switch; rtl languages set dir', async () => {
  const one = (await service(raw({ langs: ['pt'] })).getMenu('x', 'pt')).menu
  assert.deepEqual(one.langs, ['pt'])
  assert.equal(one.dir, 'ltr')
  const ar = (await service(raw({ langs: ['ar'], defaultLang: 'ar' })).getMenu('x', 'ar')).menu
  assert.equal(ar.dir, 'rtl')
})

test('MenuService 301s renamed slugs and 404s unknown ones', async () => {
  assert.deepEqual(await service(raw(), { old: 'x' }).getMenu('old', 'pt'), { kind: 'redirect', slug: 'x', lang: 'pt', permanent: true })
  assert.deepEqual(await service(raw(), { old: 'x' }).enter('old', 'en'), { kind: 'redirect', slug: 'x', lang: undefined, permanent: true })
  assert.deepEqual(await service(raw()).getMenu('nope', 'pt'), { kind: 'notfound' })
})
