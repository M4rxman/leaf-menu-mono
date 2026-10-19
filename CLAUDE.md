# Chilly Menu (leaf-menu-mono repo)

QR restaurant menus with likes + a small CMS (ChoiceQR-like, no ordering). First client: Casa Strega, Porto.

**Spec: `qr-menu-plan.md`.** Where it conflicts with the wireframe PDFs, the plan wins (♡ only, no "+"/ordering; owner-chosen languages, not PT|EN; per-language price format).

## Reference material
- `pdfs/FUNCTIONAL SPEC — CHOICEQR-LIKE.pdf` — functional spec
- `pdfs/CASA STREGA — WEBSITE WIREFRAME {DESKTOP,MOBILE}.pdf` — wireframes (mobile first)

## Stack
Nuxt 4 (Vue) on Cloudflare Workers (Nitro `cloudflare-module`), D1 (SQLite) binding `DB`, R2 binding `PHOTOS`. Config in each app's `wrangler.toml` (`apps/web`, `apps/cms`). Requires Node ≥ 22.22.3 or ≥ 24.15.

## Monorepo (npm workspaces)
- `apps/web` (`@chilly/web`) — public Worker: landing + guest menu (`/`, `/r/*`, `/q/*`).
- `apps/cms` (`@chilly/cms`) — owner CMS Worker, `app.baseURL = /admin/`. Same D1/R2 as web (each has its own `wrangler.toml`; keep the ids in sync).
- `packages/shared` (`@chilly/shared`) — TS source consumed directly (no build step): `src/{langs,paths,plural}.ts`, `src/domain/`, `src/infra/`, plus `migrations/`, `seed.sql` and the schema/domain/contract tests. Import via `@chilly/shared/langs`, `@chilly/shared/domain/<file>`, etc.
- Local D1/R2 state is shared by both apps in the repo-root `.wrangler/state`.
- Add dependencies to the workspace that uses them (`npm i <pkg> -w @chilly/web`); only husky/lint-staged live at the root.

