# Chilly Menu: plan v3

Restaurant menus with likes, plus a small CMS. This merges the original plan (Olek, project chat, 2026-10-07), the senior review (`reviews/qr-menu-plan-review.md`), the translation review (`plan/translation-proposal-review.md`) and the decisions in `.notes/decisions.md`. Where the review and a later decision by Olek disagree, the decision wins.

**Status key:** ✅ decided by Olek · 🔧 engineering default in this plan (change it if you disagree) · 🟡 proposed, not decided · ❓ open question

### What changed from v2 (2026-10-13)
- Compared with the copy Olek uploaded on 2026-10-13. That copy was an older v2: it still had "Leaf Menu" and a six-language pool, and those are superseded by later decisions (Chilly Menu, curated ~40-language pool). It added one thing this file lacked, a pre-commit lint hook; that is now in §12, using `@nuxt/eslint` (the uploaded copy correctly noted that `@next/eslint` is the Next.js plugin and doesn't apply to Nuxt).
- Made the plan concrete: package list (§4), repo layout (§5), full initial migration SQL (§6), routes with request and response shapes (§8), performance budget (§10), CI pipeline and config (§12), milestones with acceptance checks (§14).
- Engineering choices changed or added in v3: guest pages ship almost no JavaScript (§4), the PWA covers the CMS only (§4), Drizzle ORM is used for typed queries (§4), shared Zod schemas validate input (§4), allergens are a 14-bit field (§6), and language tags keep their canonical case (`pt-BR`, not `pt-br`; §6).

### CTO verdict on the recorded decisions (2026-10-13)
None of Olek's decisions is unsound. Ranked by risk:
1. **Nuxt is the most expensive decision.** It costs more CPU per request and more moving parts than Hono for what is mostly static HTML. It's acceptable because v3 turns off hydration on guest pages and sets a CPU budget (§10). If the M2 budget fails, the fallback is guest pages as Nitro server routes rendering plain HTML, with Nuxt kept for the CMS. Decide at the end of M2, not later.
2. **~40 languages including right-to-left** is cheap in code (a list) but expensive in testing. It stays, with an Arabic menu test as an M2 acceptance check. If that slips, hide ar, he, fa and ur from the pool until it passes; don't ship untested RTL.
3. **Scope is the real launch risk for one developer.** 🟡 Proposed cuts to "after the first venue is live", none of which changes the schema: subcategories in the CMS UI (keep the column), A6 PDF card (SVG and PNG are enough to print), installable CMS app, hreflang tags, missing-translations counter. Everything else in M0–M7 stays.
4. **One owner per venue and one price per dish** are right for v1; both are one migration away from changing.

---

## 1. Context

A ChoiceQR-style product, not ordering. Each venue gets a public menu page, reached by a printed QR code. Guests browse categories and dishes, see prices and like counts, and keep a personal Favorites list. Venue owners and one super-admin edit everything in a back office (CMS). The project owner is new to hosting and wants something cheap, low-maintenance, and on a real domain.

First client: **Casa Strega**, Italian wine bar, Rua das Flores 123, Porto (see the wireframe PDFs and §16).

- ✅ **Product name: Chilly Menu** (final, 2026-10-13; "chill to use"). Still to do: trademark and domain checks before buying the domain.

## 2. Scope of v1

**Guest menu (client side)**
- Venue header: hero photo, name, brand story / About, opening hours, contacts, address with map and directions button, social links.
- Category tabs (with optional subcategories), a featured dish.
- Dish cards: photo, name, short description, price, and ✅ **only a ♡ icon with its like count on the right of each entry. No "+" button and no "order online" copy.** Tapping the card opens the dish detail.
- Dish detail page (its own URL, so it can be shared and works without JS).
- ♡ Favorites page: dishes this device has liked.
- ✅ **Language switch showing only the languages the owner enabled** (§7). One language enabled = no switch.

**CMS**
- Login; admin creates venues and owner accounts (no self-signup).
- Venue info, categories, dishes (✅ one price per dish, photo, visible / sold out, featured, allergens), reorder.
- ✅ **One CMS user (owner) per venue,** plus the super-admin.
- ✅ **Languages and translations managed by the owner** (§7), with a "missing translations" count per language.
- QR download (SVG, print-resolution PNG, printable A6 card PDF).
- Owner changes own password; admin resets an owner's password (temporary password, must change on next login).
- Undo for deleted dishes and categories (30 days).

**Out of scope for v1:** ordering / cart, payments, self-signup, OAuth, analytics dashboards, a native app, price variants, several venues per owner.

## 3. Hosting: Cloudflare Workers + D1 + R2

Kept from the original plan; the review confirmed the reasoning.

- **Domain on day one** (Cloudflare Registrar, ~$10/yr). Turn on auto-renew and registrar lock: the domain is printed on paper, so losing it kills every venue's QR codes.
- **Why not** Vercel (Hobby is non-commercial, Pro $20/seat/mo), Supabase (free tier pauses after 7 idle days, Pro $25/mo), Render/Railway (sleeps or metered), Hetzner VPS (cheapest, but you own patching, backups, TLS, uptime).
- **Workers Paid ($5/mo) before the first real venue goes live.** The free plan's 100k requests/day cap is per account (one abusive script takes every menu offline until midnight UTC, error 1027), and its 10 ms CPU limit is tight for server rendering and password hashing (error 1102).
- D1: 500 MB per database on Free, 10 GB on Paid. Create with `--location weur` (close to Porto).
- Photos in **R2**; nightly backups go to a bucket outside this account (§11).

**Expected cost:** $0/mo while building, **$5/mo + domain** from the first live venue.

## 4. Architecture and stack

```
chillymenu.<tld>/q/{code}                 permanent QR short link → 302 to /r/{slug}
chillymenu.<tld>/r/{slug}/{lang}/...      guest menu (server-rendered, ~3 KB of JS)
chillymenu.<tld>/api/...                  likes API, auth API, CMS API (JSON)
chillymenu.<tld>/admin/...                CMS (client-rendered Vue app, installable PWA)
        │
Two Cloudflare Workers, same domain (Nuxt / Nitro, cloudflare-module preset):
  web  → /, /r/*, /q/*, /api/likes, /api/menu    (apps/web)
  cms  → /admin/*, /api/auth, /api/admin         (apps/cms)
        │
D1 (SQLite) · R2 (photos) · Rate Limiting binding · Cron Trigger (nightly jobs)
```

- ✅ **Repository:** one GitHub mono-repo (npm workspaces: `apps/web`, `apps/cms`, `packages/shared`).
- 🔧 **Two Workers, one D1 and one R2 (v4 change).** The CMS is its own Nuxt app so the public menu bundle stays small and the CMS can be client-rendered and deployed on its own. Both bind the same database and bucket. Cloudflare routes send `/admin/*`, `/api/auth/*` and `/api/admin/*` to the CMS Worker and everything else to web. Open: the session cookie scope between the two.
- ✅ **Framework: Nuxt 4 (Vue 3)** for both the guest menu and the CMS, as two apps sharing `packages/shared`.
- ⚠️ **Watch: CPU time.** Nuxt is heavier than the Hono setup the review assessed. The budget and how it's measured are in §10.

**🔧 Rendering per area (v3 change)**
| Area | Route rule | Why |
|---|---|---|
| Guest menu `/r/**` | SSR, **no Vue hydration** (`experimentalNoScripts: true`), plus one small vanilla script `public/menu.js` for hearts | The menu is static content. Hydrating Vue for it costs ~40 KB of JS and CPU on cheap phones for nothing. Links handle tabs and language; a form post handles ♡ without JS. Matches the review's "server-rendered + tiny inline JS". Verify the route rule in M2; fallback is `<NuxtIsland>` server components. |
| Favorites `/r/{slug}/{lang}/favorites` | SSR, `Cache-Control: private, no-store` | Device-specific, read from the device cookie on the server. |
| CMS `/admin/**` | `ssr: false` (client-rendered SPA) | No SSR CPU cost, simpler auth, behind login anyway. |
| QR `/q/**` | Server route, 302 | |

**🔧 PWA for the CMS only (v3 change).** The manifest and service worker are scoped to `/admin/` (`@vite-pwa/nuxt`), so owners can install the CMS on their phone. Guests get **no service worker**: a cached menu would show old prices after the owner edits them, and a guest who scans once gains nothing from an install.

**Packages** (🔧 unless marked)
| Need | Package | Note |
|---|---|---|
| Framework | `nuxt@4` | ✅ |
| Typed DB queries | `drizzle-orm` (D1 driver) | Schema in TS gives typed queries. SQL migrations stay hand-written and reviewed (§6), because triggers, partial indexes and CHECKs are clearer in SQL. A test compares the Drizzle schema with the migrated DB. |
| Validation | `zod` | One schema per request body in `packages/shared/src/schemas/`, used by the CMS forms and the API. |
| UI strings | `@nuxtjs/i18n` (`strategy: 'no_prefix'`, lazy JSON) | The locale is set from the `{lang}` URL segment, not from the module's own prefixing. |
| Security headers | `nuxt-security` | CSP with nonces, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`. Its CSRF option is off; we use our own Origin check (§9). |
| QR | `qrcode` | SVG and PNG. A6 card PDF with `pdf-lib`. |
| PWA (CMS) | `@vite-pwa/nuxt` | Scoped to `/admin/`. |
| Passwords | WebCrypto PBKDF2-SHA256 | No library. Iterations measured in M0. |
| Lint / format | `@nuxt/eslint`, `prettier`, `husky`, `lint-staged` | §12. |
| Tests | `vitest`, `@nuxt/test-utils`, `@cloudflare/vitest-plugin` (successor of the deprecated vitest-pool-workers), `@playwright/test`, `@axe-core/playwright` | §13. |

## 5. Repo layout

```
chilly-menu/
├─ apps/
│  ├─ web/                                  public Worker: landing + guest menu
│  │  ├─ app/
│  │  │  ├─ pages/
│  │  │  │  ├─ r/[slug]/[lang]/index.vue          menu
│  │  │  │  ├─ r/[slug]/[lang]/d/[dishId].vue     dish detail
│  │  │  │  └─ r/[slug]/[lang]/favorites.vue      favorites
│  │  │  ├─ components/menu/                      DishCard, HeartButton, LangSwitch, CategoryTabs
│  │  │  └─ assets/css/                           logical properties only (margin-inline-*, no left/right)
│  │  ├─ server/
│  │  │  ├─ routes/q/[code].get.ts                QR short link
│  │  │  ├─ routes/r/[slug]/index.get.ts          language redirect
│  │  │  ├─ api/likes/…                           §8
│  │  │  ├─ middleware/                           01.origin-check.ts
│  │  │  ├─ utils/device.ts                       signed device cookie: read in the likes handlers only
│  │  │  └─ utils/container.ts                    composition root (Cloudflare bindings)
│  │  ├─ i18n/locales/                            en.json pt.json es.json de.json uk.json fr.json
│  │  ├─ public/menu.js                           hearts script for guest pages (< 3 KB)
│  │  ├─ test/                                    locale parity, worker/, e2e/
│  │  ├─ nuxt.config.ts · wrangler.toml
│  ├─ cms/                                  owner Worker, baseURL /admin/, ssr: false
│  │  ├─ app/
│  │  │  ├─ pages/                                login, venue, languages, categories, dishes, qr, users
│  │  │  └─ components/                           TranslationTabs, PhotoUploader, SortableList
│  │  ├─ server/
│  │  │  ├─ api/auth/…, api/admin/…               §8
│  │  │  ├─ middleware/                           01.origin-check.ts, 02.session.ts
│  │  │  ├─ utils/scoped-db.ts                    every owner query goes through this
│  │  │  ├─ utils/password.ts, session.ts
│  │  │  └─ tasks/nightly.ts                      reconcile likes, purge sessions, purge soft-deleted rows
│  │  ├─ nuxt.config.ts · wrangler.toml
├─ packages/
│  └─ shared/                               @chilly/shared, TS source, no build step
│     ├─ src/
│     │  ├─ langs.ts                              the curated pool (§7) + isLang()
│     │  ├─ paths.ts, plural.ts
│     │  ├─ domain/                               pure TS: types, ports, MenuService, resolveText, formatPrice
│     │  ├─ infra/                                D1 implementations of the ports
│     │  ├─ schemas/                              Zod request schemas
│     │  └─ allergens.ts                          the 14 EU allergens ↔ bit positions
│     ├─ migrations/0001_init.sql                 §6
│     ├─ seed.sql                                 §16 (Casa Strega demo)
│     └─ test/                                    schema, domain, contract tests
├─ .github/workflows/                       ci.yml, backup.yml
├─ drizzle.config.ts · eslint.config.mjs (per workspace)
└─ package.json                             npm workspaces, Node ≥ 22.22.3
```

## 6. Data model: `migrations/0001_init.sql`

D1 enforces foreign keys. Times are ISO-8601 UTC text. Text lives in `*_i18n` tables; everything else is language-neutral.

```sql
-- Venues ------------------------------------------------------------------
CREATE TABLE restaurants (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE
                 CHECK (length(slug) BETWEEN 3 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*'),
  qr_code        TEXT NOT NULL UNIQUE CHECK (length(qr_code) = 6),  -- permanent, never editable
  default_lang   TEXT NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
  info_json      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(info_json)), -- phone, address, map_url, instagram, hours
  hero_photo_key TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT,
  -- the default language must be one of the venue's enabled languages
  FOREIGN KEY (id, default_lang) REFERENCES restaurant_langs (restaurant_id, lang)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE restaurant_langs (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL  -- canonical BCP 47 ('pt', 'pt-BR'); validated by isLang() in the app
                CHECK (length(lang) BETWEEN 2 AND 12 AND lang NOT GLOB '*[^A-Za-z0-9-]*'),
  position      INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, lang)
);

CREATE TABLE restaurant_i18n (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,
  name          TEXT NOT NULL CHECK (length(name) <= 80),
  tagline       TEXT CHECK (length(tagline) <= 120),
  about         TEXT CHECK (length(about) <= 2000),
  hours_text    TEXT CHECK (length(hours_text) <= 300),
  PRIMARY KEY (restaurant_id, lang)
);

CREATE TABLE slug_history (
  old_slug      TEXT PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Users and sessions ------------------------------------------------------
CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,           -- 'pbkdf2-sha256$<iter>$<salt b64>$<hash b64>'
  role                 TEXT NOT NULL CHECK (role IN ('admin','owner')),
  restaurant_id        INTEGER REFERENCES restaurants(id) ON DELETE RESTRICT,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((role = 'admin' AND restaurant_id IS NULL) OR (role = 'owner' AND restaurant_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_owner_per_restaurant ON users(restaurant_id) WHERE role = 'owner';

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                 -- hex SHA-256 of the cookie token, never the token
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- Menu --------------------------------------------------------------------
CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  is_visible    INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);
CREATE INDEX categories_menu ON categories(restaurant_id, parent_id, position);

CREATE TABLE category_i18n (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (length(name) <= 60),
  subtitle    TEXT CHECK (length(subtitle) <= 80),   -- e.g. "Drink + Stuzzichini"
  PRIMARY KEY (category_id, lang)
);

CREATE TABLE dishes (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 10000000), -- ✅ one price per dish
  photo_key     TEXT,                              -- R2 key prefix: r/{restaurant_id}/dishes/{id}/{uuid}
  is_visible    INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1)),
  is_sold_out   INTEGER NOT NULL DEFAULT 0 CHECK (is_sold_out IN (0,1)),
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  allergens     INTEGER NOT NULL DEFAULT 0 CHECK (allergens BETWEEN 0 AND 16383), -- 14 EU allergens as bits (shared/allergens.ts)
  likes         INTEGER NOT NULL DEFAULT 0,        -- maintained only by the triggers below
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TEXT
);
CREATE INDEX dishes_menu ON dishes(restaurant_id, category_id, position);

