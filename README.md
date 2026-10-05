# VamosTaxi.eu

Vamos Taxi V1: a Swiss pre-booked airport-transfer platform (Zurich first). Customers book ahead, get a fixed price, pay online, and a driver is waiting at the agreed pickup. Not on-demand ride-hailing: no live GPS, no driver app, no marketplace.

- Public site: <https://vamostaxi.site> (Worker `vamos`)
- Owner dashboard: `dashboard.vamostaxi.site` (Worker `vamos-dashboard`, a gateway into the same app)
- Stack: Next.js 15 on Cloudflare Workers through `@opennextjs/cloudflare`, Supabase Postgres (Zurich) behind Hyperdrive, Stripe (standard), Resend, Mapbox, Turnstile. No Vercel.
- Support: **info@vamostaxi.site** and **+41 79 626 70 82**.

## Layout

- **`apps/web/`**: the Next.js app and its two Workers (`wrangler.jsonc` for `vamos`, `wrangler.dashboard.jsonc` for the gateway). Environment names the Worker reads are listed in `apps/web/.dev.vars.example`.
- **`packages/db/`**: Supabase migrations, seed, pgTAP suite and generated types. **`packages/emails/`**: the transactional e-mail templates in four languages.
- **`app/`**: every public page and the dashboard as a working `.dc.html` Design Component plus the shared runtimes (`vamos-i18n-dict.js`, `vamos-locale.js`, ...). The home and legal pages customers see are these files, copied into `apps/web/public/` by `scripts/sync-dc-mock-to-public.mjs`.
- **`design-system/`** and **`assets/`**: the bound Vamos Taxi design system (tokens, components, fonts) and the icons, logo and photography. Source of visual truth; see `design-system/readme.md` and `CLAUDE.md`.
- **`docs/`**: `docs/runbook/` and `docs/runbooks/` (operating click-paths, refunds, restore, the test lab), `docs/build/` and `docs/brief/` (build and product planning).
- **`scripts/`**: gates, the DC sync, the test lab (`scripts/test-lab/`) and the deploy guard.
- **`.planning/`**: GSD planning, decisions and the one-page control board (`.planning/CONTROL-BOARD.md`).
- **`archive/`**: frozen historical snapshots, never edited.

## Running it locally

1. `pnpm install --frozen-lockfile` (Node 22 or newer, pnpm 11).
2. Look at the pages alone, with no database: `node scripts/sync-dc-mock-to-public.mjs`, then serve `apps/web/public` with any static server. A `file://` URL does not work.
3. A whole local copy (own Supabase stack, built Worker, local stand-ins for Stripe, Mapbox, Turnstile and Resend): `scripts/test-lab/lab.sh up <name>`. It needs no Docker on a Mac with Apple silicon; see `docs/runbook/test-lab.md`.
4. `pnpm dev` runs `next dev` for `apps/web`. It needs `apps/web/.dev.vars`, copied from `.dev.vars.example` and filled with the local stack's values from `supabase status`. Never put a live key in it.

Checks, from the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm lint:css`, `pnpm i18n:check`, `pnpm check:numbers`, `pnpm test:unit`. The database suite is `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`. The database-backed web tests (money paths) run through `pnpm test:db-lab`; its header explains how it starts and destroys a throwaway lab.

On GitHub, a push to `main` runs the gate, the unit tests and the database suite, on Ubuntu only. The Linux booking-funnel e2e shards (about 109 billed minutes) and the macOS screenshot diffs run only when someone starts the Deploy Staging workflow by hand and ticks `e2e` or `visual`. Docs-only pushes run nothing.

## How a change reaches the live site

One session, the control session, ships; every other session builds on its own branch and hands over. Nobody else commits on `main`, applies a migration to the live database or deploys.

1. The control session merges the hand-over in a clean clone of `main` and runs every gate and the build.
2. Migrations reach the hosted database one file at a time, verbatim, and are read back and compared with the local copy. `db push` is never used and live data is never wiped.
3. The Worker is deployed from the owner's Mac with wrangler, through the `deploy` script of `apps/web`. The script refuses to run without an explicit `--env`, and only `staging` is allowed: in `wrangler.jsonc`, `env.staging` is the live Worker `vamos` (custom domains `vamostaxi.site` and `www`), while the top-level config is an empty shell that would create a stray Worker. `env.production` is a placeholder for the cutover and is not deployable. The dashboard gateway has its own script, `deploy:dashboard`.
4. After the deploy the controller reads the log (`Uploaded vamos`, the custom domains listed), checks the live pages, and, when checkout changed, makes one test payment and reads `booking_payments`.

GitHub Actions never deploys, not on a push and not by hand: the `deploy` job in `deploy-staging.yml` is switched off (`if: false`), `deploy-production.yml` only echoes that the cutover is owner-gated and starts by hand only, and the owner's rule is that deploys come from the Mac.

## Rules for the code

`CLAUDE.md` holds the product rules (design system, no glow, no tinted yellow, four languages in the same pass, `CHF 000` until the owner flips prices, native scrolling). Read it before editing a page.
