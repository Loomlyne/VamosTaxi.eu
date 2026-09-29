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

## Extension: vamos_system table access (coordinator request)
`vamos_system` is definer-only since 20260827000002 (revoke all on all tables); only contact_submissions, support_inbound_events, support_messages, support_message_files were granted back (20260918120000). Raw table statements inside `asSystem` fail with 42501. Each was replaced by a narrow SECURITY DEFINER function (empty search_path, only the needed columns, EXECUTE vamos_system only, no table grant), all in migration `20260930210000_system_role_narrow_reads.sql`, called through `apps/web/lib/db/system-reads.ts`.

**Migration order on hosted:** 20260930200000_reminder_24h_read.sql, then 20260930210000_system_role_narrow_reads.sql (both verbatim, read back, compare), then deploy the Worker.

New functions (16): paid_cancel_mail_read, booking_captured_payment, price_changed_unpaid_contacts, expired_booking_contact, must_fix_trip_read, booking_snapshot_policy, phone_booking_unpaid_read, manage_booking_review_state, edit_request_snapshot_total, edit_request_booking_contact, edit_request_pending_payload, booking_trip_for_mail, edit_request_extra_session (reads); booking_refund_processing_mark, edit_request_refuse, booking_flight_write (writes). Plus reminder_24h_candidates from 20260930200000.

Proof: pgTAP `system_role_narrow_reads.test.sql` (48: grants per role, definer plus empty search_path, raw read and write still 42501, each function's answer and effect); guard unit test `lib/db/system-reads.test.ts` fails on any asSystem block that reads or writes an ungranted table; local end to end `lib/db/system-reads.local.test.ts` (needs `VAMOS_LOCAL_DB_PORT`, disposable stack, committed fixture) runs every function and the reminder job through the real asSystem with the vamos_edge login. Other definer-only roles checked: asGuest reads only column-granted `bookings.id` (ok); asCheckout, asQuote, asAnon and publicSql use functions or granted tables only.

### asSystem audit (every site that reaches a table)
| file:line (before) | table(s) | job | fails on live before | fix |
|---|---|---|---|---|
| lifecycle/reminder.ts:81 | booking_legs, bookings, chauffeurs, vehicles | hourly 24 h reminder | yes (seen) | reminder_24h_candidates |
| lifecycle/paid-cancel.ts:151 | bookings, booking_legs, chauffeurs | paid-cancel mails | yes | paid_cancel_mail_read |
| lifecycle/paid-cancel.ts:290; ops/bookings-write.ts:152 | booking_payments | auto_full refund lookup | yes | booking_captured_payment |
| lifecycle/paid-cancel.ts:311 | bookings (update) | refund_status processing | yes (swallowed by try/catch) | booking_refund_processing_mark |
| checkout/lock-mail.ts:52 | bookings, price_snapshots | price-changed mail on rate publish | yes | price_changed_unpaid_contacts |
| checkout/lock-mail.ts:77 | bookings, price_snapshots | expired-unpaid mail | yes | expired_booking_contact |
| ops/must-fix-mail.ts:67, :121 | bookings, booking_legs | overlap and paid-after-cancel ops alerts | yes | must_fix_trip_read |
| ops/voucher.ts:50 | price_snapshots | resend voucher (extras in mail) | yes | booking_snapshot_policy |
| ops/phone-booking.ts:91 | bookings, booking_legs, price_snapshots, vehicle_classes, booking_payments | staff Send pay link / Take card | yes | phone_booking_unpaid_read |
| api/manage/booking/route.ts:134 | bookings, reviews | manage page review state and total | yes (caught, review flag wrong) | manage_booking_review_state |
| ops/edit-request.ts:326 | price_snapshots | extra-fare old snapshot total | yes | edit_request_snapshot_total |
| ops/edit-request.ts:358 | bookings | extra-fare contact | yes | edit_request_booking_contact |
| ops/edit-request.ts:569 | bookings, booking_edit_requests (update) | refuse edit request | yes | edit_request_refuse |
| ops/edit-request.ts:608 | booking_edit_requests, bookings | pending time-change check | yes (caught, false) | edit_request_pending_payload |
| ops/edit-request.ts:646 | bookings, booking_legs, chauffeurs | time-change outcome mail | yes | booking_trip_for_mail |
| ops/edit-request.ts:716 | booking_legs (update), booking_events (insert), bookings, chauffeurs | customer flight number write | yes | booking_flight_write |
| ops/edit-request.ts:798 | bookings, booking_edit_requests | staff extra-fare pay URL | yes | edit_request_extra_session |
| ops/ticket-inbound.ts:52; api/contact/route.ts:77, :150 | contact_submissions, support_messages, support_inbound_events | support inbound and contact | no (granted to vamos_system) | unchanged |
| every other asSystem site (settle, purge, notify, dlq, return-settle, webhook, refund, assign, bookings-write cancel/mark, contact, reviews submit, health probe) | none (public.<function>() only) | | no (EXECUTE granted, checked locally) | unchanged |

## Not verified
- Live: nothing touched. The hosted database needs migration 20260930200000 applied (verbatim, read back and compare) before the Worker deploy, otherwise the reminder call fails with "function does not exist".
- The 42501 suspects from the first hand-over (paid-cancel, lock-mail) are fixed in the extension above; live grants were confirmed read-only by the coordinator, not by me.

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
