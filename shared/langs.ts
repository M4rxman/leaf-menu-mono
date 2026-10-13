// Language pool and helpers (plan v3 §7). Pure TS, no imports: used by server, app and tests.

/** What an owner may enable. Base codes only in v1; Norwegian is `nb` (browsers send `nb`, not `no`). */
export const POOL = [
  'en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'uk', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'hr', 'sr', 'sl',
  'da', 'sv', 'nb', 'fi', 'et', 'lv', 'lt', 'ru', 'tr', 'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'zh', 'ja', 'ko',
  'th', 'vi', 'id', 'ms', 'ca', 'eu', 'gl'
] as const

/** Languages we ship UI chrome for (i18n/locales/*.json). Anything else shows chrome in English. */
export const UI_LOCALES = ['en', 'pt', 'es', 'de', 'uk', 'fr'] as const

const RTL = new Set(['ar', 'he', 'fa', 'ur'])

/** Canonical tag if it is in the pool ('PT' -> 'pt'), else null. */
export function canonicalLang(tag: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag)
    return (POOL as readonly string[]).includes(canonical) ? canonical : null
  } catch {
    return null
  }
}

export const isLang = (tag: string): boolean => canonicalLang(tag) !== null

export const dirOf = (lang: string): 'ltr' | 'rtl' => (RTL.has(lang) ? 'rtl' : 'ltr')

export const uiLocale = (lang: string): string =>
  (UI_LOCALES as readonly string[]).includes(lang) ? lang : 'en'

/** Name of a language in that language: "português" -> "Português". */
export function languageName(lang: string): string {
  const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang
  return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1)
}

/** Best enabled language for an Accept-Language header, else the fallback. Only the base language counts. */
export function bestLang(header: string | null | undefined, enabled: string[], fallback: string): string {
  const wanted = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { base: tag.split('-')[0].toLowerCase(), q: q === undefined ? 1 : Number(q) }
    })
    .filter(x => x.base && x.base !== '*' && x.q > 0)
    .sort((a, b) => b.q - a.q)
  return wanted.find(x => enabled.includes(x.base))?.base ?? fallback
}
