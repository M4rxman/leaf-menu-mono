import { bestLang, canonicalLang, dirOf } from '../langs.ts'
import { fallbackLang, resolveText } from './i18n.ts'
import { formatPrice } from './money.ts'
import type { MenuReader } from './ports.ts'
import type { Lang, MenuResult, RawDish, RawMenu, DishView, MenuView } from './types.ts'

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

export class MenuService {
  private readonly reader: MenuReader

  constructor(reader: MenuReader) {
    this.reader = reader
  }

  /** /r/{slug}: pick the language from Accept-Language (enabled only), else the venue default. */
  async enter(slug: string, acceptLanguage: string | null | undefined): Promise<MenuResult> {
    const raw = await this.reader.getMenu(slug)
    if (raw) return redirect(raw.slug, bestLang(acceptLanguage, raw.langs, raw.defaultLang), false)
    const renamed = await this.renamed(slug, undefined)
    if (renamed.kind !== 'notfound' || slug === slug.toLowerCase()) return renamed
    return this.lowerCased(slug, await this.enter(slug.toLowerCase(), acceptLanguage), undefined)
  }

  /** /r/{slug}/{lang}: serve it if enabled, else redirect to the default-language URL. */
  async getMenu(slug: string, requestedLang: string): Promise<MenuResult> {
    const raw = await this.reader.getMenu(slug)
    if (!raw) {
      const renamed = await this.renamed(slug, requestedLang)
      if (renamed.kind !== 'notfound' || slug === slug.toLowerCase()) return renamed
      return this.lowerCased(slug, await this.getMenu(slug.toLowerCase(), requestedLang), requestedLang)
    }
    // The default language is always servable, even if it is not (yet) in restaurant_langs: otherwise the redirect below loops.
    const lang = requestedLang === raw.defaultLang ? raw.defaultLang : canonicalLang(requestedLang)
    if (!lang || !servable(raw).includes(lang)) return redirect(raw.slug, raw.defaultLang, false)
    if (lang !== requestedLang) return redirect(raw.slug, lang, true) // 'PT' -> 'pt'
    return { kind: 'ok', menu: toView(raw, lang) }
  }

  /** Slugs are lower case: /r/Demo is a typo for /r/demo, so 301 there if that venue exists (else 404). */
  private lowerCased(slug: string, found: MenuResult, langHint: string | undefined): MenuResult {
    if (found.kind === 'notfound') return found
    if (found.kind === 'redirect') return { ...found, permanent: true }
    return redirect(found.menu.slug, canonicalLang(langHint ?? '') ?? undefined, true)
  }

  /** An old slug 301s to the current one; the language is kept if it is still a plain tag. */
  private async renamed(oldSlug: string, langHint: string | null | undefined): Promise<MenuResult> {
    const current = await this.reader.currentSlugFor(oldSlug)
    if (!current) return { kind: 'notfound' }
    return redirect(current, canonicalLang(langHint ?? '') ?? undefined, true)
  }
}

const servable = (raw: RawMenu): Lang[] => (raw.langs.includes(raw.defaultLang) ? raw.langs : [raw.defaultLang, ...raw.langs])

function redirect(slug: string, lang: Lang | undefined, permanent: boolean): MenuResult {
  return { kind: 'redirect', slug, lang, permanent }
}

function toView(raw: RawMenu, lang: Lang): MenuView {
  const text = (t: Parameters<typeof resolveText>[0]) => resolveText(t, lang, raw.defaultLang)
  const mark = (t: Parameters<typeof resolveText>[0]) => fallbackLang(t, lang, raw.defaultLang)
  const dishView = (d: RawDish): DishView => ({
    id: d.id,
    name: text(d.names),
    nameLang: mark(d.names),
    description: text(d.descriptions),
    descriptionLang: mark(d.descriptions),
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
    dir: dirOf(lang),
    langs: servable(raw),
    name: text(raw.names),
    nameLang: mark(raw.names),
    about: text(raw.about),
    aboutLang: mark(raw.about),
    hoursText: text(raw.hours),
    info: raw.info,
    categories: raw.categories
      .filter(c => c.isVisible && !c.deleted)
      .sort(byPosition)
      .map(c => ({
        id: c.id,
        name: text(c.names),
        nameLang: mark(c.names),
        dishes: c.dishes.filter(d => d.isVisible && !d.deleted).sort(byPosition).map(dishView)
      }))
  }
}

/** Favorites: the same menu keeping only the given dishes (and categories that still have one). */
export function onlyDishes(menu: MenuView, ids: number[]): MenuView {
  const keep = new Set(ids)
  const categories = menu.categories
    .map(c => ({ ...c, dishes: c.dishes.filter(d => keep.has(d.id)) }))
    .filter(c => c.dishes.length)
  return { ...menu, categories }
}
