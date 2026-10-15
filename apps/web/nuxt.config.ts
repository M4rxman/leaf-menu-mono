import { UI_LOCALES } from '@chilly/shared/langs'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nitro-cloudflare-dev', '@nuxt/eslint', '@nuxt/ui', '@nuxt/icon', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  ui: { fonts: false }, // system font stack for menu text (plan Â§7); no build-time font API calls
  colorMode: { preference: 'light' }, // tokens have no dark variant yet
  // Lucide served from the bundle, not the Iconify API (no runtime network call on Workers).
  icon: { serverBundle: 'local' },
  i18n: {
    detectBrowserLanguage: false, // language comes from the URL, never a cookie on a menu GET
    locales: UI_LOCALES.map(code => ({ code, language: code, file: `${code}.json` })),
    defaultLocale: 'en',
    strategy: 'no_prefix' // venue language lives in /r/{slug}/{lang}, handled by our own routes
  },
  routeRules: {
    '/': { prerender: true },
    '/pt': { prerender: true }, // landing costs no Worker CPU
    '/r/**': { noScripts: true } // guest menu is plain SSR HTML, no hydration (plan Â§4)
  },
  build: { transpile: ['@chilly/shared'] },
  // Local D1/R2 state is shared with apps/cms (see db:* scripts).
  nitro: { preset: 'cloudflare-module', cloudflareDev: { persistDir: '../../.wrangler/state' } }
})
