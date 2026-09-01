---
phase: 06-ops-reference-data-content-console
plan: 12
subsystem: ops-dc
tags: [dashboard, dc-html, passkeys, digest, staff-hash, four-classes]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: DC ops console 06-01…11
provides:
  - Staff rail #staff, four vehicle classes, photo chooser, nested chauffeur, date editor, ISO currency labels
  - Passkey enroll via /api/auth register ceremony; invite claim does not lock out the sole admin
  - Hourly cron + Zurich 06:00 digest; Resend already configured
  - Staging deploy vamos-web-staging ee76578d
affects: [dashboard.vamostaxi.site, staff JWT accepted_at, wrangler cron]

tech-stack:
  added: []
  patterns: [DC .dc twins for CF html_handling, invite claim best-effort, digest hourly+IANA gate]

key-files:
  created:
    - apps/web/lib/ops/digest.ts
    - apps/web/lib/ops/digest.test.ts
    - apps/web/lib/ops/ops-dc-finalize.test.ts
    - packages/db/supabase/migrations/20260901000001_staff_invitation_acceptance_gate.sql
    - packages/db/supabase/migrations/20260901000002_staff_daily_digest.sql
  modified:
    - app/ops/OpsSidebar.dc.html
    - app/ops/OpsSettings.dc.html
    - app/ops/OpsFleet.dc.html
    - app/ops/OpsTable.dc.html
    - app/ops/OpsPricing.dc.html
    - app/ops/BrandSelect.dc.html
    - app/ops/AuthForm.dc.html
    - app/vamos-ops-data.js
    - apps/web/worker.ts
    - apps/web/wrangler.jsonc
    - scripts/sync-dc-mock-to-public.mjs

key-decisions:
  - "MFA paused; invitation gate backfills accepted_at for existing active admin"
  - "Claim-invite failure after password ok does not paint credentials"
  - "CONTENT_SOURCE stays json; pricing_live not flipped"
  - "Do not build extra staff-invite RBAC; sole admin remains koussayzayeni@gmail.com"

patterns-established:
  - "Ops DC siblings upload as .dc and .dc.html twins"
  - "Cloudflare cron is hourly; Zurich 06:00 is selected in worker.ts"

requirements-completed: []

duration: 90 min
completed: 2026-09-01
---

# Phase 6 Plan 12: dashboard comment pack Summary

**DC ops console on `dashboard.vamostaxi.site` has the 10 settings comments plus 06-12 nav/passkeys/digest. Staging worker `vamos-web-staging` version `ee76578d-f490-419e-8460-62842ab2670f`.**

## Performance

- **Tasks:** 4/4 code; hosted CONTENT_SOURCE not flipped; MFA still paused
- **Unit:** 22 passed (`ops-dc-settings`, `ops-dc-finalize`, `digest`)

## Accomplishments

- Staff rail is `#staff`. Company Save hides on that pane.
- Four classes Economy / Business / First / Van in fleet, rate-book, ops data.
- Photo chooser, chauffeur association, nested add-chauffeur, date input, ISO currency `data-vt-no-i18n`.
- Passkey enroll is the real `/api/auth` ceremony. No remove control.
- Invite claim is best-effort; hosted admin `accepted_at` is set.
- Digest cron `0 * * * *` gated at 06:00 Europe/Zurich.
- Live `.dc` curls all hit the fingerprints. Login is Dispatch sign in. Password miss → `banner: credentials`.

## Task Commits

1. Nav/profile/passkeys/digest — `0376e6b` … `becc8f6`
2. Ten comments + admin backfill — `51fb81d`
3. Staging deploy — worker version `ee76578d-f490-419e-8460-62842ab2670f`

## Decisions Made

- Extra dispatcher/invite RBAC UI is out (owner 2026-09-01). Gate stays compatible with the sole admin.
- Do not flip `CONTENT_SOURCE=db`.
- Do not invent CHF / `pricing_live`.
