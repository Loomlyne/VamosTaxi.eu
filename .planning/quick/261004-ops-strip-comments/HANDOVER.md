# Hand-over: strip the served dashboard screens (public/app/ops) and the served licence note

Job session (security lead), 2026-10-04 16:57–17:23 +04. Owner, in the controller's chat about 17:00: "do the ops strip job too in parallel". Added by the controller during the job: the internal note in `OFL-NotoSansArabic.txt`, a scan of served `.txt`/`.md` files.

- Branch: `fix/ops-strip-comments`. Cut from `origin/fix/hide-internal-ids` `7e278ea5`, merged its final tip `31aaa688`, then merged `origin/main` `369cbd26` (hide-internal-ids live as squash `5a027e71`). `git diff origin/main HEAD` shows only this job's files (list below).
- Code tip: `0e38edc7` (merge of origin/main). `3cd8b85f` adds planning evidence only. This hand-over file is the commit on top.
- The branch history still carries the old hide-internal-ids commits; their content is already on main through `5a027e71`. Ship as one squash commit.
- No migration. No database change. No connector call.

## Files

| File | What |
|---|---|
| `scripts/strip-public-comments.mjs` | `stripTree(dir)`: no folder skipped any more (was `skipDirs = new Set(["ops"])`) |
| `scripts/strip-public-comments.d.mts` | `stripTree(dir: string)` |
| `scripts/strip-public-comments.test.mjs` | stripTree case now strips `ops/OpsBoard.dc.html` and `ops/support.js` (licence kept) |
| `scripts/sync-dc-mock-to-public.mjs` | comment only: app/ops is stripped too, and why |
| `apps/web/lib/ops/customers-board.test.ts` | 5 twin checks: served copy = `stripHtml(source)` |
| `apps/web/lib/ops/ops-pricing-source.test.ts` | OpsPricing and OpsSidebar twins: served copy = `stripHtml(source)` |
| `apps/web/lib/ops/ops-pricing-tabs.test.ts` | same, OpsPricing |
| `apps/web/lib/ops/ops-pricing-vat-field.test.ts` | same, OpsPricing |
| `apps/web/tests/integration/ops-dc-customers.spec.ts` | same, OpsCustomers and OpsDetail (Playwright file proof) |
| `apps/web/lib/security/public-no-internal-ids.test.ts` | ops exclusions removed; two new cases (below) |
| `app/ops/OpsSettings.dc.html` | 4 lines gone: `inviteNote` in en/de/fr/ar (never rendered) |
| `apps/web/lib/ops/ops-dc-settings.test.ts` | drops the `/api/staff/invite` expectation: its only match was that dead note |
| `apps/web/public/brand/fonts/OFL-NotoSansArabic.txt` | internal note removed (below) |
| `.planning/quick/261004-ops-strip-comments/tools/*.mjs`, `evidence/*.txt` | browser proof tools and their output |

Sources under `app/ops/` keep every comment. Only the served copy is stripped. The one source edit is the dead `inviteNote` string.

## What changed

1. **Served dashboard screens are stripped.** The sync now runs the same strip on `public/app/ops` as on the rest of `public/app` and `_ds`.
   - 25 files change: 22 of the 23 screen and component files (`OpsProfile.dc.html` had no comment), `ops.dc.html`, `ops-login.dc.html` and `support.js`.
   - `ops.html` and `ops-login.html` are copied from the stripped `.dc.html`.
   - Same proofs as elsewhere: every script is read by acorn before and after (same tokens, no comment left) or the sync stops. Licence notices (`/*!`, `@license`) stay.
   - Size of the served ops folder: 1,124,243 → 1,083,053 bytes. Examples: `OpsDetail.dc.html` 192,921 → 180,447 (11 HTML, about 100 line and 11 block comments), `support.js` 68,953 → 65,807 (26 line, 28 block).
   - The sync now reports "comments stripped from 115 files" (was 90).
2. **Twin tests.** Where a test pinned an ops file byte-equal to its source, it now compares the served copy with `stripHtml(source)`. This is the same switch `vamos-ops-data.js` got on hide-internal-ids. The regex checks still read the source.
3. **Scan test** (`public-no-internal-ids.test.ts`):
   - The existing served-copy case no longer skips `app/ops`. It checks for `<!--`, `/*` and the project ref.
   - New: "the served dashboard screens (public/app/ops) are stripped like every other served file".
     - Every served `.html`/`.js`/`.css` under `public/app` and `_ds` is its own strip: stripping it again changes nothing, so no `//`, `/* */` or `<!-- -->` is left.
     - Every JS script in the ops copy parses with acorn. A script acorn cannot read is never stripped, and a comment could hide there.
   - New: "no served .txt or .md file carries an internal note". It walks all of `apps/web/public` and fails on `ADR-n`, `D-nn`, `.planning` or the project ref.
     - `public/brand` is committed, so this case runs even without a sync.