CREATE TABLE dish_i18n (
  dish_id     INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (length(name) <= 80),
  description TEXT CHECK (length(description) <= 300),
  photo_alt   TEXT CHECK (length(photo_alt) <= 150),
  PRIMARY KEY (dish_id, lang)
);

-- Likes -------------------------------------------------------------------
CREATE TABLE likes (
  dish_id    INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (dish_id, device_id)
);
CREATE INDEX likes_device ON likes(device_id);

CREATE TRIGGER likes_ai AFTER INSERT ON likes
BEGIN UPDATE dishes SET likes = likes + 1 WHERE id = NEW.dish_id; END;
CREATE TRIGGER likes_ad AFTER DELETE ON likes
BEGIN UPDATE dishes SET likes = likes - 1 WHERE id = OLD.dish_id; END;
```

Rules the SQL can't express, enforced in `scoped-db.ts` and covered by tests:
- Every dish and category has a `*_i18n` row in the venue's **default language** (the name is required there; other languages are optional).
- `dishes.category_id` belongs to the same restaurant as the dish; `parent_id` too.
- Positions use gaps of 10; a reorder rewrites them in one `db.batch`.
- Soft-deleted rows (`deleted_at` set) are hidden everywhere and hard-deleted by the nightly task after 30 days (the cascades then remove their likes and translations).
- Verify in M1 that D1 honours `DEFERRABLE INITIALLY DEFERRED` inside `db.batch`. If not, drop that foreign key and enforce "default is enabled" in the same batch in the app.

## 7. Languages and translations

**Three layers**
1. **Pool**, what an owner may pick from. ✅ A **curated world list of about 40 languages** (decided 2026-10-13), as a `const` in `shared/langs.ts`. 🟡 Starting list, edit freely: en, pt, es, fr, de, it, nl, uk, pl, cs, sk, hu, ro, bg, el, hr, sr, sl, da, sv, nb, fi, et, lv, lt, ru, tr, ar, he, fa, hi, bn, ur, zh, ja, ko, th, vi, id, ms, ca, eu, gl. (Norwegian is `nb` (Bokmål); browsers send `nb`, not `no`.)
2. **Enabled per venue** (`restaurant_langs` + `default_lang`), what guests can choose. At least one; the default can't be disabled. Disabling a language keeps its translations.
3. **Guest resolution**: `/r/{slug}` redirects to `/r/{slug}/{lang}` using `Accept-Language` ∩ enabled, else the default. `/r/{slug}/{lang}` with a language that isn't enabled → 302 to the default-language URL.

**Codes:** canonical BCP 47 tags from `Intl.getCanonicalLocales` (`pt`, later `pt-BR`); v1 offers base codes only. `isLang(tag)` = canonical form is in the pool. Language names in their own language from `Intl.DisplayNames`, first letter upper-cased (it returns `português`).

**Venue content:** owner-entered per language. A missing text falls back to the default language and is wrapped with its real language (`<span lang="pt">`).

**UI chrome:** ✅ ships in **EN, PT, ES, DE, UK, FR** at launch, including the 14 allergen names. Other pool languages show chrome in English until a JSON file is added. Fallback: guest's language → venue default → English. CI fails if a locale file is missing a key that `en.json` has.

**Page details:** `<html lang dir>` per language; `dir="rtl"` for ar, he, fa, ur (`Intl.Locale#getTextInfo`, with a 4-entry fallback list). CSS logical properties only (a lint rule bans `left`/`right` margins and paddings). `<link rel="alternate" hreflang>` per enabled language. Prices via `Intl.NumberFormat(lang, {style:'currency', currency})`. System font stack for menu text so every script renders; brand font for headings only.

