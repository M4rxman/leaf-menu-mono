import type { Lang, Translations } from './types.ts'

/** Text in the wanted language, else the venue's default language, else empty. */
export function resolveText(t: Translations, lang: Lang, defaultLang: Lang): string {
  return t[lang]?.trim() || t[defaultLang]?.trim() || ''
}
