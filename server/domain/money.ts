// A bare tag picks that language's default region ('pt' = Brazil: "€ 8,00"). Our first venues are in Portugal.
const FORMAT_LOCALE: Record<string, string> = { pt: 'pt-PT' }

/** 800 cents, EUR, 'pt' -> "8,00 €". */
export function formatPrice(cents: number, currency: string, lang: string): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[lang] ?? lang, { style: 'currency', currency }).format(cents / 100)
}