## 8. Routes and API

All JSON errors use one shape: `{ "error": { "code": "validation_failed", "message": "…", "fields": { "name.pt": "required" } } }` with status 400, 401, 403, 404, 409, 422 or 429. Request bodies are validated with the Zod schema of the same name in `packages/shared/src/schemas/`.

### Guest pages
| Route | Behaviour |
|---|---|
| `GET /q/{code}` | 302 → `/r/{slug}`. Unknown code → 404 page in English. |
| `GET /r/{slug}` | 302 → `/r/{slug}/{lang}` (§7). Old slug in `slug_history` → 301 to the new slug. Slugs are lower case: `/r/Demo` and `/r/DEMO/PT` → 301 to `/r/demo/pt` if that venue exists, else 404. |
| `GET /r/{slug}/{lang}` | Menu. Same HTML for every visitor, no cookies set. |
| `GET /r/{slug}/{lang}/d/{dishId}` | Dish detail. |
| `GET /r/{slug}/{lang}/favorites` | This device's liked dishes. `private, no-store`. |

### Likes API
| Method and path | Request | Response |
|---|---|---|
| `GET /api/r/{slug}/likes` | device cookie (optional) | `200 { "counts": { "12": 295, "13": 312 }, "liked": [12] }`, `private, no-store` |
| `PUT /api/likes/{dishId}` | none | `200 { "dishId": 12, "liked": true, "count": 296 }`. Sets the signed device cookie if missing. Idempotent. |
| `DELETE /api/likes/{dishId}` | device cookie | `200 { "dishId": 12, "liked": false, "count": 295 }`. Idempotent. |
| `POST /api/likes/{dishId}` | form `liked=1` or `liked=0` (no-JS fallback) | `303` back to `/r/{slug}/{lang}#dish-{dishId}` |