4. **`OFL-NotoSansArabic.txt`.** Two internal clauses are gone from the scope note:
   - "the self-hosted stand-in Arabic face vendored per D-22 and ADR-013, pending the designer's eventual pick"
   - "(see `.planning/ADR-013-arabic-webfont-licence.md` for the full provenance, including what each font file's own `name` table declares)"

   The references sat mid-sentence, so the diff is 5 lines out and 2 lines in. The two lines in are the remaining halves of those sentences, ending "only. The Qurova and" and "on 2026-08-20.". No other word changed. Everything from the closing `====` rule down (the licence itself) is byte-identical (`cmp` of the old lines 17–end against the new lines 14–end).
5. **`inviteNote`** removed from `OpsSettings.dc.html` in en/de/fr/ar. It said "The first real invite (not @example) needs Resend as Auth SMTP. This form posts to /api/staff/invite either way." Nothing rendered it: Staff was deleted in D-12.

## Facts (step 1)

**Who answers `/app/ops/*`, and what it needs first:**

| Host | Path through the code | Answer |
|---|---|---|
| `vamostaxi.site`, `www` | Worker `vamos`. `run_worker_first` lists `/app/ops/*`, so the Worker runs before the asset layer. `VAMOS_SURFACE=public` pins the host to the apex, so a spoofed `Host: dashboard…` does not help. `worker.ts` `guardOpsAsset` returns 404 (private, no-store) | 404 |
| `dashboard.vamostaxi.site` | Gateway Worker `vamos-dashboard` (`dashboard-gateway.ts`): `/app/ops*` goes to `env.APP` = `vamos` entrypoint `Dashboard`. `handleFetch` with surface `dashboard`: `guardOpsAsset` passes, then `isOpsAssetRequest`, then `serveOpsAsset(env.ASSETS)`. This runs before OpenNext, so `middleware.ts` (the staff gate) never runs | **the file, to anyone. No sign-in, no cookie check.** Security headers + `X-Robots-Tag: noindex` |
| `*.workers.dev` | `workers_dev: false` on both Workers | none |

- The signed-in documents (`/dashboard`, `/bookings/…`) are gated by `middleware.ts` `dashboardHostMiddleware`: admin role plus aal2.
- That middleware builds those documents with `serveOpsDc`, which `fetch`es `/app/ops/ops.dc.html` (or `ops-login.dc.html`) over HTTP with `x-vamos-dc-asset: 1`. The same files are open at their own address.

**Tests that read the served ops copy, and why:**

| Test | What it pinned before | Why |
|---|---|---|
| `lib/ops/customers-board.test.ts` | OpsCustomers (twice), OpsBoard, OpsDetail, OpsPricing byte-equal to source | "dual DC" era: the served twin had to equal the source the sync copies |
| `lib/ops/ops-pricing-source.test.ts` | OpsPricing and OpsSidebar byte-equal; `ops.dc.html` only for its injected base | D-27 D-28 D-31 dual copy |
| `lib/ops/ops-pricing-tabs.test.ts`, `lib/ops/ops-pricing-vat-field.test.ts` | OpsPricing byte-equal | same |
| `tests/integration/ops-dc-customers.spec.ts` (Playwright, file proof) | OpsCustomers and OpsDetail byte-equal | same |
| `lib/ops/phase-15-dc.test.ts`, `lib/ops/ops-live-data.test.ts` | OpsSupportTicket labels per language from the served copy (not byte-equal) | public copy carries the labels. Still green, unchanged |
| `lib/ops/ops-chauffeur-desk.test.ts` | served `ops.dc.html` / `OpsFleet.dc.html` exist | unchanged |

**What the sign-in page loads before anyone signs in** (`/login` rendered from the synced tree; `evidence/login-requests.txt`):

