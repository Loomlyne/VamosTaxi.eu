# J9 hand-over: database privilege hardening (payments review, 2026-10-09)

Branch `pay/j9-db-privileges` (worktree `.claude/worktrees/pay-j9-db-privileges`). **Stacked: base is `pay/j7-refund-policy`** (which is stacked on `pay/j1-mode-guard`); it contains J1 and J7.
Migration written, NOT applied anywhere: `20261009160000_db_privilege_hardening.sql`. **No Worker (TypeScript) change** in this job. Nothing pushed, deployed, or sent to a hosted database.
The held `20261007320000` (REST revoke) is not applied, edited or renumbered here, and this migration does not depend on it either way.

## What changed, per finding

| id | What | Proof |
|---|---|---|
| W5-07 | `vamos_staff` lost table-wide INSERT, UPDATE, DELETE on `bookings` and `booking_legs`. Column grants replace them, on exactly the columns the Worker writes today (every write in `apps/web` read): `bookings.customer_id, contact_name, contact_email, contact_phone, is_test, updated_at` (customer save `lib/ops/customers.ts:459`, test-unpaid route `rate-book/test-unpaid/route.ts:136`) and `booking_legs.arrived_at, updated_at` (mark arrival `lib/ops/bookings-write.ts`). Status, `refund_status`, `refund_owed_rappen`, `refunded_rappen`, `price_total_rappen`, `price_snapshot_id`, `erased_at`, leg status and times, all inserts and deletes now change only through the SECURITY DEFINER functions (J7's `staff_erase_unpaid_booking` is the erase). A BEFORE UPDATE trigger refuses `is_test` changes once a payment is captured (owner role excepted). | pgTAP `db_privilege_hardening` (updatable columns are exactly the six and the two; each refused write is 42501; the three real dashboard writes still work as `vamos_staff` with an aal2 admin claim) |
| W5-08 | `service_role` (the server key) is not used for money: the Worker uses it for Auth admin calls (`checkoutAuthAdmin`, `inviteUserByEmail`, `deleteUser`), one insert into `public.staff` (`legacyServiceClient`, staff invite) and the five `staff_digest_*` functions (`lib/supabase/service.ts`). So: every privilege on `booking_payments, booking_refunds, booking_refund_intents, booking_refund_reversals, booking_disputes, stripe_events` revoked from it; EXECUTE revoked on every function in `public` except the five digest functions (generic loop, skips extension members); the default privileges for new functions no longer list it. `booking_payments` rows can no longer be deleted by anyone except the purge of an expired unpaid booking (trigger, same test as `tg_append_only` carve-out 3). **Not done:** `FORCE ROW LEVEL SECURITY` on `booking_payments` (service_role and postgres bypass RLS, so it protects nothing here; the delete trigger does). | pgTAP: service_role holds none of SELECT/INSERT/UPDATE/DELETE/TRIGGER/REFERENCES on the six, EXECUTE on exactly the five digest functions, still INSERT on `staff`; the default ACL lists no service_role; a captured payment cannot be deleted; the purge still works |
| W5-18 | `checkout_abandon_unpaid`, `checkout_requote_cancel`, `purge_unpaid_booking` lock the booking's payment rows first (ordered), then the booking, as settle does. | pgTAP function-text order (as `refund_lock_order`), and new two-connection test `packages/db/test/local/unpaid-lock-order.test.ts`: settle holds the payment, the function waits at `booking_payments` holding nothing, settle takes the booking in < 500 ms. **Mutation check:** with the old `checkout_abandon_unpaid` restored on the lab, that test fails with a real `40P01` deadlock. |
| W5-19 | `checkout_attach_payment` refuses an erased or test booking (`restrict_violation`, message `booking_not_payable`; the intent route already maps 23001 to `quote_already_booked`). `checkout_set_pay_link` revokes the booking's earlier `pay` tokens when it stores the new one. | pgTAP |
| W5-23 | `checkout_cancel_unpaid` no longer reads the JWT e-mail claim. The caller must own the booking (`customers.user_id` via `bookings.customer_id`) or hold a CONFIRMED e-mail (`auth.users.email_confirmed_at`) equal to the booking's contact e-mail. The owner check now runs before the status check, so a stranger gets `not_found`, never `not_cancellable`. | pgTAP: stranger with the right claim, unconfirmed equal e-mail, confirmed equal e-mail, owner by customer id, no identity |
| W5-16 | `stripe_dispute_upsert` (J7 body): an event of the same second as a terminal status (`won`, `lost`, `warning_closed`, `charge_refunded`) cannot move the dispute back to an open one; between two open or two terminal statuses the later arrival still wins; older events never overwrite. This is the rank reading of the finding (a plain `<=` would have dropped legitimate same-second updates; the handler stores Stripe's re-read current status anyway). | pgTAP, six cases |
| W5-22 | `rest_function_grants.test.sql` now states in its header that it expects `20261007320000`, and its first test asserts that migration is in the applied history (so a green lab run is read as lab state, not live). | pgTAP |
| W5-21 | **Not done** (SQLSTATE mapping): changing the codes touches the settle consumer's retry logic in chain A's files (`settle-errors.ts`) and `refund-map.ts`; not low risk. |  |

Existing pgTAP files changed because behaviour changed on purpose: `booking_meta_click_ids` (#31: a staff Meta-click-id update is now 42501, the trigger is still proven by the owner-role lines), `pay_link_hold` (#22: the first token is revoked by the resend), `reference_format` (#10: service_role holds no EXECUTE on `next_booking_reference`), `settle_revive` and `unpaid_cancel_session` (the signed-in identities are now real confirmed `auth.users` rows).

## Deploy and migration order (controller)

1. **Deploy the J7 Worker before applying this migration** (or in the same window). The live Worker erases an unpaid booking with a plain `update public.bookings set erased_at ...` as `vamos_staff`; after this migration that write is permission denied until J7's `staff_erase_unpaid_booking` code is live. All other staff writes of the live Worker are on the allow-list.
2. Apply `20261009160000` verbatim (one transaction), after J7's two migrations. It runs `alter default privileges for role postgres ...`: the connector must run it as `postgres`.
3. Read back: `select count(*) from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and has_function_privilege('service_role',p.oid,'EXECUTE')` should be 5; if more, read `proacl` of the extras (a function that still carries PUBLIC EXECUTE shows through; service_role itself was revoked explicitly). `select has_table_privilege('service_role','public.booking_payments','SELECT')` false. `select column_name from information_schema.column_privileges where grantee='vamos_staff' and table_name='bookings' and privilege_type='UPDATE'` = the six columns. `select tgname from pg_trigger where tgname in ('booking_payments_no_delete','bookings_is_test_guard')` = 2 rows.
4. After applying: Supabase staff invite (uses service_role), the daily digest (cron), staff customer save, mark arrival, test unpaid booking, staff cancel of an unpaid booking: one try each (or read the next cron digest log).
5. Behaviour change to expect: a signed-in customer whose e-mail is NOT confirmed and whose booking is not linked to their account (`customer_id`) can no longer cancel that unpaid booking from the account page (it answers not found). If Supabase email confirmation is not enforced for sign-up, that is the point; if it is enforced, nobody is affected.

## Tests run (lab `pay-c`, native Supabase, own stack)

- **pgTAP, whole suite, after a clean `supabase db reset`: Files=112, Tests=3206, Result: PASS.** New file `db_privilege_hardening.test.sql` has 62 tests; `rest_function_grants` is 52 (was 51).
- `lab.sh dbtests`: `packages/db test/local` 76/76 (72 + the 4 new lock-order tests); apps/web seeded files 6/6. The other apps/web `.local.test.ts` passed 33/33 in one run and 30/33 in the last: `system-reads.local` and `return-settle-superseded.local` fail depending on run order (a live rate book is expected or is left over from a previous file); each passes alone on a clean database. They do not touch code of this job.
- `pnpm -s typecheck` (all workspaces): clean. apps/web `vitest run`: 461 files passed, 20 skipped; 5518 tests passed, 41 skipped. `packages/db` unit tests 14/14. `i18n:check`, `check:numbers`, `check:db-fences`, `check:legal-claims`: pass. eslint on the new test file: clean.
- `database.types.ts`: unchanged (no signature, table or column change in this job). `db:types:check` was NOT run (pinned CLI needs Docker).

## NOT verified

- No live ACL was read: the live `service_role` and `vamos_staff` privileges are assumed to match the lab's migration history (live ACL check L1 from `-W5.md` is still open).
- The Supabase Auth admin calls and the digest were not exercised after the revoke (their grants are untouched by design; one try each after applying, step 4).
- Which live functions carry PUBLIC EXECUTE (step 3).

## Deviations

- `FORCE ROW LEVEL SECURITY` on `booking_payments` not added (explained above).
- `is_test` stays on the staff allow-list because the test-unpaid route sets it; a guard trigger covers the money risk.
- The `app.*` helper functions and tables outside the six were not touched (service_role holds no function grant on `app`; other tables keep the default ALL: needed for `staff`, and not money).

## Conflicts with other chains

- None in TypeScript. `stripe_dispute_upsert` is re-created here on top of J7's version; chain A (settle, `stripe_event_*`) does not define it. If chain A changes `checkout_payment_settle` it is not affected by the new revokes (they only act on `service_role`).
- `checkout_abandon_unpaid`, `checkout_requote_cancel`, `purge_unpaid_booking`, `checkout_attach_payment`, `checkout_set_pay_link`, `checkout_cancel_unpaid` are re-created whole: a chain that also redefines one of them must be rebased on this body.

## Found, not fixed

- W5-21 (SQLSTATE clarity) as above.
- `checkout_expire_unpaid` (hourly sweep) and `checkout_cancel_unpaid` still lock the booking first; they only READ payment rows, so they cannot take part in the deadlock, but `checkout_cancel_unpaid` returns session ids read without a payment lock.
- Tables other than the six money ledger tables still grant `service_role` everything (Supabase default). The staff table must (invite). Others (`booking_events`, `price_snapshots`, `coupon_redemptions`, `booking_edit_requests`, `booking_notifications`, `bookings`, `booking_legs`, `customers`) are not used by the app through that key and could be narrowed in a follow-up once the live ACL is read.
- `booking_refunds` still has `INSERT` for no service_role after this migration, but the owner role and definer functions can insert (cap trigger from J7 applies to them).