Errors: 404 if the dish is hidden or deleted (sold-out dishes can still be liked); 429 `{ "error": { "code": "rate_limited" } }` after 10 like requests per minute per IP and dish. The limit is spent before the dish is looked up, so probing ids is limited too. The no-JS `POST` never shows JSON: every outcome is a `303` back to the dish (to `/` for an unknown dish).

🟡 **Open, decide before M7:** guests at one venue share one public Wi-Fi IP, so ten guests liking the same popular dish within a minute would get 429. Not measured yet. Options: raise the per-IP limit (for example 60 per minute per IP and dish) and add a per-device limit of 10 (the device id from the cookie, only when present); or keep it and watch the 429 rate on staging.

### Auth API
| Method and path | Request | Response |
|---|---|---|
| `POST /api/auth/login` | `{ "email": "…", "password": "…" }` | `204` + `__Host-session` cookie; `401 invalid_credentials` (same message for unknown email); `429` after 5 failures / 15 min per email or IP |
| `POST /api/auth/logout` | none | `204`, session row deleted |
| `POST /api/auth/password` | `{ "current": "…", "new": "…" }` (new ≥ 12 chars) | `204`, all other sessions of this user deleted |
| `GET /api/auth/me` | none | `200 { "id": 3, "email": "…", "role": "owner", "restaurantId": 1, "mustChangePassword": false }` |

