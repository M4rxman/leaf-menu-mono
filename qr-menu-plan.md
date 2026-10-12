# QR Menu: plan v2

Restaurant menus with likes, plus a small CMS. This merges the original plan (Olek, project chat, 2026-10-07), the senior review (`reviews/qr-menu-plan-review.md`) and the decisions since then (`.notes/decisions.md`). Where the review and a later decision by Olek disagree, the decision wins.

**Status key:** ✅ decided · 🟡 proposed, not decided · ❓ open question

---

## 1. Context

A ChoiceQR-style product, not ordering. Each venue gets a public menu page, reached by a printed QR code. Guests browse categories and dishes, see prices and like counts, and keep a personal Favorites list. Venue owners and one super-admin edit everything in a back office (CMS). The owner of the project is new to hosting and wants something cheap, low-maintenance, and on a real domain.

First client: **Casa Strega**, Italian wine bar, Rua das Flores 123, Porto (see the wireframe PDFs).

- ✅ **Working name: Leaf Menu** (not final). Earlier ideas: Petisco, Qrumbs, Ementa, Mesa, HeartMenu, Folha. Run trademark and domain checks before the name is final.

## 2. Scope of v1

The original plan's "skipped" list removed things the spec and wireframes treat as the product. v1 now includes:

**Guest menu (client side)**
- Venue header: hero photo, name, brand story / About, opening hours, contacts, address with map and directions button, social links.
- Category tabs (with optional subcategories), a featured dish.
- Dish cards: photo, name, short description, price, and ✅ **only a ♡ icon with its like count on the right of each entry. No "+" button and no "order online" copy.** Tapping the card opens the dish detail.
- Dish detail view.
- ♡ Favorites view: dishes this device has liked.
- ✅ **Language switch showing only the languages the owner enabled** (see §5).

**CMS**
- Login; admin creates venues and owner accounts (no self-signup).
- Venue info, categories, dishes (✅ one price per dish, photo, visibility / sold out, allergens), reorder.
- ✅ **One CMS user (owner) per venue,** plus the super-admin.
- ✅ **Languages and translations managed by the owner** (see §5).
- QR download (SVG, print-resolution PNG, printable A6 card PDF).
- Owner changes own password; admin resets an owner's password.

**Still out of scope:** ordering / cart, payments, self-signup, OAuth, analytics, a native app.

## 3. Hosting: Cloudflare Workers + D1 (+ R2)

Kept from the original plan; the review confirmed the reasoning.

- **Domain on day one** (Cloudflare Registrar, ~$10/yr). Turn on auto-renew and registrar lock: the domain is printed on paper, so losing it kills every venue's QR codes.
- **Why not** Vercel (Hobby is non-commercial, Pro $20/seat/mo), Supabase (free tier pauses after 7 idle days, Pro $25/mo), Render/Railway (sleeps or metered, more cost for no gain), Hetzner VPS (cheapest, but you own patching, backups, TLS, uptime).
- **Why Cloudflare:** no servers, HTTPS and CDN included, free tier for development.
- **Changed by the review: go to Workers Paid ($5/mo) before the first real venue goes live, not "later".** The free plan's 100k requests/day cap is per account (one abusive script takes every menu offline until midnight UTC, error 1027), and its 10 ms CPU limit is tight for server rendering and password hashing (error 1102).
- D1 limits: 500 MB per database on Free (10 GB on Paid); the "5 GB" figure is the account total. Create the database with `--location weur` (close to Porto).
- Photos go to **R2** (needed in v1, see §4).

**Expected cost:** $0/mo while building, **$5/mo + domain** from the first live venue.

## 4. Architecture

One Worker, one database, one deploy, one repo.

```
menu.<domain>/q/{code}        permanent QR short link → 302 to /r/{slug}
menu.<domain>/r/{slug}[/{lang}] public menu (server-rendered HTML + tiny inline JS)
menu.<domain>/api/likes...    like / unlike / this device's likes
menu.<domain>/admin/...       CMS
        │
Cloudflare Worker
        │
D1 (SQLite) + R2 (photos)
```