## Commands (run from the repo root)
- `npm run dev` / `npm run dev:cms` — Nuxt dev servers (web :3000, cms :3001; no D1 bindings, use `preview` for anything touching the DB)
- `npm run preview` / `npm run preview:cms` — build + `wrangler dev` (web http://localhost:8787, cms http://localhost:8788/admin/) with local D1/R2
- `npm run db:migrate` / `npm run db:seed` — apply migrations / load Casa Strega demo (slug `demo`) into local D1
- `npm test` — all workspaces (node:test + node:sqlite, no deps); `npm run lint`, `npm run typecheck`, `npm run build` likewise
- `npm run test:worker` — builds web, then runs `apps/web/test/worker/*.test.ts` (Vitest + `@cloudflare/vitest-plugin`) against the built Worker in workerd with local D1 (real migrations + seed) (the like limit is a D1 setting, so there is no rate-limit binding). Tests call it via `exports.default.fetch`; each test starts from the demo seed. Uses a fresh client IP per test (`cf-connecting-ip`) to avoid sharing rate-limit budgets. `npm run test:worker` always builds first; `test:worker:only` (what CI runs after its build step) tests whatever `.output/` holds, so it can be stale. The tests are type-checked by `npm run typecheck` through `apps/web/test/worker/tsconfig.json`.
- A husky pre-commit hook runs `eslint --fix` on staged files via lint-staged

## Layout
- `apps/web/app/` — guest menu (`pages/r/[slug]/`), landing; `apps/web/server/` — thin handlers + `utils/container.ts`
- Likes: `LikeService`/`LikeStore` + signed device cookie in `packages/shared/src/{domain,infra}`; web has `server/api/likes/*`, `server/api/r/[slug]/likes.get.ts`, `server/middleware/01.origin-check.ts`, `components/HeartButton.vue`, `public/menu.js` (the only guest JS). Secret `DEVICE_SECRET` in `apps/web/.dev.vars`; the like rate limit is `restaurants.like_limit_per_min` (owner-editable in the CMS, default 10), counted by `D1RateLimiter` in `rate_hits` (migration 0002); no rate-limit binding.
- `apps/cms/app/` — CMS pages/layouts; `apps/cms/server/{api,middleware,utils/scoped-db.ts}` — to come
- `packages/shared/migrations/` — D1 migrations, additive only; `packages/shared/seed.sql` — demo data (re-runnable)
- Tests live next to what they test: `packages/shared/test/`, `apps/web/test/` (locale parity)

## Architecture (SOLID, only at real seams)
- `packages/shared/src/domain/` — pure TS, imports nothing from Nuxt/D1: types, ports (`Db`, `MenuReader`), `MenuService`, `resolveText`, `formatPrice`.
- `packages/shared/src/infra/` — implementations of ports (`d1-db.ts`, `d1-menu-reader.ts` hold all guest-page SQL). each app's `server/utils/container.ts` is the only place that touches Cloudflare bindings.
- `apps/*/server/api/` handlers stay thin: parse, call a service, return. Services take ports in the constructor.
- Abstract only where an implementation changes (D1 vs test SQLite, R2, auth provider) or a rule must be enforced once (CMS `TenantScopedRepository`). Interfaces by default, no DI container, no speculative base classes. Every port implementation must pass the same contract test (`packages/shared/test/menu-reader.contract.test.mjs`).
- Server `.ts` files use `import type` and explicit `.ts` import paths and no enums/constructor parameter properties, so `node --experimental-strip-types` can run them in tests.

## Languages (plan v3 §7)
- **Pool** = curated ~40 base codes in `packages/shared/src/langs.ts` (`POOL`, `isLang`, `canonicalLang`); owners pick per venue (`restaurant_langs`, `default_lang`); DB only checks tag format, the app checks pool membership.
- **Guest resolution:** `/r/{slug}` -> 302 `/r/{slug}/{lang}` from Accept-Language ∩ enabled, else default. A language that is not enabled or not in the pool -> 302 to the default-language URL. Old slug -> 301. One enabled language = no switch.
- **Venue content** (dish/category names, descriptions, ...) is owner-entered per language in `*_i18n`, falls back to the default language (`resolveText`). Owners are responsible for translation correctness.
- **UI chrome** (labels, aria) lives in `apps/web/i18n/locales/{en,pt,es,de,uk,fr}.json`, used with `$t(...)`; the page sets the locale from the URL language via `setLocale(uiLocale(lang))`. Languages without a file get English chrome. Never hard-code visible text; add the key to all six files (`apps/web/test/locales.test.mjs` enforces key parity).
- `<html lang dir>` from the view; `dir="rtl"` for ar, he, fa, ur. Use logical CSS (`ms-/me-/ps-/pe-`), never left/right.
- Prices: `Intl.NumberFormat`; bare `pt` is mapped to `pt-PT` (a bare `pt` formats as Brazil: "€ 8,00").
- Landing copy (`apps/web/app/content/landing.ts`, en/pt) is deliberately outside the locale files: it exists in two languages only, which would break key parity.

## Venues and URLs
- Two Workers (web, cms), one D1, one R2 bucket for all venues. A venue is a `restaurants` row: adding one needs no deploy or DNS change.
- Path per venue: `/` landing (`/pt` Portuguese), `/r/{slug}[/{lang}]` menu, `/q/{code}` permanent QR link, `/admin` CMS. No public venue list; the landing links only to the demo.
- Slug rule (enforce in the CMS create-venue handler + a `CHECK` in a later migration): `^[a-z0-9]+(-[a-z0-9]+)*$`, 3-40 chars, small reserved list (`admin`, `api`). Slug lookup stays host-independent so custom domains can be added later via a `venue_domains` table.
- R2 keys under `venues/{restaurant_id}/`. Landing copy: `apps/web/app/content/landing.ts` (en, pt); site name and email: `apps/web/app/app.config.ts`.

## Rules (from the plan)
- Owner's `restaurant_id` comes from the session only; every owner query goes through `scopedDb`.
- Guest menu: same HTML for every visitor, no cookies on GET; ♡ works without JS.
- No `v-html` on owner text. CSRF origin check on every non-GET route.
- Prices are `price_cents`; format with `Intl.NumberFormat` per language.
- Keep it simple: no speculative abstractions, prefer platform features over new deps.
- Never commit secrets; use `.env` / `.dev.vars` (gitignored).

## UI
- `apps/cms` (`/admin`): Nuxt UI components (`U*`) inside `layouts/admin.vue`. `apps/web` `/r/*` guest menu: Tailwind + own small components in `app/components/`, `layouts/guest.vue` (no `UApp`), to keep the public page light.
- Theme = CSS variables in `apps/web/app/assets/css/main.css` (`--brand`, `--surface`, `--text`, `--radius`). Use `bg-brand`, `text-ink`, `rounded-card`; no inline hex colors.
- Icons: Lucide only (`i-lucide-*`). No `@nuxt/image` (needs paid Cloudflare Images); photos resized in the browser, stored in R2.
- Guest design reference: ChoiceQR demo menu (layout/UX only, never copy their CSS, images, copy or branding) + `pdfs/` wireframes.
