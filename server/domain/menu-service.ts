import { resolveText } from './i18n.ts'
import { formatPrice } from './money.ts'
import type { MenuReader } from './ports.ts'
import type { Lang, MenuResult, RawDish, RawMenu, DishView, MenuView } from './types.ts'

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

export class MenuService {
  private readonly reader: MenuReader

  constructor(reader: MenuReader) {
    this.reader = reader
  }

  async getMenu(slug: string, requestedLang?: string): Promise<MenuResult> {
    const raw = await this.reader.getMenu(slug)
    if (!raw) {
      const current = await this.reader.currentSlugFor(slug)
      return current ? { kind: 'redirect', slug: current } : { kind: 'notfound' }
    }
    return { kind: 'ok', menu: toView(raw, pickLang(raw, requestedLang)) }
  }
}

/** Only languages the owner enabled; anything else falls back to the default. */
function pickLang(raw: RawMenu, requested?: string): Lang {
  return raw.langs.find(l => l === requested) ?? raw.defaultLang
}

function toView(raw: RawMenu, lang: Lang): MenuView {
  const text = (t: Parameters<typeof resolveText>[0]) => resolveText(t, lang, raw.defaultLang)
  const dishView = (d: RawDish): DishView => ({
    id: d.id,
    name: text(d.names),
    description: text(d.descriptions),
    photoKey: d.photoKey,
    photoAlt: text(d.photoAlts),
    price: formatPrice(d.priceCents, raw.currency, lang),
    likes: d.likes,
    isFeatured: d.isFeatured,
    isSoldOut: d.isSoldOut,
    allergens: d.allergens ? d.allergens.split(',').map(a => a.trim()).filter(Boolean) : []
  })

  return {
    slug: raw.slug,
    lang,
    langs: raw.langs,
    name: text(raw.names),
    about: text(raw.about),
    hoursText: text(raw.hours),
    info: raw.info,
    categories: raw.categories
      .filter(c => c.isVisible && !c.deleted)
      .sort(byPosition)
      .map(c => ({
        id: c.id,
        name: text(c.names),
        dishes: c.dishes.filter(d => d.isVisible && !d.deleted).sort(byPosition).map(dishView)
      }))
  }
}
