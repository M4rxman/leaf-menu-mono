# Leaf Menu (leaf-menu-mono)

QR restaurant menus with likes + a small CMS (ChoiceQR-like, no ordering). First client: Casa Strega, Porto.

**Spec: `qr-menu-plan.md`.** Where it conflicts with the wireframe PDFs, the plan wins (♡ only, no "+"/ordering; owner-chosen languages, not PT|EN; per-language price format).

## Reference material
- `pdfs/FUNCTIONAL SPEC — CHOICEQR-LIKE.pdf` — functional spec
- `pdfs/CASA STREGA — WEBSITE WIREFRAME {DESKTOP,MOBILE}.pdf` — wireframes (mobile first)

## Stack
Nuxt 4 (Vue) on Cloudflare Workers (Nitro `cloudflare-module`), D1 (SQLite) binding `DB`, R2 binding `PHOTOS`. Config in `wrangler.toml`. Requires Node ≥ 22.22.3 or ≥ 24.15.

## Commands
- `npm run dev` — Nuxt dev server (no D1 bindings yet; use `preview` for anything touching the DB)
- `npm run preview` — build + `wrangler dev` on http://localhost:8787 with local D1/R2
- `npm run db:migrate` / `npm run db:seed` — apply migrations / load Casa Strega demo (slug `demo`) into local D1
- `npm test` — schema tests (node:test + node:sqlite, no deps)
- `npm run lint` — ESLint (`@nuxt/eslint`); a husky pre-commit hook runs `eslint --fix` on staged files via lint-staged

## Layout
- `app/` — Nuxt app (`pages/r/[slug]/` guest menu, `pages/admin/` CMS — to come)
- `server/api/`, `server/middleware/`, `server/utils/scoped-db.ts` — to come
- `migrations/` — D1 migrations, additive only; `seed.sql` — demo data (re-runnable)
- `test/` — tests

## Architecture (SOLID, only at real seams)
- `server/domain/` — pure TS, imports nothing from Nuxt/D1: types, ports (`Db`, `MenuReader`), `MenuService`, `resolveText`, `formatPrice`.
- `server/infra/` — implementations of ports (`d1-db.ts`, `d1-menu-reader.ts` hold all guest-page SQL). `server/utils/container.ts` is the only place that touches Cloudflare bindings.
- `server/api/` handlers stay thin: parse, call a service, return. Services take ports in the constructor.
- Abstract only where an implementation changes (D1 vs test SQLite, R2, auth provider) or a rule must be enforced once (CMS `TenantScopedRepository`). Interfaces by default, no DI container, no speculative base classes. Every port implementation must pass the same contract test (`test/menu-reader.contract.test.mjs`).
- Server `.ts` files use `import type` and explicit `.ts` import paths and no enums/constructor parameter properties, so `node --experimental-strip-types` can run them in tests.

## Rules (from the plan)
- Owner's `restaurant_id` comes from the session only; every owner query goes through `scopedDb`.
- Guest menu: same HTML for every visitor, no cookies on GET; ♡ works without JS.
- No `v-html` on owner text. CSRF origin check on every non-GET route.
- Prices are `price_cents`; format with `Intl.NumberFormat` per language.
- Keep it simple: no speculative abstractions, prefer platform features over new deps.
- Never commit secrets; use `.env` / `.dev.vars` (gitignored).

## UI
- `/admin`: Nuxt UI components (`U*`) inside `layouts/admin.vue`. `/r/*` guest menu: Tailwind + own small components in `app/components/`, `layouts/guest.vue` (no `UApp`), to keep the public page light.
- Theme = CSS variables in `app/assets/css/main.css` (`--brand`, `--surface`, `--text`, `--radius`). Use `bg-brand`, `text-ink`, `rounded-card`; no inline hex colors.
- Icons: Lucide only (`i-lucide-*`). No `@nuxt/image` (needs paid Cloudflare Images); photos resized in the browser, stored in R2.
- Guest design reference: ChoiceQR demo menu (layout/UX only, never copy their CSS, images, copy or branding) + `pdfs/` wireframes.
