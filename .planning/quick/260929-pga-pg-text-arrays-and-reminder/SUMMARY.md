# Quick 260929-pga — summary (written by the orchestrator from the executor's report; the executor's tool refused SUMMARY.md)

## What was wrong on live (since the 26.3 ship, and older)
1. **Arrays:** both postgres.js clients (`packages/db/src/identity.ts:135`, `public.ts:36`) run with `fetch_types: false` and no array parser/serializer → every `text[]` result arrived as a string (`"{cs_…}"`) and the one bare JS array parameter went out as a string. Effects: purge never ran (VT-26-0733/0734 remain), notification_sweep failed hourly ("malformed array literal"), settle never expired sibling sessions, plus chauffeur languages / shift weekdays / zone tags / extra-label machine_langs read as strings.
2. **System role reads:** `vamos_system` is definer-only since `20260827000002` (only the support tables are granted back). 17 `asSystem` statements read or wrote ungranted tables directly → 42501 on live: 24h reminder (failing hourly since 2026-09-12, a1d6c56b), paid-cancel mails and auto refund lookup, price-changed and expired-unpaid mails, ops must-fix alerts, voucher resend, **staff Send pay link / Take card (`ops/phone-booking.ts:91`)**, manage-page review flag, and every extra-fare / edit-request path.

## Fix
- `packages/db/src/pg-types.ts`: parse + serialize for text[] (1009), int2[] (1005), int4[] (1007), uuid[] (2951), used by both clients; `fetch_types` stays false. Array parameters bound with `sql.array(values, oid)` (only notify.ts passed a bare array). `pgTextArrayLiteral` / `pgSmallintArrayLiteral` sites stay (type 0, no double encoding).
- `purge-unpaid.ts`: session handling inside the per-row try; webhook purge logs `purge_unpaid_failed`.
- Migration `20260930200000_reminder_24h_read.sql`: `reminder_24h_candidates`.
- Migration `20260930210000_system_role_narrow_reads.sql`: 16 narrow SECURITY DEFINER functions (empty search_path, only needed columns, EXECUTE vamos_system only; writes: booking_refund_processing_mark, edit_request_refuse, booking_flight_write). No table grant to any role. Callers via `apps/web/lib/db/system-reads.ts`; guard test fails on any asSystem raw table statement on an ungranted table.
- Full audit table: HANDOVER.md.

## Proof
- `packages/db/test/local/worker-arrays.test.ts` through the real publicSql/withIdentity clients: 8/8 FAIL at fa14d3d2, 8/8 PASS after (+3 pg-types unit tests).
- pgTAP `reminder_24h_read` (14) and `system_role_narrow_reads` (48, incl. raw read still 42501; caught a real ambiguous-column bug in booking_flight_write, fixed).
- `apps/web/lib/db/system-reads.local.test.ts`: every function through the real asSystem with the vamos_edge login + runReminder24h, passes twice.
- Checks: from-zero replay; pgTAP 76 files / 1754; unit; typecheck; lint; lint:css; numbers; legal-claims; public-env; db-fences; i18n; seed; types (regenerated from the private stack; `db:types:check` points at another session's 54321 stack); build with lint — all pass.

## Not verified
- Stripe-dependent jobs (staffPayLink, refund) not run end to end as jobs; their SQL half is covered.
- The guard test was not run against the pre-fix code.
- Live: nothing run. VT-26-0733/0734 remain until deploy + next hourly run.

## Commits (on top of 4ee31548)
fa14d3d2, ad1dcba7, 7f29dc3e, cd72e62c, 2181d2d3, ad1dd46f, 3169a863, 5b7d4ff2, e3c599c5, + this summary.
