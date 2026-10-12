import type { Lang } from './types.ts'

// Adding a language = one line here (plus its UI strings).
const LOCALES: Record<Lang, string> = {
  en: 'en-GB', pt: 'pt-PT', es: 'es-ES', de: 'de-DE', uk: 'uk-UA', fr: 'fr-FR'
}

/** 800 cents, EUR, pt -> "8,00 €". */
export function formatPrice(cents: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency }).format(cents / 100)
}
