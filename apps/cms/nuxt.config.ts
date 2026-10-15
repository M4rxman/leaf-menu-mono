// CMS for venue owners. Own Worker, same D1/R2 as apps/web; served under /admin.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nitro-cloudflare-dev', '@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],
  css: ['~/assets/css/admin.css'],
  app: { baseURL: '/admin/' },
  ui: { fonts: false },
  icon: { serverBundle: 'local' },
  build: { transpile: ['@chilly/shared'] },
  nitro: { preset: 'cloudflare-module', cloudflareDev: { persistDir: '../../.wrangler/state' } }
})
