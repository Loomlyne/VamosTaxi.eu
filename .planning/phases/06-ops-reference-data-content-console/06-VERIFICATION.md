---
phase: 06-ops-reference-data-content-console
verified: 2026-09-01T00:43:00Z
status: passed
score: 17/17 plans have SUMMARYs; local gates green
overrides_applied: 0
gaps:
  - item: "06-04 Task 4 hosted JWT proof (aal2 + app_metadata.vamos_role=admin)"
    why: "Owner account koussayzayeni@gmail.com has never completed TOTP. Code path is shipped; first real staff session is the remaining operational proof."
    blocks_merge: false
---

# Phase 6: Ops Reference Data & Content Console — Verification

**Phase goal:** Staff edit reference data and content on `dashboard.vamostaxi.site`. Dashboard / Bookings / Calendar stay Phase 8. No invented CHF.

**Verified:** 2026-09-01
**Status:** passed
**Re-verification:** No — initial verification

## Method

Ran live on `gsd/phase-06-ops-console` (after merge of `origin/main` auth #8):

```
pnpm check:db-fences     -> 8/8 pass, 409 files
pnpm --filter web exec tsc --noEmit  -> exit 0
pnpm i18n:check          -> 2300 keys, exit 0
pnpm check:public-env    -> pass
pnpm run lint            -> 0 errors (10 unused-disable warnings, inherited)
pnpm --filter web exec vitest run
  lib/ops/coupons.test.ts
  lib/ops/pricing.test.ts
  lib/ops/staff.test.ts
  lib/content/messages.test.ts
  lib/auth/run.test.ts   -> 5 files, 47 tests, pass
```

No Docker. No Hyperdrive POST. No `vamos-web` deploy in this sitting.

## Plans (17/17)

| Plan | What | SUMMARY |
|------|------|---------|
| 06-01 | Staff SQL / RLS | yes |
| 06-02 | Claims bridge | yes |
| 06-03 | Ops shell + D-01a host | yes |
| 06-04 | Sign-in + MFA challenge | yes |
| 06-05 | Invite + TOTP enrol | yes |
| 06-06 | R2 photos | yes |
| 06-07 | Pricing versions | yes |
| 06-08 | Coupons | yes |
| 06-09 | Customers read-only | yes |
| 06-10 | Content editor | yes |
| 06-11 | Settings | yes |
| 06-12 | Vehicles | yes |
| 06-13 | Chauffeurs | yes |
| 06-14 | Reviews | yes |
| 06-15 | Rate book | yes |
| 06-16 | content_strings loader | yes |
| 06-17 | Staff roster | yes |

Ops `page.tsx` count on disk: 26 (sign-in, mfa, invite, fleet, pricing, coupons, customers, content, reviews, settings, staff, chauffeurs, photos wiring, profile).

## Gaps that are not code

1. Hosted JWT paste with `"aal":"aal2"` and `app_metadata.vamos_role":"admin"` still needs the owner to sign in at `/ops/sign-in` (or public sign-in then ops) and enrol TOTP. Without that claim, ops screens return empty rows.
2. `CONTENT_SOURCE` stays `json` on staging until proven.
3. Public amounts stay `CHF 000` until the owner matrix / `pricing_live`.
4. Dashboard / Bookings / Calendar remain Phase 8.

## Must-haves vs nice-to-haves

Must-haves for this phase (staff console, no fake data on pages Phase 6 owns) are in the tree. Nice-to-have conversational UAT of every ops screen waits on the JWT session above.
