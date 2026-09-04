---
phase: 05-public-surfaces-customer-accounts
plan: 32
subsystem: owner-checks
status: executed
completed: 2026-09-04
---

# Plan 05-32: Record 05-24 facts — execution summary

## Delivered

- Rewrote `05-OWNER-CHECKS.md` with the 2026-09-04 live facts. No dashboard clicks. 05-24 stays skipped.

## Facts recorded

- Confirm email ON — do not `config push`.
- Send Email Hook On; URI `/api/auth/email-hook`; GET 405; unsigned POST 401 empty; from `noreply@vamostaxi.site` via Cloudflare Email.
- Resend domain verified; auth mail is not Resend.
- Contact Turnstile live. Partner Turnstile dead.
- `/partner` 404. Partner table dropped in 05-31.

## Commits

- This summary lands with the 05-32 docs commit.

## Verification

- File contains 2026-09-04 and Send Email Hook On.
- No dashboard tools were used.

## Self-check

- `05-OWNER-CHECKS.md` is the 2026-09-04 record.
- 05-24 was not re-run.
