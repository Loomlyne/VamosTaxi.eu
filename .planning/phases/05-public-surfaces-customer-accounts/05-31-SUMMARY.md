---
phase: 05-public-surfaces-customer-accounts
plan: 31
subsystem: partner-removal
status: executed
completed: 2026-09-04
---

# Plan 05-31: Drop partner_applications — execution summary

## Delivered

- Added `packages/db/supabase/migrations/20260904000001_drop_partner_applications.sql` (`drop function` then `drop table`). Does not touch `contact_submissions`.
- pgTAP `contact_forms.test.sql` now `plan(20)`: contact assertions stay; partner table/RPC asserted absent.
- Removed public i18n CTA `'Become a partner'`. No `href` to `/become-a-partner` under `app/`.
- `ops-dc-content.spec.ts` asserts the dict has no partner CTA.

## Hosted apply

- Applied via Supabase MCP `apply_migration` on `yaumjzvylngfjhtuffqs` (`drop_partner_applications`).
- Verified: `partner_applications` and `submit_partner_application` are null; `contact_submissions` remains.

## Commits

- This summary lands with the 05-31 code commit.

## Verification

Passed:

- Hosted SQL readback after apply
- Dict has no `'Become a partner'`
- 05-19 was not executed

Not run: `pnpm --filter @vamos/db run db:test` (owner Task 3). No `db:types` regen. Historical `20260828000002_contact_forms.sql` left as-is (creates then this migration drops).

## Self-check

- New SQL file drops the table and not `contact_submissions`.
- 05-19 not run.
