---
status: complete
phase: 10-hardening-performance-security-compliance
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md, 10-05-SUMMARY.md, 10-06-SUMMARY.md, 10-07-SUMMARY.md, 10-08-SUMMARY.md, 10-09-SUMMARY.md, 10-10-SUMMARY.md
started: 2026-09-12T18:20:51Z
updated: 2026-09-12T18:50:00Z
---

## Current Test

[none — UAT complete]

## Tests

### 1. Cookie banner on public home
expected: Private window on https://vamostaxi.site/ shows two buttons only (Accept and Dismiss). No four-toggle grid.
result: pass
notes: Live DC banner is ACCEPT ALL / NECESSARY ONLY / Manage preferences. No four toggles on the strip. Owner said done.

### 2. After Accept, banner gone
expected: After Accept, reload https://vamostaxi.site/ — banner does not return.
result: pass

### 3. Dashboard has no cookie banner
expected: https://dashboard.vamostaxi.site/login has no cookie banner.
result: pass

### 4. Cookies page is necessary-only
expected: https://vamostaxi.site/cookies lists necessary cookies only. No fake Analytics/Marketing toggles.
result: pass

### 5. Quote funnel still works
expected: Home quote SELECT reaches /checkout. No Turnstile on checkout. Pay path not 403.
result: pass

### 6. Authorized health JSON
expected: Owner curl with secret header returns http=200 and {ok, db, payments, maps} all true.
result: pass

### 7. WAF skip Stripe webhook
expected: Custom rule Skip Stripe webhook Active, order 1, path /api/stripe/webhook, on vamostaxi.site only.
result: pass

### 8. Practice restore onto a copy
expected: Restore onto a new Supabase project; live yaumjzvylngfjhtuffqs never the target.
result: skipped
reason: Owner on Supabase Free; parked until after remaining V1 phases. Do not buy Pro/PITR this sitting.

### 9. Leak gates empty 404
expected: No-header GET /api/internal/health and GET /api/dev/db-smoke are empty 404 (0 bytes).
result: pass

## Summary

total: 9
passed: 8
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none]