### CMS API (owner: own venue only; admin: any venue via `?venue={id}`)
The owner's venue always comes from the session; `scopedDb(user, venueParam)` ignores `venueParam` for owners. Every write checks `meta.changes === 1`, else 404.

| Method and path | Request (shape) | Response |
|---|---|---|
| `GET /api/admin/venue` | | `{ id, slug, qrCode, currency, defaultLang, langs: ["pt","en"], info: {...}, i18n: { pt: { name, tagline, about, hoursText } } }` |
| `PATCH /api/admin/venue` | `{ slug?, currency?, info?, i18n?: { [lang]: {...} } }` | updated venue; slug change writes `slug_history` |
| `PUT /api/admin/venue/languages` | `{ "langs": ["pt","en","uk"], "defaultLang": "pt" }` | `200 { langs, defaultLang }`; `422` if a tag isn't in the pool or the default isn't in `langs` |
| `GET /api/admin/translations/missing` | | `{ "en": 4, "uk": 11 }` |
| `GET /api/admin/categories` | | tree with `i18n` per category |
| `POST /api/admin/categories` | `{ parentId?, isVisible, i18n: { pt: { name, subtitle? } } }` | `201` category |
| `PATCH /api/admin/categories/{id}` | any of the above | category |
| `DELETE /api/admin/categories/{id}` | | `204` (soft delete) |
| `POST /api/admin/categories/{id}/restore` | | category |
| `GET /api/admin/dishes?categoryId=` | | list with `i18n` |
| `POST /api/admin/dishes` | `{ categoryId, priceCents: 800, isVisible, isSoldOut, isFeatured, allergens: ["gluten","milk"], i18n: { pt: { name, description?, photoAlt? } } }` | `201` dish |
| `PATCH /api/admin/dishes/{id}` | any of the above | dish |
| `DELETE /api/admin/dishes/{id}` · `POST …/{id}/restore` | | `204` · dish |
| `PUT /api/admin/reorder` | `{ "kind": "dishes", "parentId": 4, "ids": [12, 9, 13] }` | `204`; `404` if any id isn't in this venue and parent |
| `POST /api/admin/dishes/{id}/photo` | multipart: `large` (WebP ≤ 1200 px, ≤ 400 KB), `small` (WebP ≤ 400 px) | `{ "photoKey": "r/1/dishes/12/…" }` |
| `DELETE /api/admin/dishes/{id}/photo` | | `204` |
| `GET /api/admin/qr?format=svg\|png\|pdf` | | file download of `https://<domain>/q/{qrCode}` |
| `POST /api/admin/restaurants` (admin) | `{ slug, defaultLang, langs, i18n: { [defaultLang]: { name } } }` | `201` venue with generated `qrCode` |
| `POST /api/admin/restaurants/{id}/owner` (admin) | `{ email }` | `201 { userId, tempPassword }`; `409` if the venue already has an owner |
| `POST /api/admin/users/{id}/reset-password` (admin) | | `{ tempPassword }`, all sessions deleted, `must_change_password = 1` |