- Under `/app/ops/`: only `AuthForm.dc.html` and `support.js`.
- The page itself is `ops-login.dc.html`, which middleware fetches server-side and inlines.
- Everything else comes from outside `/app/ops`: `/_ds/…`, `/app/vamos-locale.js`, `/app/vamos-i18n-dict.js`, `/app/vamos-page-transition.js`, `/assets/…`, and `/photos/site/ops-login-bg.jpg`.
- All other files in `/app/ops/` are needed only after sign-in: the shell `ops.dc.html` and the 20 screens and components.

**Proposal (no code in this job): put the rest behind the staff session.**

1. In `worker.ts`, before `serveOpsAsset`, let only `AuthForm.dc.html` and `support.js` through without a session. For every other `/app/ops/*` file, run the same staff check the middleware runs (Supabase session from the cookie, role `admin`, aal2), and answer the same private 404 when it fails.
2. Make `serveOpsDc` read `ops.dc.html` and `ops-login.dc.html` from the `ASSETS` binding instead of an HTTP self-fetch. The `x-vamos-dc-asset` header is client-spoofable, so it must not become a bypass.

## Scan of the served ops copy for strings (step 3; after the strip; `public/app/ops`, 28 files)

**None found:** project ref, Supabase host or keys (the word "supabase" appears 0 times), Stripe ids (`acct_`/`pk_`/`sk_`/`pi_`/`cus_`/`whsec_`…), "test mode"/sandbox/4242, localhost/127.0.0.1/workers.dev, repo or `.planning` paths, phase or decision ids, TODO/FIXME.

**Removed:** `OpsSettings` `inviteNote` (four languages). A developer note in a string, never rendered. It named the mail vendor's SMTP role and an internal API path.

**Listed and left (a screen needs them at run time, or they are outside this job):**

1. Design-system folder `_ds/vamos-taxi-design-system-245af154-…/` in every stylesheet and script path. It is an asset path, the same on every public page.
2. `OpsTable.dc.html`: fallback id `00000000-0000-4000-8000-000000000001` when `crypto.randomUUID` is missing.
3. `AuthForm.dc.html` (also `app/pages/AuthForm.dc.html`, already public): the design-preview branch (`frozen`) with `REGISTERED = ['taken@vamostaxi.site']` and the password `'wrong'`. This is preview logic, not live sign-in. Suggest a later job that drops the preview branch from the served copy.
4. `OpsDetail.dc.html` `errTestOnly`, four languages: "Refunds can only be sent on the Stripe test account for now." This is a test-mode note, shown when the server answers `stripe-test-only`. Remove or reword it when live keys go in.
5. `OpsSettings.dc.html` `paymentsNote` (rendered): "Availability is configured in Stripe. This screen does not claim that checkout is live."
6. `OpsCoupons.dc.html`: "A placeholder until the fare matrix lands." and "Discount values stay at 00 until the fare matrix is connected…".
7. Screens served but mounted by nothing: `OpsCoupons`, `OpsCalendar`, `OpsSoon`, and `PlaceSearchStates` (a states-gallery review scaffold). Suggest leaving them out of the sync.
8. Vendor names in operator copy and API field names: Stripe (pay page, dashboard, the `Stripe webhook` history label, `Stripe fee`) and Mapbox (search copy, `mapbox_id`). These are screen copy for the owner.

