---
phase: 18-ops-pricing-source
plan: 10
subsystem: infra
tags: [D-40, wrangler, public_chf, dual-dc, owner-uat, worker-vamos]

requires:
  - phase: 18-ops-pricing-source
    provides: Five-tab OpsPricing fare book (Fixed routes · Distance rules · Surcharges & extras · Coupons · History)
  - phase: 18-ops-pricing-source
    provides: Checkout extras from published extra-chip rows; preferDraft false
  - phase: 18-ops-pricing-source
    provides: Locked unpaid checkout keeps snapshot CHF until quote_lock_expires_at
  - phase: 18-ops-pricing-source
    provides: Extra waiting CHF 0 at pay; ops arrival clock on booking_legs.arrived_at
provides:
  - D-40 grep gates: Worker vamos, no vamostaxi.eu bind, no sk_live_, 18-02 SQL does not SET public_chf = true
  - Dual-DC OpsPricing byte-equal; owner authorized Worker vamos staging deploy without agent Publish
affects: [11-12]

tech-stack:
  added: []
  patterns:
    - Deploy Worker vamos (--env staging) does not flip public_chf
    - First public CHF remains owner Publish on live /pricing
    - wrangler.jsonc comments may mention abandoned .eu; routes must not bind it

key-files:
  created: []
  modified:
    - apps/web/lib/pricing/public-chf.test.ts
    - apps/web/wrangler.jsonc

key-decisions:
  - "env.staging name stays vamos; no vamostaxi.eu custom domain; Stripe stays pk_test_"
  - "18-02 SQL non-comment lines never SET public_chf = true; live rate_versions id 5 is not the flip"
  - "Owner authorized staging deploy after live /pricing showed no new chrome (Worker was still the previous build); agent did not click Publish"

patterns-established:
  - "D-40 source-read lives in public-chf.test.ts (wrangler staging name, routes, SQL, sk_live_)"
  - "GitHub Actions deploy-staging.yml still runs db:push; this sitting deploys via local wrangler --env staging only"

requirements-completed: [D-40]

duration: 12min
completed: 2026-09-14
---

# Phase 18 Plan 10: Grep gates + owner UAT Summary

**D-40 grep gates hold (Worker `vamos`, no `.eu` bind, no `sk_live_`, 18-02 SQL does not set `public_chf`); dual copies are byte-equal; owner authorized a Worker `vamos` staging deploy after live `/pricing` still showed the previous build; the agent did not click Publish.**

## Performance

- **Duration:** 12 min agent work (Tasks 1–2) plus owner resume
- **Started:** 2026-09-14T00:18:36Z
- **Completed:** 2026-09-14T06:48:16Z
- **Tasks:** 3 completed
- **Files modified:** 1 (Task 1 tests); wrangler.jsonc unread because no `.eu` route to delete

## Accomplishments

- Source-read tests in `public-chf.test.ts`: `env.staging.name` is `vamos`; non-comment wrangler has no `vamostaxi.eu` route; checkout/stripe/wrangler have no `sk_live_`; 18-02 SQL non-comment has zero `public_chf = true`. Staging Stripe publishable stays `pk_test_`.
- Dual-DC: `app/ops` + `app/vamos-ops-data.js` vs `apps/web/public/app/` already byte-equal (24/24). No copy needed. Task 2 left no commit.
- Owner UAT: live `https://dashboard.vamostaxi.site/pricing` showed no new fare-book chrome because Phase 18 had not been deployed. Owner said ship and deploy. Agent does not click **Publish fare book** and does not set `public_chf`. Public quote stays `CHF 000` until that owner click.

## Task Commits

Each task was committed atomically:

1. **Task 1: Grep Worker vamos, no sk_live_, no .eu, no public_chf from SQL** - `81f00f5` (test)
2. **Task 2: Dual-DC equality and kernel/ops vitest** - verify-only, no commit (already byte-equal)
3. **Task 3: Owner UAT on live /pricing** - owner authorized deploy; no Publish click

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/pricing/public-chf.test.ts` — D-40 wrangler / SQL / `sk_live_` source-read
- `apps/web/wrangler.jsonc` — not edited (no `.eu` route to remove)

## Decisions Made

- Staging deploy is Worker `vamos` (`--env staging`). Do not deploy `env.production` / `vamos-web-production`.
- GitHub `deploy-staging.yml` still contains `pnpm db:push`; this sitting uses local `pnpm --filter web run deploy -- --env staging` so the agent does not run `db:push`.
- Stripe stays test. No Search Console. No restore onto `yaumjzvylngfjhtuffqs`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Full `lib/ops` vitest and typecheck are pre-existing red**
- **Found during:** Task 2
- **Issue:** Plan verify `lib/pricing lib/ops` plus `pnpm run typecheck` fail on customers-board / ops-dc-finalize / settings vat / postgres.js overloads — not introduced by 18-10.
- **Fix:** Kept dual-copy + D-40 tests green; did not boil the ocean. Targeted kernel (`lib/pricing`, dual-copy ops tests, vat, quote) 336 passed.
- **Files modified:** none
- **Verification:** `public-chf.test.ts` + `ops-pricing-source.test.ts` 20 passed
- **Committed in:** n/a (verify-only)

---

**Total deviations:** 1 auto-fixed (1 blocking pre-existing)
**Impact on plan:** D-40 gates still hold. Typecheck red blocks GitHub Actions deploy; local wrangler `--env staging` is the authorized path.

## Issues Encountered

Live `/pricing` looked unchanged until Worker `vamos` received this branch. That is expected: 18-06–18-10 lived only on local `main`.

## User Setup Required

None for D-40 grep. Owner Publish on live `/pricing` still turns public CHF on — not done by this plan.

## Next Phase Readiness

Phase 18 plans are 10/10. Public stays `CHF 000` until owner Publish. Stripe still test. Do not bind `.eu`. Do not `db:push` / restore. 11-12 owner Publish remains open and is not this sitting.

## Self-Check: PASSED

- key-files.modified exist on disk
- Task 1 commit `81f00f5`; Task 2 no empty commit; Task 3 owner authorized deploy without Publish
- wrangler staging name `vamos`; no `vamostaxi.eu` route; 18-02 SQL no `public_chf = true`; no `sk_live_` keys
- Dual copies byte-equal
- Agent did not click Publish / set `public_chf` / bind `.eu` / put live Stripe keys

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