Photos are served from `GET /img/{photoKey}` (Worker reads R2, `Cache-Control: public, max-age=31536000, immutable`; the key contains a UUID, so a new photo is a new URL).

## 9. Key behaviour and security

**Likes**
- Device id: random UUID, cookie `chilly_device={uuid}.{hmac}` signed with `DEVICE_SECRET`, `HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`. Set **only on the first ♡ tap** of a dish that can be liked (never for a 404 or 429, an unlike, or a read). `Secure` is left off when the request is plain HTTP, so a phone testing over the LAN keeps the cookie; production is always HTTPS.
- Like = `INSERT OR IGNORE INTO likes`; unlike = `DELETE`; triggers keep `dishes.likes` right. The nightly task recomputes counts as a safety net.
- Likes are a soft signal: no ranking across venues or paid features built on them.

**Tenancy**
- Owners' `restaurant_id` comes from the session only. Every owner query goes through `scopedDb` and includes `AND restaurant_id = ?`. Covers reorder, move-to-category, photo upload/delete (R2 key under `r/{restaurant_id}/`), QR download and create.

**Auth** ❓ (own login vs Cloudflare Access is still open; 🔧 the plan builds own login, because Access caps at 50 users and shows a Cloudflare-branded login to owners)
- Session token: 32 random bytes in `__Host-session` (`Secure; HttpOnly; SameSite=Strict; Path=/`), stored as SHA-256. Rotated on login, deleted on logout and password change, 14-day sliding expiry.
- PBKDF2-SHA256 with the highest iteration count Workers accepts (measured in M0; target 600k, likely capped at 100k), stored in the hash string so it can be raised.
- Login throttling via the Rate Limiting binding; dummy hash for unknown emails.

**CSRF and headers**
- `server/middleware/01.origin-check.ts`: every non-GET request must have an `Origin` equal to the site origin, else 403. Applies to likes too. No state changes on GET.
- `nuxt-security` headers; CSP nonces; never `v-html` on owner text; Zod length limits match the SQL CHECKs.

**QR codes**
- Encode `https://<domain>/q/{qrCode}` (6 chars, base58, generated once). Error correction level Q. Downloads: SVG, 2000 px PNG, A6 PDF card with venue name.

**Accessibility**
- ♡ is a `<button aria-pressed>` inside a `<form method="post">` with a visually hidden label "Like Bufalina Panizza". The count sits in an `aria-live="polite"` element with a visually hidden unit ("Likes: 329") and is linked to the button with `aria-describedby`, so it is announced as "Like Bufalina Panizza, pressed, Likes: 329". The unit is a count-neutral noun, so no plural rules are needed in `menu.js`.
- The device cookie is **never read in a middleware**: a middleware would verify the signature on every request, including every menu render. Only the likes handlers and the favorites API read it.
- A failed like (429, 404) never shows JSON to a guest: `menu.js` keeps the current state on a non-OK response (it re-posts the form only on a network error), and `POST /api/likes/{id}` always answers `303` back to the dish.
- 44×44 px tap targets, visible focus, 4.5:1 contrast over photos, `prefers-reduced-motion` respected.

