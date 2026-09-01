---
phase: 06-ops-reference-data-content-console
verified: 2026-09-01T20:38:39Z
status: passed
score: 13/13 plans have SUMMARYs; staging worker 014aa629 fingerprints green
overrides_applied: 0
gaps:
  - item: "I18N-07 hosted CONTENT_SOURCE=db"
    why: "06-11 Task 2 not applied. Owner gate. Public site still reads json."
    blocks_merge: false
  - item: "MFA / aal2"
    why: "Paused until owner asks. Sole admin koussayzayeni@gmail.com."
    blocks_merge: false
---

# Phase 6: Ops Reference Data & Content Console — Verification

**Phase goal:** Staff edit reference data and content on `dashboard.vamostaxi.site`. DC mock is the product. Dashboard / Bookings / Calendar stay Phase 8 empty chrome. No invented CHF.

**Verified:** 2026-09-01
**Status:** passed
**Re-verification:** Yes — DC replan + 06-12/06-13. Ignore archive-react `06-UAT.md` and the old 17-plan React twin.

## Method

Worktree `.worktrees/phase-06-close` at `origin/main` `1813199`. Dirty local `main` not used.

```
pnpm --filter web vitest  ops-dc-settings, ops-dc-finalize, digest
  -> 3 files, 24 tests, pass
CLOUDFLARE_ENV=staging pnpm --filter web run deploy -- --env staging
  -> vamos-web-staging 014aa629-5a0e-4114-8cd9-fb1b18c4e722
curl Chrome-UA .dc twins on dashboard.vamostaxi.site?nocache=014aa629
POST /api/auth password miss -> banner credentials
```

No Docker. No Hyperdrive POST. No `vamos-web` / env.production.

## Plans (13/13)

| Plan | What | SUMMARY |
|------|------|---------|
| 06-01 | Delete React ops. Keep staff APIs | yes |
| 06-02 | Staff JSON door + rate-book PUT map | yes |
| 06-03 | `/login` DC, invite → `/login`, password eye, MFA paused | yes |
| 06-04 | Fleet / chauffeurs JSON + R2 photos | yes |
| 06-05 | Pricing draft→publish | yes |
| 06-06 | Coupons | yes |
| 06-07 | Customers read-only | yes |
| 06-08 | Reviews publish/hide/reorder + photo | yes |
| 06-09 | Settings / roster / profile + D-12 nav hide | yes |
| 06-10 | content_strings editor | yes |
| 06-11 | I18N-07 loader; CONTENT_SOURCE default json | yes |
| 06-12 | Comment pack: #staff, passkeys, digest, four classes | yes |
| 06-13 | UAT regressions: hash fade, fleet hierarchy, avatar, digest brand | yes |

## Live fingerprints (014aa629)

- `/login` Dispatch sign in
- `ops.dc` ROUTES includes `staff`; `isSettings` = settings \|\| staff; no VT-4821
- `OpsSidebar.dc` `href:'#staff'`
- `vamos-page-transition.js` `vt-ops-hash-switch` 150ms
- `BrandSelect.dc` field `width:100%`
- `OpsSettings.dc` Stripe checkout copy; `data-vt-langgrid` = 0; `passkey-register-start`; no `removePasskey`
- `OpsProfile.dc` no Delete profile
- `AuthForm.dc` `passkey-start` / Show password / `data-af-eye`
- Worker cron `0 * * * *`

## Requirements

- OPS-06, OPS-07, OPS-08, OPS-09, OPS-10 → Complete
- I18N-07 → Pending (hosted `CONTENT_SOURCE` stays json)

## Must-haves vs owner gates

Must-haves for this phase (DC console, staff APIs, no fake board rows) are live. Nice-to-have conversational click of Staff after owner sign-in is not a code gap — `#staff` no longer bounces to Dashboard.
