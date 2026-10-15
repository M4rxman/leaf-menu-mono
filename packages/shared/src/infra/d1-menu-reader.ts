import type { Db, MenuReader } from '../domain/ports.ts'
import type { Lang, RawCategory, RawDish, RawMenu, Translations } from '../domain/types.ts'

interface Row { [k: string]: unknown }
interface I18nRow { id: number, lang: Lang, [k: string]: unknown }

/** Folds *_i18n rows into { id -> { lang -> text } } for one text column. */
function byId(rows: I18nRow[], column: string): Map<number, Translations> {
  const map = new Map<number, Translations>()
  for (const r of rows) {
    const text = r[column]
    if (typeof text !== 'string') continue
    const t = map.get(r.id) ?? {}
    t[r.lang] = text
    map.set(r.id, t)
  }
  return map
}

/** info_json is owner-edited text: a corrupt value must not take the whole menu down. */
function parseInfo(json: unknown): Record<string, unknown> {
  try {
    const v = JSON.parse((json as string) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

/** All SQL for the guest page. A fixed number of queries per menu, no N+1. */
export class D1MenuReader implements MenuReader {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async currentSlugFor(oldSlug: string): Promise<string | null> {
    const row = await this.db.first<{ slug: string }>(
      `SELECT r.slug FROM slug_history h JOIN restaurants r ON r.id = h.restaurant_id
       WHERE h.old_slug = ? AND r.deleted_at IS NULL`, oldSlug)
    return row?.slug ?? null
  }

  async getMenu(slug: string): Promise<RawMenu | null> {
    const r = await this.db.first<Row>(
      'SELECT id, slug, default_lang, currency, info_json FROM restaurants WHERE slug = ? AND deleted_at IS NULL', slug)
    if (!r) return null
    const id = r.id as number

    const [langs, rest, cats, catNames, dishes, dishI18n] = await Promise.all([
      this.db.all<{ lang: Lang }>('SELECT lang FROM restaurant_langs WHERE restaurant_id = ? ORDER BY position', id),
      this.db.all<{ id: number, lang: Lang, name: string, about: string | null, hours_text: string | null }>(
        'SELECT restaurant_id AS id, lang, name, about, hours_text FROM restaurant_i18n WHERE restaurant_id = ?', id),
      this.db.all<Row>('SELECT id, parent_id, position, is_visible, deleted_at FROM categories WHERE restaurant_id = ?', id),
      this.db.all<I18nRow>(
        `SELECT c.category_id AS id, c.lang, c.name FROM category_i18n c
         JOIN categories k ON k.id = c.category_id WHERE k.restaurant_id = ?`, id),
      this.db.all<Row>(
        `SELECT id, category_id, position, price_cents, photo_key, is_visible, is_sold_out, is_featured,
                allergens, likes, deleted_at FROM dishes WHERE restaurant_id = ?`, id),
      this.db.all<I18nRow>(
        `SELECT d.dish_id AS id, d.lang, d.name, d.description, d.photo_alt FROM dish_i18n d
         JOIN dishes x ON x.id = d.dish_id WHERE x.restaurant_id = ?`, id)
    ])

    const catName = byId(catNames, 'name')
    const dishName = byId(dishI18n, 'name')
    const dishDesc = byId(dishI18n, 'description')
    const dishAlt = byId(dishI18n, 'photo_alt')

    const categories = new Map<number, RawCategory>()
    for (const c of cats) {
      categories.set(c.id as number, {
        id: c.id as number,
        parentId: (c.parent_id as number | null) ?? null,
        position: c.position as number,
        isVisible: !!c.is_visible,
        deleted: c.deleted_at != null,
        names: catName.get(c.id as number) ?? {},
        dishes: []
      })
    }
    for (const d of dishes) {
      const dish: RawDish = {
        id: d.id as number,
        position: d.position as number,
        priceCents: d.price_cents as number,
        photoKey: (d.photo_key as string | null) ?? null,
        isVisible: !!d.is_visible,
        isSoldOut: !!d.is_sold_out,
        isFeatured: !!d.is_featured,
        deleted: d.deleted_at != null,
        allergens: (d.allergens as string | null) ?? null,
        likes: d.likes as number,
        names: dishName.get(d.id as number) ?? {},
        descriptions: dishDesc.get(d.id as number) ?? {},
        photoAlts: dishAlt.get(d.id as number) ?? {}
      }
      categories.get(d.category_id as number)?.dishes.push(dish)
    }

    const text = (column: 'name' | 'about' | 'hours_text') => {
      const t: Translations = {}
      for (const row of rest) if (row[column]) t[row.lang] = row[column] as string
      return t
    }

    return {
      id,
      slug: r.slug as string,
      defaultLang: r.default_lang as Lang,
      currency: r.currency as string,
      info: parseInfo(r.info_json),
      langs: langs.map(l => l.lang),
      names: text('name'),
      about: text('about'),
      hours: text('hours_text'),
      categories: [...categories.values()]
    }
  }
}