## 10. Performance budget and caching

| Metric | Budget | How it's checked |
|---|---|---|
| Guest menu JS | ≤ 5 KB gzipped (`menu.js`) | CI bundle-size check |
| Guest menu HTML, 50 dishes | ≤ 60 KB gzipped | e2e test on the seed |
| Images on first screen | ≤ 300 KB total | small (400 px) WebP in cards, `loading="lazy"` below the fold |
| Worker CPU, menu render | p95 ≤ 10 ms | Workers Logs / Observability from the first staging deploy |
| Worker CPU, `GET /api/r/{slug}/likes` (one extra call per menu view) | p95 ≤ 5 ms | Same dashboard. It is what keeps the menu HTML identical for every visitor, so the HTML can be cached later. |
| Largest Contentful Paint on a mid-range phone, 4G | ≤ 2.5 s | Lighthouse CI on staging |

Caching: none at launch (D1 reads in `weur` are fast). If menu CPU p95 goes above 10 ms, cache the rendered HTML per `slug + lang` in the Workers Cache API for 60 s and purge that venue's keys on every CMS save. Because the HTML is identical for every visitor, this needs no redesign.

## 11. Data safety

- D1 Time Travel (30 days on Paid) rewinds the whole database, so it isn't the backup.
- `.github/workflows/backup.yml`, nightly: `wrangler d1 export` → upload to an R2 bucket **in a different Cloudflare account** (or Backblaze B2), keep 90 days. Same job syncs the photo bucket.
- Restore drill once before launch and then every quarter: import last night's export into staging.
- Soft delete with Undo for 30 days in the CMS.

## 12. Environments, CI and config

| Environment | Worker | D1 | R2 | Deploys on |
|---|---|---|---|---|
| local | `nuxt dev` + `wrangler` proxy | local D1 file | local | |
| staging | `chilly-menu-staging` | `chilly-staging` | `chilly-photos-staging` | push to `main` |
| production | `chilly-menu` | `chilly-prod` | `chilly-photos` | git tag `v*` (manual) |

**Secrets** (`wrangler secret put`): `DEVICE_SECRET`, `SESSION_PEPPER`. **Bindings** in `wrangler.toml`: `DB`, `PHOTOS`, `LIKE_LIMITER`, `LOGIN_LIMITER`, Cron `0 3 * * *` (nightly task). Never commit secrets; `.dev.vars` is git-ignored.

**CI** (`.github/workflows/ci.yml`, on every PR): install → `eslint` → `nuxi typecheck` → unit and worker tests → build → bundle-size check → e2e on a preview. Deploy jobs run `wrangler d1 migrations apply --remote` **before** `wrangler deploy`. Migrations are additive only; a column is dropped in a later release once no deployed code reads it. `0001_init.sql` may be edited only while `wrangler d1 migrations list --remote` shows it unapplied on both staging and production.

**Pre-commit hook** (from the uploaded plan): `husky` + `lint-staged` run `eslint --fix` and `prettier --write` on staged files. Config from `@nuxt/eslint` (flat config, `eslint.config.mjs`), plus rules banning `v-html` and physical CSS properties. CI runs the same lint, so a skipped hook still fails the PR.

**Branching:** short-lived branches, PR to `main`, squash merge, CI green required.

## 13. Testing

| Layer | Tool | Must cover |
|---|---|---|
| Unit | Vitest | `isLang`, language resolution, money formatting, allergen bits, password hash/verify, device cookie signing |
| Worker / DB | `@cloudflare/vitest-plugin` against the **built** Worker and local D1 | like triggers and idempotency; every CMS write route as owner A against venue B → 404; default-language rules; reorder; soft delete and restore; rate limits; Origin check. Lives in `apps/<app>/test/worker/`; real migrations + seed, reset before every test; each test uses its own client IP for the rate-limit binding; type-checked through `test/worker/tsconfig.json`; CI runs it right after the build. |
| End to end | Playwright on staging | scan → menu → like → favorites → switch language; owner edits price and sees it on the menu; no-JS heart form; RTL menu screenshot |
| Accessibility | `@axe-core/playwright` | zero serious violations on menu, dish, favorites, CMS login |
| Smoke | `curl` after each deploy | `/q/{code}` → 302, `/r/demo/pt` → 200 |

## 14. Milestones and acceptance checks

**M0. Project setup**
- Repo, Nuxt 4, npm workspaces, Workers deploy, D1 and R2 for staging, lint hook, CI pipeline.
- ✔ A push to `main` deploys "hello" to the staging domain over HTTPS.
- ✔ A commit with a lint error is blocked locally and fails CI.
- ✔ A Workers test proves `Intl.DisplayNames`, `Intl.Locale#getTextInfo` and `Intl.NumberFormat('pt-PT', EUR)` work on Workers.
- ✔ The maximum PBKDF2 iteration count on Workers is measured and written into `password.ts`.

