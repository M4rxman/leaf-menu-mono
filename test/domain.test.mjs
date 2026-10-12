import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveText } from '../server/domain/i18n.ts'
import { formatPrice } from '../server/domain/money.ts'
import { MenuService } from '../server/domain/menu-service.ts'

test('resolveText falls back to the default language, then to empty', () => {
  assert.equal(resolveText({ pt: 'Olá', en: 'Hi' }, 'en', 'pt'), 'Hi')
  assert.equal(resolveText({ pt: 'Olá' }, 'en', 'pt'), 'Olá')
  assert.equal(resolveText({ pt: '  ' }, 'en', 'pt'), '')
  assert.equal(resolveText({}, 'en', 'pt'), '')
})

test('formatPrice follows the language', () => {
  assert.match(formatPrice(800, 'EUR', 'pt'), /^8,00\s€$/)
  assert.match(formatPrice(350, 'EUR', 'en'), /^€3\.50$/)
})

const dish = (id, over = {}) => ({
  id, position: id * 10, priceCents: 500, photoKey: null, isVisible: true, isSoldOut: false,
  isFeatured: false, deleted: false, allergens: null, likes: 0,
  names: { pt: `Prato ${id}` }, descriptions: {}, photoAlts: {}, ...over
})
const raw = (over = {}) => ({
  id: 1, slug: 'x', defaultLang: 'pt', currency: 'EUR', info: {}, langs: ['pt', 'en'],
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

test('MenuService ignores languages the owner did not enable', async () => {
  const r = await service(raw()).getMenu('x', 'de')
  assert.equal(r.menu.lang, 'pt')
})

test('MenuService redirects renamed slugs and 404s unknown ones', async () => {
  assert.deepEqual(await service(raw(), { old: 'x' }).getMenu('old'), { kind: 'redirect', slug: 'x' })
  assert.deepEqual(await service(raw()).getMenu('nope'), { kind: 'notfound' })
})