- ✅ **Repository:** one GitHub mono-repo for the menu, the CMS and shared code.
- ✅ **Framework: Nuxt (Vue)** for both the guest menu and the CMS, deployed to Cloudflare Workers (Nitro `cloudflare-module` preset), installable as a PWA. Server-side API routes in Nuxt's `server/` directory talk to D1 and R2. If a store app for owners is ever wanted, wrap the same code with Capacitor rather than adding React Native. `qrcode` (npm) for QR images; PBKDF2 via WebCrypto for passwords.
- ⚠️ **Watch: CPU time.** Nuxt is heavier than the Hono setup the review assessed. Server-rendering a menu page costs more CPU per request, which matters on the Free plan's 10 ms limit (error 1102). Mitigations: be on Workers Paid before launch (already planned), measure render CPU in Workers Logs from the first deploy, and cache the public menu HTML (`routeRules` with `swr`) so most scans never re-render. Keep the CMS client-rendered if SSR there costs too much.
- **Review rules that still apply with Nuxt:** server-rendered guest menu with the same HTML for every visitor, plain form posts that work without JS for the ♡ button, no `v-html` on owner-entered text, CSRF origin check on every non-GET route (Nuxt has no built-in one, so add a small server middleware or `nuxt-security`).
- **Public page rules (review P1):** render the same HTML for every visitor, with no cookies on the menu GET, so it stays cacheable. The inline script fetches this device's liked ids and fresh counts from `GET /api/likes?r={slug}`. Caching (`s-maxage=60, stale-while-revalidate=300`) can be added later with no redesign.
- **Photos:** resize in the browser in the CMS before upload (WebP, ~1200px and ~400px), store R2 keys (not URLs) in D1, keys under the venue's prefix, alt text per language.

## 5. Languages and translations ✅

Replaces the spec's fixed PT/EN switch and the original plan's "multiple languages out of scope".

- Each venue owner picks the **languages** their menu offers and a **default language** in the CMS.
- The CMS lets the owner enter a **translation for every guest-facing text**: dish name and description, category names, venue info (about, hours text), photo alt text.
- Guests see a switch with only the enabled languages. A missing translation falls back to the default language.
- URLs: `/r/{slug}/{lang}` (or `?lang=`), with `<html lang>` set; `Accept-Language` picks the language only on the first visit.
- Prices formatted per language with `Intl.NumberFormat` (`pt-PT` → `8,00 €`).
- ✅ **Languages owners can pick at launch:** English, Portuguese, Spanish, German, Ukrainian, French. The guest UI strings (buttons, labels) are translated into all six by us; dish and venue text is translated by the owner.
- Note: the wireframes show Italian dish and category names (Aperitivo, Panizza, Vedi tutti). Treat those as proper names that the owner can keep in every language; Italian is not a launch UI language.

## 6. Data model (`migrations/0001_init.sql`)

Language-neutral fields on the main tables, text in `*_i18n` tables. All tables get foreign keys with `ON DELETE CASCADE` where it makes sense.

- `restaurants(id, slug UNIQUE, qr_code UNIQUE NOT NULL /* never editable */, default_lang, currency DEFAULT 'EUR', info_json, created_at, updated_at, deleted_at)`
- `restaurant_langs(restaurant_id, lang, position, PRIMARY KEY(restaurant_id, lang))`
- `restaurant_i18n(restaurant_id, lang, name, about, hours_text, PRIMARY KEY(restaurant_id, lang))`
- `slug_history(old_slug PRIMARY KEY, restaurant_id)` → 301 old slugs
- `users(id, email UNIQUE COLLATE NOCASE, password_hash /* algo$iter$salt$hash */, role, restaurant_id NULL, CHECK ((role='admin' AND restaurant_id IS NULL) OR (role='owner' AND restaurant_id IS NOT NULL)))`
- `sessions(id /* SHA-256 of token */, user_id, expires_at)`
- `categories(id, restaurant_id, parent_id NULL, position, is_visible, created_at, updated_at, deleted_at)` + `category_i18n(category_id, lang, name)`
- `dishes(id, restaurant_id, category_id, position, price_cents INTEGER /* one price per dish */, photo_key, is_visible, is_featured, allergens, likes INTEGER DEFAULT 0, created_at, updated_at, updated_by, deleted_at)` + `dish_i18n(dish_id, lang, name, description, photo_alt)`
- `likes(dish_id, device_id, PRIMARY KEY(dish_id, device_id))`
- Triggers `likes_ai` / `likes_ad` keep `dishes.likes` in sync atomically.
- Indexes: `dishes(restaurant_id, category_id, position)`, `likes(device_id)`, `sessions(user_id)`, `sessions(expires_at)`.
- Positions with gaps (10, 20, 30) or reordered in one `db.batch`.
- ✅ One price per dish. Variants (glass vs bottle) are separate dishes for now.
- ✅ One CMS user per venue: `CREATE UNIQUE INDEX one_owner_per_restaurant ON users(restaurant_id) WHERE role = 'owner'`.

