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

## Rules (from the plan)
- Owner's `restaurant_id` comes from the session only; every owner query goes through `scopedDb`.
- Guest menu: same HTML for every visitor, no cookies on GET; ♡ works without JS.
- No `v-html` on owner text. CSRF origin check on every non-GET route.
- Prices are `price_cents`; format with `Intl.NumberFormat` per language.
- Keep it simple: no speculative abstractions, prefer platform features over new deps.
- Never commit secrets; use `.env` / `.dev.vars` (gitignored).
