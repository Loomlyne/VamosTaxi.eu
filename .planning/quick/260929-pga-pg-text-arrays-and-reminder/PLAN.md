# Quick 260929-pga: Postgres arrays through the Worker client, and the 24h reminder read

## Objective
Every Postgres array crossing the Worker's SQL client works again (results parse to JS arrays, JS arrays serialize to array literals), and the hourly 24h reminder query stops failing with "permission denied for table booking_legs". Live hotfix ("Fix 4") on top of fix/26.3-new-trip-save 4ee31548.

## Cause
1. `packages/db/src/identity.ts` `client()` and `packages/db/src/public.ts` `publicSql()` build postgres.js with `fetch_types: false`. postgres.js then registers no array parser or serializer: a `text[]` result arrives as the string `{cs_test_...}`, and a JS array parameter has type 0 and is sent as `String(array)` (`a,b`), not `{a,b}`.
2. Live effect since the 26.3 ship: `purge-unpaid.ts` `.filter` on a string throws (purge never ran; VT-26-0733/0734 remain); `notification_sweep($1::interval,$2::text[])` fails hourly "malformed array literal"; `settle.ts` iterates `other_open_session_ids` per character. The consumers of `checkout_expire_unpaid`, `checkout_cancel_unpaid`, `ops_cancel_booking`, `checkout_resume_read`, `extra_labels`, `chauffeurs.languages`, `chauffeurs.shift_weekdays` and `service_zones.tags` read the same broken shape.
3. Reminder: `apps/web/lib/lifecycle/reminder.ts` (since a1d6c56b, 2026-09-12) selects `booking_legs`, `bookings`, `chauffeurs`, `vehicles` directly through `asSystem`. `asSystem` is login `vamos_edge` then `SET ROLE vamos_system`; `vamos_system` has never been granted table SELECT on those tables (definer-only role model), so it fails every hour.

## Fix
- New `packages/db/src/pg-types.ts`: one `types` map (parse + serialize) for `text[]` 1009, `int2[]` 1005, `int4[]` 1007, `uuid[]` 2951, own array parser (NULL elements, quotes, escapes). Both clients pass it. `fetch_types` stays false.
- Because postgres.js types a plain JS array parameter as 0 (no serializer runs), array parameters are bound with `sql.array(values, 1009)`; `notify.ts` does so. `pgTextArrayLiteral` call sites pass a string of type 0, which the serializer never touches, so they keep working and stay (no double encoding).
- `purge-unpaid.ts`: session-id handling moves inside the per-row `try`; the webhook path logs `purge_unpaid_failed` instead of swallowing.
- Reminder: new migration `20260930200000_reminder_24h_read.sql`, `public.reminder_24h_candidates(timestamptz, timestamptz)` SECURITY DEFINER, empty search_path, returns only the reminder columns, EXECUTE to vamos_system only. `reminder.ts` calls it. No table grant to any role.

## Files
- packages/db/src/pg-types.ts (new), identity.ts, public.ts
- apps/web/lib/checkout/purge-unpaid.ts (+ test), notify.ts
- packages/db/test/local/worker-arrays.test.ts (new), test/local/fixtures/worker-arrays.sql (new)
- packages/db/supabase/migrations/20260930200000_reminder_24h_read.sql (new), supabase/tests/reminder_24h_read.test.sql (new)
- apps/web/lib/lifecycle/reminder.ts, reminder.test.ts

## Acceptance
- The integration test, run through the real `publicSql` / `withIdentity` client factories against a real local database, fails on the pre-fix code and passes after: purge_candidates, checkout_booking_session_ids, notification_sweep with a kinds array, checkout_payment_settle other_open_session_ids, checkout_expire_unpaid.
- The definer read works as vamos_system, is denied to vamos_edge, anon, authenticated, checkout; the reminder job runs end to end locally.
- Full check list green (replay + pgTAP on a private stack on ports 603xx).

## Threat model
| Threat | Where | Disposition |
|---|---|---|
| Array text injection through the serializer | pg-types serializer | mitigate: elements are quoted and backslash/quote escaped; values are bound parameters, never concatenated into SQL |
| Widening vamos_system/vamos_edge table access | reminder migration | mitigate: no table grant; one definer function, search_path empty, schema-qualified names, EXECUTE revoked from public, granted to vamos_system only |
| Definer read leaking PII | reminder function | mitigate: returns only fields the reminder mail already uses (contact_email, pickup/dropoff text, chauffeur name, vehicle, plate), fixed 1-hour window arguments, excludes erased/cancelled/completed/no_show |
| Purge deleting a booking on a mis-parsed session list | purge-unpaid | mitigate: an empty or unparsable session list still never purges; a per-row error skips the row |
| Purge run on live by the test | test | accept: test refuses non-127.0.0.1 hosts; no live access |