**Other served `.txt`/`.md` under `apps/web/public` (controller's addition):**

| File (served at) | Finding |
|---|---|
| `/brand/fonts/OFL-NotoSansArabic.txt` | fixed (above) |
| `/brand/fonts/OFL.txt` | clean (fixed earlier in 8cf45166) |
| `/_ds/…/assets/fonts/OFL.txt` | clean |
| `/assets/fonts/noto-sans-arabic/OFL.txt` | clean (upstream licence) |
| `/assets/vendor/LICENSES.md` | **listed, not changed.** Line 7 names repo paths: "…the SRI constant in app/support.js (checked by apps/web/tests/unit/vendor-runtime-no-unpkg.test.ts)". No test reads this file. One-line fix in `assets/vendor/LICENSES.md` when the owner wants it |
| `/assets/brand/brand-guideline-extracted.txt` and `/assets/brand/Brand Guideline VAMOS TAXI.pdf` | **listed, not changed.** The internal brand guide (text extract and PDF) is publicly fetchable. No page loads either. Suggest leaving `assets/brand/` out of the sync |

None of these four trip the new `.txt/.md` rule (no ADR, `D-nn`, `.planning` or project ref).

## Checks

The proof, step 6, in `evidence/render-compare-result.txt`:

- Before = `31aaa688` (ops copy unstripped), synced with its own script.
- After = this branch, synced.
- Served as the dashboard host serves them: synced `ops.html` with `<base href="/app/ops/">` and the `vamosOpsAuth` flag. `/api/**` answered in Playwright: admin `me`, three booking rows, money 0.
- Headless Chromium (`@playwright/test`), sandbox unchanged. 3 paths × en/ar × 1440/390 = 12 pairs.

| Check (on `0e38edc7`; the browser proof on the same code) | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass, already up to date |
| `node scripts/sync-dc-mock-to-public.mjs` | pass: 20 pages, comments stripped from 115 files |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass: 0 errors, 6 warnings, none in this job's files. The tool scripts lint clean |
| `pnpm lint:css` | pass |
| `pnpm check:public-env` | pass (no `.open-next` at the time, so the bundle scan was skipped as designed) |
| `pnpm check:db-fences` | pass: 8/8, 1187 files |
| `node --test scripts/strip-public-comments.test.mjs` | pass: 10/10 |
| Vitest: every file that reads `app/ops` or `public/app`, plus the scan and twin tests (61 files) | pass: 61 files, 797 tests |
| Playwright `tests/integration/ops-dc-customers.spec.ts --project component-1440` | pass: 8/8 |
| Mutation checks on the scan test (each reverted by re-sync or restore, then green again, 21/21) | `//` note in the OpsDetail logic script fails the new ops case. `<!--` in OpsBoard fails 2 cases. `/* */` in `ops/support.js` fails 2 cases. A JSX script with a comment in OpsSoon fails the parse check ("Unexpected token"). `notes.txt` in `app/ops` naming `.planning/ADR-013` fails the txt case. The ADR-013/D-22 note put back in `OFL-NotoSansArabic.txt` fails the txt case |
| Browser: `/dashboard`, `/bookings`, `/bookings/VT-26-0807` | **12/12 identical:** same body text, same element count, same DOM with `<style>`/`<script>` bodies lifted out. Every `<style>`/`<script>` body after equals the before body minus its comments. 0 console errors, 0 page errors, 0 failed or 4xx requests on either side. Arabic is `dir=rtl`. Screenshots are byte-identical on 10/12. `/bookings` at 1440 differs by 48 px (en) and 61 px (ar) scattered over the page. A control run of the before tree against itself shows the same two pairs differ (`evidence/render-control-same-tree.txt`), so this is rendering noise, not the strip |
| `pnpm --filter web run build` | pass, once. `.next` and `.open-next` removed afterwards, no `.next-*` left |

## NOT verified

- No OpenNext build and no local Worker run. The browser proof used the static tree served as the dashboard host serves it, not the `Dashboard` entrypoint. `serveOpsAsset` returns the asset bytes unchanged, so the bytes are the same.
- Nothing on the live hosts. The 404 on `vamostaxi.site/app/ops/*` and the open answer on `dashboard.vamostaxi.site/app/ops/*` come from reading the code. Neither was curled.
- Screens other than dashboard, board and booking detail (pricing, settings, fleet, customers, support, reviews, new trip) were not rendered before and after. They are covered by the acorn token proof per script and the fixed-point scan.
- Full `test:unit` was not run (shared Mac). The controller runs the full gates.
- No sign-in check was added to `/app/ops/*`. That is the proposal above, a separate job.

## Ship order (controller)

1. After `fix/hide-internal-ids` (live, `5a027e71`) and after the auth rename job.
2. Re-read `git log -3`, `origin/main` and the live Worker version. Say what moved. Merge `origin/main` into this branch again if it moved; main wins a conflict.
3. One squash commit on main. Push.
4. Deploy Worker `vamos` only, with `--env staging` as usual. The served files are `vamos` assets. `dashboard-gateway.ts` and `wrangler.dashboard.jsonc` did not change, so `vamos-dashboard` needs no deploy.
5. Live checks, read-only:
   - `curl https://dashboard.vamostaxi.site/app/ops/OpsDetail.dc.html` and `…/app/ops/support.js`: no `<!--`, no `//` comment lines, no `.planning`. Compare the size with the local synced copy.
   - `https://vamostaxi.site/app/ops/support.js` is still 404.
   - `https://vamostaxi.site/brand/fonts/OFL-NotoSansArabic.txt` has no ADR-013 or D-22.
   - Sign in at `dashboard.vamostaxi.site` and open the board and one booking.
