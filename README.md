# chilly-menu (repo: leaf-menu-mono)

Chilly Menu: QR restaurant menus with likes, plus a small CMS. Nuxt on Cloudflare Workers (D1 + R2). The plan is in [`qr-menu-plan.md`](qr-menu-plan.md).

## Setup

Needs Node ≥ 22.22.3 (or ≥ 24.15) and npm.

```sh
npm install        # also installs the git pre-commit hook (husky)
```

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` (git-ignored); `DEVICE_SECRET` signs the guest like cookie. In production: `wrangler secret put DEVICE_SECRET`.

## Layout

npm-workspaces monorepo: `apps/web` (guest menu Worker), `apps/cms` (owner CMS Worker, served under `/admin`), `packages/shared` (domain, infra, languages, migrations, seed). All scripts below run from the repo root.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `dev:cms` | Nuxt dev server for web / cms. No D1/R2 bindings, so use `preview` for anything touching the database. |
| `npm run preview` / `preview:cms` | Build, then `wrangler dev` with local D1 and R2: web at http://localhost:8787, cms at http://localhost:8788/admin/. |
| `npm run build` | Production build for Workers into `.output/`. |
| `npm run db:migrate` | Apply `packages/shared/migrations/` to the local D1 database. |
| `npm run db:seed` | Load the Casa Strega demo (slug `demo`) into local D1. Safe to re-run. Local DB state lives in `.wrangler/state` at the repo root, shared by both apps. |
| `npm test` | Schema tests (`node:test` + `node:sqlite`, no extra deps). |
| `npm run test:worker` | Build web, then run the handler tests inside workerd (Vitest + `@cloudflare/vitest-plugin`): cookies, Origin check, rate limit, redirects, Favorites. Always builds first, so it takes ~1 min (`test:worker:only` in `apps/web` skips the build). |
| `npm run lint` | ESLint (`@nuxt/eslint`) on the whole repo. |

The pre-commit hook runs `eslint --fix` on staged `.js/.mjs/.ts/.vue` files and blocks the commit on errors.

## Manual testing

1. `npm test`: all schema tests pass.
2. `npm run db:migrate && npm run db:seed`.
3. Inspect data: `npx wrangler d1 execute DB --local --command "select * from dishes"` (9 rows).
4. `npm run preview`, then open http://localhost:8787.
5. Reset the local database: delete the `.wrangler/` folder and repeat step 2.

Once the guest menu exists (plan step 3):
- `/r/demo` shows categories and prices in Portuguese; switching to English translates only Bufalina Panizza, everything else falls back to Portuguese.
- Tap ♡: count goes to 1 and the dish appears in Favorites; tap again: back to 0. A second browser profile counts separately.
- `/q/cs7k2m` (the seeded QR code) redirects to `/r/demo`, and still does after the slug is renamed.
- Check on a real phone.

Once the CMS exists (plan step 4):
- As owner A, try every mutating route against venue B's data: all must return 404.
- Add a language, translate a dish, edit a price: `/r/demo` shows the change.

Before launch: restore one backup into staging (plan §10).

## Cloudflare setup (once)

```sh
npx wrangler login
npx wrangler d1 create chilly-menu --location weur   # paste the id into wrangler.toml
```

Likes (M3), after `preview`:
- Tap ♡ on `/r/demo/pt`: count +1, `chilly_device` cookie set only now; tap again: back. `/r/demo/pt/favorites` lists exactly this browser's hearts.
- With JS off, the ♡ form posts to `/api/likes/{id}` and returns to `#dish-{id}`.
- 11 like requests in a minute from one IP for one dish: the 11th gets 429.