## 7. Key behaviour

**Likes**
- Device = random UUID in an httpOnly cookie (1 year), **signed** (`uuid.hmac`), and **set only when the guest first taps ♡**, not on page view.
- Like = `INSERT OR IGNORE INTO likes`; unlike = `DELETE`. The triggers keep the count right; no separate UPDATE.
- **Idempotent API instead of a toggle:** `PUT /api/likes/{dishId}` and `DELETE /api/likes/{dishId}`, returning the new count and state.
- Rate limit likes (Workers Rate Limiting binding, e.g. 10/min per IP + dish, quiet 429).
- Nightly Cron reconciles counts. Likes are a soft signal; don't sell or rank on them.

**Tenancy**
- Owners' `restaurant_id` comes **from the session only**, never from the form or URL.
- Every owner query includes `AND restaurant_id = ?` and checks `meta.changes === 1`, else 404. All admin handlers go through one `scopedDb(user)` module; admin gets an explicit unscoped path.
- Covers reorder, move-to-category, photo upload/delete, QR download and create, not just edit.

**Auth and security**
- ❓ **CMS login, still open:** own email + password login (below) or Cloudflare Access.
- Session cookie `__Host-session`, `Secure`, `HttpOnly`, `SameSite=Lax` (or Strict); token is 32 random bytes, stored hashed; rotate on login, delete on logout and on password change, ~14-day sliding expiry, expired rows purged nightly.
- CSRF: Origin-check middleware on every non-GET route, including likes. No state changes on GET.
- Login throttling (5 failures / 15 min per email and per IP), dummy hash for unknown emails, one error message.
- PBKDF2: verify on day one whether Workers allows more than 100k iterations; store the iteration count so it can be raised.
- ❓ Alternative: put `/admin` behind Cloudflare Access (free up to 50 users, email one-time codes) and drop passwords and sessions entirely for year one.
- Security headers via `nuxt-security` or route rules (CSP with nonce, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` on admin); escape all owner text; server-side length limits (name ≤ 80, description ≤ 300).

**QR codes**
- QR encodes the permanent `/q/{code}`, so renaming a slug never breaks printed codes.
- Error correction M or Q.

**Accessibility**
- ♡ is a real `<button aria-pressed>` with a label like "Like Bufalina Panizza, 329 likes", an `aria-live` update, and works without JS (form post).
- 44×44 px tap targets, visible focus, 4.5:1 contrast over photos, `prefers-reduced-motion` on the heart animation. Test once with VoiceOver on an iPhone.

## 8. Data safety

- D1 Time Travel (7 days Free / 30 days Paid) rewinds the whole database, so it is not the backup.
- Nightly off-account export (GitHub Actions + `wrangler d1 export`), keep 30–90 days, test one restore. Back up R2 photos too.
- Soft delete (`deleted_at`) with an Undo in the CMS for dishes, categories and venues.

## 9. Repo layout and operations

Files (Nuxt): `nuxt.config.ts`, `wrangler.toml` (D1, R2, rate limit bindings, custom domain, staging environment), `migrations/`, `pages/r/[slug]/` (guest menu), `pages/admin/` (CMS), `server/api/` (likes, admin API), `server/middleware/` (auth, CSRF), `server/utils/scoped-db.ts`, `i18n/` (UI strings for the six languages), `seed.sql` (Casa Strega sample, §12), `test/`.

- **Deploy:** push to `main` → Workers Builds. CI applies `wrangler d1 migrations apply --remote` **before** deploying code. Migrations are additive; drop columns only in a later release.
- **Staging:** a second Worker + D1 via wrangler environments.
- **Monitoring:** Workers Logs plus a free external uptime check on one real menu URL.
- **Tests:** Vitest (with `@nuxt/test-utils`; `@cloudflare/vitest-pool-workers` for server routes) against local D1, with tenancy tests for every mutating route. Keep a one-line curl smoke test for after deploys.

## 10. Verification

1. `wrangler dev` with local D1 and the seed. Open `/r/demo`: categories, prices and dishes render in the default language; switching language shows translations and falls back where one is missing.
2. Tap ♡: count goes to 1 and the dish appears in Favorites. Tap again: back to 0. A second browser profile counts separately. Retrying the same PUT doesn't change the count.
3. As owner, add a language, translate a dish, edit a price; `/r/demo` shows the changes.
4. As owner A, try every mutating route against venue B's data: all return 404.
5. Rename the slug: the downloaded QR (`/q/{code}`) still lands on the menu. Scan it with a phone against the deployed domain.
6. Restore last night's export into staging once.

## 11. Order of work

1. Settle the open questions below with the client and Olek.
2. Schema v1: categories, prices, i18n and owner languages, visibility, soft delete, foreign keys, triggers, indexes, QR short codes.
3. Public menu (read-only), language switch, accessible ♡ button, Favorites.
4. CMS: auth (own or Cloudflare Access), scoped data module, CSRF, venue/category/dish CRUD with translations, photo upload, QR download.
5. Tenancy tests on every mutating route.
6. Backups, staging, monitoring, Workers Paid, then print the first QR codes.
7. Pre-commit lint hook: ESLint on staged files via husky + lint-staged. Requested as `@next/eslint`, but that is the Next.js plugin; this repo is Nuxt, so use `@nuxt/eslint` (🟡 confirm with Olek).

## Open questions

- ❓ CMS login: own login or Cloudflare Access (being explained in the project chat).
- ❓ Final product name (Leaf Menu is the working name).
- ❓ Real menu content from Casa Strega: the PDFs are wireframes with placeholder text, not a menu (see §12).

## 12. Casa Strega sample data (from the wireframes)

Source: the two wireframe PDFs (desktop and mobile). The copies Olek attached on 2026-10-12 are byte-identical to the ones already in the project. Use this as `seed.sql` demo content, not as the real menu: like counts differ between the two PDFs and are placeholders, several descriptions are in Ukrainian placeholder copy, and the full price list is missing.

**Venue:** Casa Strega, "House of Italian Magic", tagline "Panizza · Aperitivo · Vino d'Italia". Italian wine bar, Rua das Flores 123, Porto, Portugal. Links: Instagram, Contatti. Desktop nav: Menu, Vini, About, Location, language switch, ♡ Favorites.

**Categories (in order):** Aperitivo ("Drink + Stuzzichini"), Pizza al taglio, Panizza, Tagliere, Bevande, Birre, Analcolici.

| Category | Dish | Description (as in wireframe) | Price |
|---|---|---|---|
| Aperitivo | Classico Aperitivo | Mozzarella, Panizza, Azeitonas, Tarallini | 8.00 € |
| Aperitivo | Veg Aperitivo | Fresella, Panizza, Pickles | 8.00 € |
| Aperitivo | Aperol Spritz | Aperol, Prosecco, Laranja | 5.00 € |
| Pizza al taglio | Margherita | Molho tomate, Fior di Latte, Manjericão | 3.50 € |
| Pizza al taglio | Del Giorno | Fatia com ingrediente do dia | 3.50 € |
| Pizza al taglio | Special | Seasonal special (placeholder in Ukrainian) | 4.50 € |
| Panizza | Bufalina Panizza (featured) | Tomate, Mozzarella di Bufala Campana, pesto | 8.00 € |
| Panizza | Mortazza | Mortadela italiana, cheese and sauce (partly Ukrainian) | 8.00 € |
| Panizza | Calabrisella | Spicy salami, cheese, vegetables (placeholder in Ukrainian) | 8.00 € |

Tagliere, Bevande, Birre and Analcolici have no dishes in the wireframes.

**Where the wireframes conflict with the review (the review wins):**
- "+" button on every card and "order online" hero copy: removed; heart only, no ordering (also Olek's decision).
- PT | EN switch only: replaced by owner-chosen languages from the six above.
- Price shown as `8.00 €`: formatted per language instead (`8,00 €` in Portuguese).
- Mixed Ukrainian, Italian and Portuguese placeholder copy: needs real copy from the client per language.
- No sold-out, allergen or photo alt text in the wireframes: kept from the review as v1 CMS fields.