**M1. Schema and seed**
- `0001_init.sql`, Drizzle schema, `seed/casa-strega.sql`.
- ✔ Migration applies cleanly on local and staging.
- ✔ Tests: like insert/delete keeps `dishes.likes` exact; a second owner for a venue fails; an owner without a venue fails; a default language that isn't enabled fails (or the app check, if deferred FKs don't work on D1).

**M2. Guest menu, read-only**
- `/q`, `/r` redirects, menu, dish detail, language switch, RTL support, hreflang.
- ✔ `/r/casa-strega/pt` renders every seed category and dish with `8,00 €`; `/en` shows `€8.00`.
- ✔ A disabled language URL redirects to the default.
- ✔ Page works with JavaScript disabled. HTML and JS are within the §10 budget.
- ✔ An Arabic test venue renders right-to-left without layout breaks.

**M3. Likes and Favorites**
- ✔ Tap ♡: count +1, cookie set only then; tap again: back. Retrying the same PUT doesn't double-count.
- ✔ Without JS, the form post likes and returns to the same dish.
- ✔ The 11th like request in a minute from one IP gets 429.
- ✔ Favorites lists exactly this device's liked dishes.

**M4. Auth and CMS shell**
- ✔ Login, logout, change password, must-change-password on first login.
- ✔ Six failed logins in 15 minutes → 429. Unknown email and wrong password give the same response time (±20%) and message.
- ✔ A cross-origin POST to any `/api` route → 403.

**M5. CMS content**
- Venue info, languages, categories, dishes, translations, photos, reorder, soft delete and undo.
- ✔ Owner enables `uk`, translates one dish, and sees it at `/r/…/uk` with untranslated dishes in the default language.
- ✔ Missing-translations count matches the data.
- ✔ Every write route has a passing "owner A against venue B → 404" test.

**M6. QR and print**
- ✔ SVG, PNG and A6 PDF download; a phone scan of the printed card opens the staging menu.
- ✔ Renaming the slug keeps the printed QR working; the old slug 301s.

**M7. Launch readiness**
- ✔ Workers Paid on; domain auto-renew and registrar lock on.
- ✔ Nightly backup runs; one restore into staging done.
- ✔ Uptime check on the Casa Strega menu alerts by email.
- ✔ Lighthouse: LCP ≤ 2.5 s, accessibility ≥ 95; axe has zero serious issues; VoiceOver pass on an iPhone.
- ✔ Real Casa Strega content entered by the owner; production deploy by tag; first QR codes printed.

## 15. Open questions

- ❓ CMS login: own login (built by default, §9) or Cloudflare Access.
- ❓ Real menu content from Casa Strega: the PDFs are wireframes with placeholder text (§16).
- 🟡 The exact ~40-language pool list (§7).
- ❓ Trademark and domain check for "Chilly Menu" before buying the domain.

## 16. Casa Strega sample data (seed)

Source: the two wireframe PDFs. Seed content only, not the real menu: like counts differ between the PDFs, several descriptions are Ukrainian placeholder copy, and Tagliere, Bevande, Birre and Analcolici have no dishes.

**Venue:** Casa Strega, "House of Italian Magic", tagline "Panizza · Aperitivo · Vino d'Italia". Rua das Flores 123, Porto, Portugal. Links: Instagram, contacts. Seed languages: `pt` (default), `en`.

**Categories (in order):** Aperitivo ("Drink + Stuzzichini"), Pizza al taglio, Panizza, Tagliere, Bevande, Birre, Analcolici.

| Category | Dish | Description (PT seed text) | price_cents |
|---|---|---|---|
| Aperitivo | Classico Aperitivo | Mozzarella, Panizza, Azeitonas, Tarallini | 800 |
| Aperitivo | Veg Aperitivo | Fresella, Panizza, Pickles | 800 |
| Aperitivo | Aperol Spritz | Aperol, Prosecco, Laranja | 500 |
| Pizza al taglio | Margherita | Molho tomate, Fior di Latte, Manjericão | 350 |
| Pizza al taglio | Del Giorno | Fatia com ingrediente do dia | 350 |
| Pizza al taglio | Special | Especial da estação (placeholder) | 450 |
| Panizza | Bufalina Panizza (featured) | Tomate, Mozzarella di Bufala Campana, pesto | 800 |
| Panizza | Mortazza | Mortadela italiana, queijo e molho (placeholder) | 800 |
| Panizza | Calabrisella | Salame picante, queijo, legumes (placeholder) | 800 |

**Where the wireframes conflict with the review (the review wins):** the "+" button and "order online" copy are removed; the PT | EN switch becomes owner-chosen languages; `8.00 €` is formatted per language; the mixed Ukrainian, Italian and Portuguese copy needs real text from the client; sold-out, allergens and photo alt text are added as CMS fields.
