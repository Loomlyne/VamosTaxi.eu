# Hand-over: Postgres arrays and 24h reminder (quick task 260929-pga)

**Branch:** `fix/26.3-pg-arrays` in `/Users/koss/Developer/vamos-wt/fix-26.3-arrays`, cut from `fix/26.3-new-trip-save` 4ee31548. Final commit: the commit adding this file (`git log -1`). Folder clean. No push, no PR, no deploy, no live SQL, no purge run.

## Root cause
1. Both Worker SQL clients use `fetch_types: false`, so postgres.js had no array handling: text[] results came back as "{a,b}" strings, JS array parameters went out as "a,b". Purge sweep, notification sweep, settle's sibling-session expiry, chauffeur languages, zone tags and extra labels were all wrong or throwing since the 26.3 ship.
2. The 24h reminder has selected tables as `vamos_system` since 2026-09-12; that role never had table SELECT, so it failed every hour.

## Fix
- `packages/db/src/pg-types.ts` (text[], int2[], int4[], uuid[] parse and serialize), used by `identity.ts` and `public.ts`. `fetch_types` stays false.
- Array parameters must be bound with `sql.array(values, oid)`; `notify.ts` now does. Literal-string call sites (`pgTextArrayLiteral`) stay as they are.
- `purge-unpaid.ts`: session ids handled inside the per-row try; webhook purge logs `purge_unpaid_failed`.
- Migration `20260930200000_reminder_24h_read.sql` (definer read, EXECUTE vamos_system only, no table grant) and `reminder.ts` uses it.

## Checks
Failing-then-passing integration test through the real clients (8 failed before, 8 pass after); from-zero replay and full pgTAP (75 files, 1706 tests) on a private stack; test:unit, typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, db:seed:check, types, `pnpm --filter web build`. Audit table below. SUMMARY.md could not be written in this session (the tool refused it); the executor's final report carries the same content.

## Not verified
- Live: nothing touched. The hosted database needs migration 20260930200000 applied (verbatim, read back and compare) before the Worker deploy, otherwise the reminder call fails with "function does not exist".
- Suspects of the same 42501 class, not changed: `lib/lifecycle/paid-cancel.ts:152,291`, `lib/checkout/lock-mail.ts:53,78` (asSystem table reads). Look at live logs.

## After deploy (owner or control session)
1. Apply the migration to hosted Supabase (verbatim), confirm `has_table_privilege('vamos_edge','public.booking_legs','select')` is still false and `vamos_system` has EXECUTE on `reminder_24h_candidates`.
2. Deploy the Worker `vamos` from the Mac.
3. Wait for the next hourly cron. Expected in the logs: no "malformed array literal" from notification_sweep, no "permission denied for table booking_legs", and `purge_unpaid` reports purged for the two old unpaid bookings VT-26-0733 and VT-26-0734 only if Stripe shows their sessions expired.
4. Real card payment as usual before ship (checkout settle now expires sibling sessions).

## Array audit (R read, W written; before = live with fetch_types false)
| file:line | SQL | Dir | Before | After |
|---|---|---|---|---|
| lib/checkout/purge-unpaid.ts:133, :40 | purge_candidates().session_ids | R | string, .filter threw, purge never ran | string[], inside per-row try |
| purge-unpaid.ts:112, :95; app/api/checkout/intent/route.ts:185 | checkout_booking_session_ids | R | string | string[] |
| lib/checkout/notify.ts:391 | notification_sweep(p_kinds text[]) | W | malformed array literal hourly | sql.array(k, 1009) |
| lib/checkout/settle.ts:455, :581 | checkout_payment_settle().other_open_session_ids | R | string, siblings never expired | string[] |
| lib/checkout/expire-unpaid.ts:27,57; cancel-unpaid.ts:68,91; lib/ops/bookings-write.ts:106,146 | checkout_expire_unpaid, checkout_cancel_unpaid, ops_cancel_booking .stripe_checkout_session_ids | R | string | string[] |
| lib/checkout/resume.ts:78 | checkout_resume_read().extra_codes | R | string | string[] |
| rate-book/route.ts:634 | extra_labels_read().machine_langs | R | string, .filter threw | string[] |
| lib/ops/chauffeurs.ts:242 | chauffeurs.languages | R | string, shown empty | string[] |
| lib/ops/chauffeur-desk.ts:113,133 | chauffeurs.shift_weekdays int2[] | R | string, parsed empty | number[] |
| rate-book/route.ts:201,211; lib/ops/mapbox-zone.ts:219 | service_zones.tags | R | string, .some threw | string[] |
| settle.ts:510; rate-book/route.ts:229,701; chauffeurs actions.ts:76,111; chauffeurs-write.ts:37,65,97; chauffeur-desk.ts:172 | stripe_event_begin, service_zones.tags, staff_extra_label_upsert, chauffeurs.languages, shift_weekdays | W | worked (literal string, type 0) | unchanged, can stay, no double encoding |

No uuid[], int4[] or jsonb[] crossing exists in Worker code; uuid[] and int4[] are registered anyway and tested.
