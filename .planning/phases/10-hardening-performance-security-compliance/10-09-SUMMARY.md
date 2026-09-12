---
phase: 10-hardening-performance-security-compliance
plan: 09
subsystem: infra
tags: [waf, cloudflare, stripe-webhook, launch-02]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Contact/review write limiter; checkout has no Turnstile (10-05, 10-06)
provides:
  - Owner WAF sitting notes at docs/ops/waf-vamostaxi-site.md
  - Skip path /api/stripe/webhook documented
affects: [LAUNCH-02]

tech-stack:
  added: []
  patterns:
    - Zone managed WAF is dashboard clicks, not wrangler.jsonc, not Terraform
    - Stripe webhook skip is uri path eq /api/stripe/webhook; HMAC stays the gate

key-files:
  created:
    - docs/ops/waf-vamostaxi-site.md
  modified: []

key-decisions:
  - "Task 1 only this sitting: sitting notes committed; Task 2 still owner (no Cloudflare clicks)"
  - "Skip path is exactly /api/stripe/webhook"
  - "Must-nots: do not open vamostaxi.eu; do not country-block dashboard; do not WAF workers.dev; no checkout captcha; funnel wins if quote/pay 403s"

patterns-established:
  - "Owner WAF notes live in docs/ops/, not docs/runbook/"
  - "LAUNCH-02 WAF is live only after the owner skip exists on vamostaxi.site"

requirements-completed: [LAUNCH-02]

duration: 1min
completed: 2026-09-12
---

# Phase 10 Plan 09: WAF sitting notes Summary

**Owner WAF click list for vamostaxi.site with skip `/api/stripe/webhook`. Task 2 (dashboard clicks) still owner — LAUNCH-02 WAF is not live.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-09-12T15:40:20Z
- **Completed:** 2026-09-12T15:41:13Z
- **Tasks:** 1/2 (Task 2 still owner)
- **Files modified:** 1

## Accomplishments

- `docs/ops/waf-vamostaxi-site.md` — numbered English clicks: Dashboard → zone vamostaxi.site → Security → WAF → enable managed rules → custom Skip when URI path equals `/api/stripe/webhook`
- www and dashboard confirmed as the same zone
- Must-nots written as prohibitions: do not open vamostaxi.eu; do not country-block dashboard; do not add WAF on workers.dev; no checkout captcha; if quote or pay 403s, loosen that rule (D-29)
- No screenshots, no secrets, no invented CHF, no Terraform, no wrangler WAF, no README link

## Task Commits

1. **Task 1: Write WAF sitting notes** - `ad1e01b` (docs)
2. **Task 2: Owner clicks WAF in the dashboard** - still owner. Agent did not click Cloudflare. Agent did not guess whether managed rules are already on.

**Plan metadata:** (this commit)

## Files Created/Modified

- `docs/ops/waf-vamostaxi-site.md` - Owner sitting notes (not the customer runbook)

## Decisions Made

- Followed plan as specified for Task 1. Stopped before Task 2 (blocking human-action).
- `requirements-completed` copies PLAN frontmatter `[LAUNCH-02]`. WAF is **not** live until Task 2 resume (`done`). Phase cannot claim LAUNCH-02 WAF until the skip exists.

## Deviations from Plan

None - plan executed exactly as written for Task 1. Task 2 left for the owner.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None

## User Setup Required

**Task 2 still owner.** Follow `docs/ops/waf-vamostaxi-site.md` in the Cloudflare dashboard:

1. Zone vamostaxi.site only (www + dashboard).
2. Enable managed WAF.
3. Skip `/api/stripe/webhook`.
4. Do not touch vamostaxi.eu.
5. Do not country-block dashboard.
6. Smoke: public quote still returns a product response; a test Stripe webhook delivery is not 403 from WAF.
7. If quote or pay is blocked, loosen that rule (D-29).

Type `done` when the skip exists, or `skip` if later. Do not deploy. Do not bind vamostaxi.eu.

## Next Phase Readiness

- 10-10 can proceed independently (runbook). Do not treat LAUNCH-02 WAF as done.
- wrangler.jsonc staging routes still vamostaxi.site / www / dashboard only — no .eu bind.

## Self-Check: PASSED

- `docs/ops/waf-vamostaxi-site.md` exists
- python assert: `/api/stripe/webhook`, `vamostaxi.site`, `country`, `do not` + `vamostaxi.eu`
- validation: no `custom_domain`
- wrangler.jsonc has no `pattern` line binding vamostaxi.eu
- git log contains `docs(10-09): write WAF sitting notes` (`ad1e01b`)

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12 (Task 1 only; Task 2 still owner)*
