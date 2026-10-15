/** Public menu URL: /r/{slug} (language negotiated) or /r/{slug}/{lang}. */
export const menuPath = (slug: string, lang?: string): string => `/r/${slug}${lang ? `/${lang}` : ''}`
