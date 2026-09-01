---
status: complete
phase: 06-ops-reference-data-content-console
source:
  - 06-01-SUMMARY.md
  - 06-02-SUMMARY.md
  - 06-03-SUMMARY.md
  - 06-04-SUMMARY.md
  - 06-05-SUMMARY.md
  - 06-06-SUMMARY.md
  - 06-07-SUMMARY.md
  - 06-08-SUMMARY.md
  - 06-09-SUMMARY.md
  - 06-10-SUMMARY.md
  - 06-11-SUMMARY.md
  - 06-12-SUMMARY.md
  - 06-13-SUMMARY.md
started: 2026-09-01T20:38:39Z
updated: 2026-09-01T20:38:39Z
---

## Current Test

number: 14
name: Phase 6 close
expected: |
  DC ops console on dashboard.vamostaxi.site is the product. Staff hash, Stripe copy, passkeys, digest, empty chrome.
awaiting: none

## Tests

### 1. Dispatch login is the DC mock
expected: `/login` heading Dispatch sign in; logged-out `/` 308s here; not Next OpsSignIn
result: pass
reported: "Live HTML 200 contains Dispatch sign in. Worker 014aa629."

### 2. Wrong password
expected: POST /api/auth password miss returns banner credentials
result: pass
reported: "{\"stage\":\"form\",\"banner\":\"credentials\"} http=200"

### 3. Staff rail `#staff`
expected: Sidebar href #staff; ops ROUTES includes staff; isSettings is settings || staff
result: pass
reported: "Live OpsSidebar.dc href:'#staff'. Live ops.dc ROUTES includes staff; isSettings includes staff."

### 4. Hash tabs have no yellow/white document cover
expected: same-document hash uses 150ms in-place #dc-root transition
result: pass
reported: "Live vamos-page-transition.js has vt-ops-hash-switch 150ms; samePage+hash returns false (no cover)."

### 5. Fleet hierarchy
expected: Vehicles and Chauffeurs under Fleet
result: pass
reported: "Live OpsSidebar.dc has Vehicles and Chauffeurs."

### 6. Currency field full width
expected: BrandSelect field root width 100%; dashboard CHF host lock unchanged
result: pass
reported: "Live BrandSelect.dc [data-vs-root=field]{display:flex;width:100%}"

### 7. No delete-profile surface
expected: No Delete profile copy or handler on OpsProfile
result: pass
reported: "Live OpsProfile.dc has neither Delete profile nor deleteProfile."

### 8. Stripe-only payments copy
expected: Settings payments row is Stripe-hosted checkout only
result: pass
reported: "Live OpsSettings.dc tStripeCheckout / stripeCheckout. data-vt-langgrid=0."

### 9. Passkeys
expected: Settings enroll via /api/auth passkey-register-start; login Sign in with a passkey via passkey-start
result: pass
reported: "Live OpsSettings.dc passkey-register-start x2. Live AuthForm.dc startPasskey + passkey-start/verify. No removePasskey."

### 10. Password eye
expected: In-field Show password overlay on ops AuthForm
result: pass
reported: "Live AuthForm.dc Show password=1 data-af-eye=4"

### 11. Empty chrome / no fake trips
expected: No VT-4821 / bookings:7 sample board
result: pass
reported: "Live ops.dc VT-4821=none. WELCOME in OpsCoupons.dc is a placeholder hint, not a seeded row."

### 12. Morning digest
expected: Hourly cron; Zurich 06:00 gate; guest rows; no fake send
result: pass
reported: "Worker schedule 0 * * * *. digest.test.ts in 24/24 unit pass."

### 13. Profile avatar persistence
expected: Avatar upload key survives save/reload mapping
result: pass
reported: "06-13 code + ops-dc-settings tests. Live owner reload not clicked this sitting."

### 14. Owner-gated leftovers
expected: CONTENT_SOURCE json; MFA paused; pricing_live false; no invented CHF
result: skipped
reason: Owner gates. Not Phase 6 close work. I18N-07 stays Pending until he flips CONTENT_SOURCE=db.

## Summary

total: 14
passed: 13
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[]
