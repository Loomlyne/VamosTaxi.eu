---
phase: 29-webhook-purchase
plan: 02
subsystem: database
tags: [migration, pgtap, meta-capi, consent]
requires: ["29-01"]
provides:
  - migration 20261007260000_meta_purchase.sql (applied to own stack only)
  - meta_purchase_claim / meta_purchase_finish / meta_purchase_clear_ids (vamos_system)
  - checkout_set_meta_click_ids(uuid,text,text,uuid) (vamos_checkout)
  - bookings.meta_consent_subject, table meta_purchase_events
affects: [29-03, 29-04, 29-05, 29-06]
key-files:
  created:
    - packages/db/supabase/migrations/20261007260000_meta_purchase.sql
    - packages/db/supabase/tests/meta_purchase.test.sql
  modified:
    - packages/db/database.types.ts
requirements-completed: [META-10, META-11, META-12, META-13]
duration: 40min
completed: 2026-10-03
---

# Phase 29 Plan 02: Purchase claim migration Summary

One additive migration: the once-only Purchase claim (first succeeded payment, refund, test, age, ids, consent re-check under the current policy), a wipe of fbp, fbc and consent subject on every decision, and the Pay press writer with a consent subject.

## Commits
- 88bf51d1 test(29-02): pgTAP red (4 of 4 run failed, objects missing)
- c544a116 feat(29-02): migration, pgTAP fix-ups, types

## Results
- pgTAP from-zero reset plus full run: Files=102, Tests=2824, PASS. meta_purchase.test.sql 94/94, booking_meta_click_ids.test.sql unchanged and passing.
- Applied to the own native stack (vamos-taxi-290, port 62322) only. Nothing hosted.
- Claim order: lock booking, already, first-payment check (no row, no clear for a later payment), refusals (refunded, erased, not_paid, is_test, refund row, zero_charge, too_old), worker skips, no_ids, no_subject, consent_off, else send. Every row-writing branch empties the three columns.

## Types method
The pinned CLI (2.115.0, `pnpm exec supabase`) needs Docker for `--local` and for `--db-url` (its pg-meta container cannot reach the host DB), so it could not run. The native CLI 2.119.0 (`supabase gen types typescript --local --schema public --workdir $TMPDIR/vamos-sb-vamos-taxi-290`) worked, but its output has a different layout from the committed file (unformatted, extra helper types). The committed style was kept and only the delta was hand-applied: `meta_consent_subject` on bookings (Row/Insert/Update), table `meta_purchase_events`, the 4-argument writer overload, claim, finish, clear_ids. A word-multiset comparison against the generated output shows no difference except the generator's own boilerplate (NonNullable, Record, PropertyKey, never; boolean/unknown spellings). `db:types:check` with the pinned CLI was not run (it targets Docker stack 54322); the lead should run it or regenerate once with the pinned CLI.

## Deviations from Plan
**1. [Rule 3 - Blocking] Test fixtures.** `booking_payments` has a `charged_rappen > 0` check and a one-succeeded-per-snapshot unique index (`booking_payments_one_success_per_snapshot`, not the name the plan assumed). The test drops both inside its rolled-back transaction to shape zero_charge and not_first_payment; fixtures are inserted with triggers off (`session_replication_role = replica`) and then restored to origin.
**2. Types** hand-applied delta, see above.
**3.** The claim also revokes EXECUTE from anon and authenticated explicitly (belt and braces); service_role untouched.

Checks: no `insert into public.bookings` copying whole rows found in migrations or apps/web/lib. Migration has no begin/commit, no default-privileges change, one `reset lock_timeout` after the table.

## Known Stubs
None.

## Self-Check: PASSED
