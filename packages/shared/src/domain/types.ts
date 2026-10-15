/** Canonical language tag from the pool in shared/langs.ts ('pt', 'uk', ...). */
export type Lang = string

/** One text in several languages. A missing key means "not translated". */
export type Translations = Partial<Record<Lang, string>>

// What a MenuReader returns: all languages, nothing resolved yet.
export interface RawDish {
  id: number
  position: number
  priceCents: number
  photoKey: string | null
  isVisible: boolean
  isSoldOut: boolean
  isFeatured: boolean
  deleted: boolean
  allergens: string | null
  likes: number
  names: Translations
  descriptions: Translations
  photoAlts: Translations
}

export interface RawCategory {
  id: number
  parentId: number | null
  position: number
  isVisible: boolean
  deleted: boolean
  names: Translations
  dishes: RawDish[]
}

export interface RawMenu {
  id: number
  slug: string
  defaultLang: Lang
  currency: string
  info: Record<string, unknown>
  langs: Lang[]
  names: Translations
  about: Translations
  hours: Translations
  categories: RawCategory[]
}

// What the guest page renders: one language, text resolved, price formatted.
export interface DishView {
  id: number
  name: string
  nameLang?: Lang // set only when the text fell back to the default language
  description: string
  descriptionLang?: Lang
  photoKey: string | null
  photoAlt: string
  price: string
  likes: number
  isFeatured: boolean
  isSoldOut: boolean
  allergens: string[]
}

export interface CategoryView {
  id: number
  name: string
  nameLang?: Lang
  dishes: DishView[]
}

export interface MenuView {
  slug: string
  lang: Lang
  dir: 'ltr' | 'rtl'
  langs: Lang[]
  name: string
  nameLang?: Lang
  about: string
  aboutLang?: Lang
  hoursText: string
  info: Record<string, unknown>
  categories: CategoryView[]
}

export type MenuResult =
  | { kind: 'ok', menu: MenuView }
  | { kind: 'redirect', slug: string, lang?: Lang, permanent: boolean }
  | { kind: 'notfound' }
