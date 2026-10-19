// Bindings the tests see (wrangler.toml + vitest.config.mts miniflare.bindings).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[]
  }
  interface Exports {
    default: Fetcher // the built Nitro worker
  }
}
