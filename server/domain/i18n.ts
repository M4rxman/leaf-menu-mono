import type { Lang, Translations } from './types.ts'

/** Text in the wanted language, else the venue's default language, else empty. */
export function resolveText(t: Translations, lang: Lang, defaultLang: Lang): string {
  return t[lang]?.trim() || t[defaultLang]?.trim() || ''
}

/** The default language when `resolveText` fell back to it (so the page can mark the text `lang=`), else undefined. */
export function fallbackLang(t: Translations, lang: Lang, defaultLang: Lang): Lang | undefined {
  return lang !== defaultLang && !t[lang]?.trim() && t[defaultLang]?.trim() ? defaultLang : undefined
}
