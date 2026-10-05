# Hand-over: the purge detaches account choice records (migration 20261007300000)

Job session (work session, not control), 2026-10-05 11:51-13:30 +04. Started by the controller after its repo investigation (board line `fix/purge-agreement-records`, audit `2026-10-05-repo-investigation.md` U1).

- Branch `fix/purge-agreement-records`, cut from `origin/main` `fb3a72cd`; `origin/main` then moved to `3287fc69` (planning file only) and is merged in.
- Commits: `e669fc4b` migration + pgTAP, `f5e2c3b5` integration spec, `4070c401` merge of `origin/main` `3287fc69` (no conflict, one planning file), then this folder (tools, evidence, hand-over) on top.
- Migration number `20261007300000`, reserved for this job. No remote branch had a file with that number (checked 11:52).
- No Worker code changed. No live write. `database.types.ts` unchanged (same signatures).

## Was the customer path really broken? Yes.

Reproduced on the test lab: real Worker build, native local Supabase at 20261007290000, `guest_accounts_live` on as on live, function bodies md5-identical to live. Script `tools/repro.mjs before`, evidence `evidence-before/`.

| Step | What the customer did | What happened |
|---|---|---|
| R1-R2 | Home → /checkout, Economy, traveller, "Continue as guest" (preselected), PAY | 200, booking VT-26-0002, one account record on it |
| R3 | Back from Stripe (the session's `cancel_url`, `resume=<quote>`), picks Business | page restored, e-mail kept, new quote, `supersedes` = first booking |
| R4 | PAY again | **409 `quote_already_booked`**. Red alert under the total: **"This quote already has a booking."** PAY button stays, nothing else happens. No new booking; the first one stays pending with its record (`evidence-before/repro-before-R4-refused.png`) |
| R5 | Hourly purge on that booking (its session expired at the Stripe stand-in, `purge_candidates` lists it, then the sweep's own call `SET ROLE vamos_system; select purge_unpaid_booking(id, 'unpaid_expired')`) | **ERROR append-only table public.account_agreement_records: UPDATE is not permitted** (23001). Booking stays |

Only the class change was driven. A change of extra or voucher takes the same path (`intent.ts`: the selection fingerprint differs, so `supersedeBooking`), and every live checkout writes an agreement record since 26.5 (30 Sep), so it is refused the same way. Not tried: whether going back to the first selection, or starting again from the home page, lets the customer pay (the second would leave the old row pending for ever).

Live today (read-only, 11:55): `audit_log` has 6 purges, all `unpaid_expired`, the last 2026-09-29 23:42 UTC, and no `superseded` purge ever. VT-26-0748, VT-26-0749, VT-26-0751 are pending, eligible, 1 record each, 1 `failed` payment row each, 1 session id each.

## Root cause

- `packages/db/supabase/migrations/20261001100000_account_agreement_records.sql:33`: `booking_id ... references public.bookings (id) on delete set null`, and `:62` the `account_agreement_records_append_only` trigger (`tg_append_only`, before update or delete).
- `packages/db/supabase/migrations/20260930110000_purge_unpaid_booking.sql:71-95`: carve-out 3 of `tg_append_only` covers four tables; `:137` the purge detaches `consent_log` only; `:147` `delete from public.bookings` → the foreign key's `UPDATE ... SET booking_id = NULL` on the record → the trigger reaches `:104` and raises. The whole purge rolls back.
- Callers that turn it into the symptoms: `apps/web/lib/checkout/intent.ts:315-331` (`supersedeBooking` catches the error, refuses `quote_already_booked`), shown by `apps/web/app/[locale]/checkout/CheckoutForm.tsx:930`; `apps/web/lib/checkout/purge-unpaid.ts:68` and `:103` (sweep and expired-session webhook log `purge_unpaid_failed` and go on).

## The fix (one migration, one transaction)

`packages/db/supabase/migrations/20261007300000_purge_agreement_records.sql`

1. `public.tg_append_only()`: carve-out 3's `consent_log` branch becomes `tg_table_name in ('consent_log', 'account_agreement_records')`. So the purge may detach a record only under exactly the consent_log conditions: flag `vamos.purge_unpaid` on, `current_user` = owner of `purge_unpaid_booking`, the UPDATE changes only `booking_id` from the booking to NULL, and `app.purge_eligible(booking)` is true at that moment. Every other UPDATE, every DELETE and TRUNCATE still raise. Plus the comment "one of four" → "one of five".
2. `public.purge_unpaid_booking(uuid, text)`: one added line after the consent_log detach: `update public.account_agreement_records set booking_id = null where booking_id = p_booking_id;`. The record stays: it is the proof of the account choice.

Both bodies were restated from live. Read on live with `pg_get_functiondef` / `prosrc` (read-only, 11:53) and diffed against the latest migration that defines them (20260930110000): identical.

| Function | live `md5(prosrc)` before (= 20260930110000) | `md5(prosrc)` after this migration |
|---|---|---|
| `public.tg_append_only()` | `9aab16b19ab1d87d2db7ae93a532c8f8` | `ea538068a904dc7b5b974ce19ae67245` |
| `public.purge_unpaid_booking(uuid,text)` | `48fc6ff5bd0f1a3359fd740cd9169739` | `a4f2035fc00051ef13719d321872d1f6` |

Kept: signatures, `security definer` (purge) / invoker (trigger), `search_path = ''`, owner `postgres`. Revoke and grant restated as 20260930110000 has them. ACL read back on the lab after the apply, identical to live: purge `{postgres, service_role, vamos_system, vamos_checkout}=X`, trigger `{postgres, service_role}=X`. The purge's comment now says the consent and agreement rows are detached, never deleted. `app.purge_eligible` and `purge_candidates` are unchanged.

FK action: kept `on delete set null`, as consent_log. The purge detaches first, so the cascade finds no row. Any other delete of a booking that still has a record reaches the cascade after the booking row is gone: `app.purge_eligible` is then false and the trigger refuses it, so the link can never be dropped silently. A pgTAP case proves it. `restrict` would protect the record the same way and would need a constraint swap on live, so it is not done here.

Other delete paths checked: `purge_unpaid_booking` is the only function that deletes a booking (grep of all migrations). The re-pay path (`intent.ts` supersede) and the sweep/webhook all go through it. No TS change was needed.

## Tests

| Test | Before the migration | After |
|---|---|---|
| `packages/db/supabase/tests/purge_agreement_records.test.sql` (new, 25) | FAIL: stops at test 3, `append-only table public.account_agreement_records: UPDATE is not permitted` from `delete from public.bookings` inside the purge | PASS 25/25 |
| `apps/web/tests/integration/intent-supersede-db.spec.ts` (real `runCheckoutIntent`, real SQL, now writes the account record via `afterBooking` like the route) | FAIL: second Pay 409 (expected 200) | PASS |
| `apps/web/tests/integration/checkout-server-db.spec.ts` (untouched, purge paths) | not run | PASS 4/4 |
| Full lab pgTAP suite `lab.sh pgtap purge-agr` (files from the tree, 300000 included) | n/a | PASS, Files=106, Tests=2956 |

The 25 pgTAP cases: purge by `vamos_checkout` with `superseded` of a booking with two records (true, booking gone, both records kept with `booking_id` NULL, every other column identical, one audit line); purge by `vamos_system` with `unpaid_expired` (same); purge of a paid booking (false, record still attached). Refused with the flag on and as the purge's owner: another column, a detach that also changes another column, re-pointing to another booking, DELETE, TRUNCATE, detach of a non-eligible booking's record, and a booking delete that skips the detach (the SET NULL cascade). Refused with the flag off: the plain detach. The `price_snapshots` rule is unchanged. Then the booking that survived all refusals is purged.

The integration specs ran against the lab's own stack (`VAMOS_TEST_DB_PORT=45122`, marker role present, each run one rolled-back transaction) after a plain `supabase db reset` at 290000. The migration was then applied verbatim with `psql -f` and read back (md5 above) before the "after" runs.

## Reproduction after the fix

Lab reset with all migrations from the tree, lab seed back, `guest_accounts_live` on, same Workers. `tools/repro.mjs after`, evidence `evidence-after/`: 5/5 PASS.

- R4 PAY again after the change: **200**, new booking VT-26-0002. The first booking is gone (one `superseded` audit line). Its record is kept with `booking_id` NULL, and the new booking has its own record. Exactly one pending booking for the e-mail. (The page leaves for the Stripe stand-in, so there is no screenshot after PAY.)
- R5 hourly purge of the new booking after its session expired: `purge_unpaid_booking` → `t`. The booking is gone and both records for the e-mail are kept, none attached.

## Static gates (this worktree)

`pnpm typecheck` PASS. `pnpm lint` PASS (0 errors; 6 warnings, all in files this job did not touch). `pnpm check:db-fences` PASS (8/8). `pnpm check:numbers` PASS. `pnpm i18n:check` PASS. Full `test:unit` and the build gate were not run (shared Mac); the lab needed one Worker build. `db:types:check` was not run: no signature changed.

## What the first purge after the apply should do (live)

Before applying, read live `md5(prosrc)` of both functions again: they must still be `9aab16b1…` / `48fc6ff5…`. After the apply, read back `ea538068…` / `a4f2035f…`.

The next hourly sweep (`purgeExpiredUnpaid`, `purge_candidates('35 minutes')`) lists VT-26-0748, VT-26-0749 and VT-26-0751 (read-only check 13:10: those three only, one session id each). For each one whose Stripe session reads `expired` + `unpaid`:

- **Goes:** the `bookings` row, its 1 leg, 4 `booking_events`, 1 `booking_payments` row (`failed`), its price snapshot (+ legs), 1 `booking_access_tokens` row, and any `coupon_redemptions` (none now).
- **Stays:** its `account_agreement_records` row, now with `booking_id` NULL. Live `account_agreement_records` stays at 4 rows (3 detached, 1 attached to a booking that is not a candidate). Its `consent_log` rows (none) would be detached too.
- **Added:** one `audit_log` line per booking: `bookings` / `delete` / `system`, `before_value` = reference, created_at, deleted_at, reason `unpaid_expired`.
- If a session does not read expired + unpaid, that booking is skipped (logged `purge_unpaid_paid_session_seen` only if paid), as before.

Check after the first sweep (read-only): `purge_candidates('35 minutes')` returns nothing. Three new `unpaid_expired` audit lines. `select count(*) from account_agreement_records where booking_id is null` = 3. No `purge_unpaid_failed` in the Worker log.

## Not verified

- On live: nothing was applied. The first sweep's result above is expected, not seen.
- The expired-session webhook path (`purgeOnSessionExpired`) was not driven. It calls the same `purge_unpaid_booking`.
- The real hourly cron entry was not triggered: the lab's age filter is 35 minutes, so the sweep's SQL was called directly.
- Phone and tablet widths, and German/Arabic, were not run: no UI or copy changed.
- Whether the refused customer could pay by going back to the first selection or by starting again from home.

## Files

| File | What |
|---|---|
| `packages/db/supabase/migrations/20261007300000_purge_agreement_records.sql` | new migration (2 functions, one transaction) |
| `packages/db/supabase/tests/purge_agreement_records.test.sql` | new pgTAP, 25 |
| `apps/web/tests/integration/intent-supersede-db.spec.ts` | writes the account record on every Pay; checks the record survives detached |
| `.planning/quick/261005-purge-agreement-records/tools/repro.mjs` | lab reproduction, `before` / `after` |
| `.planning/quick/261005-purge-agreement-records/evidence-before/`, `evidence-after/` | results.json + screenshots |

Lab `purge-agr` was destroyed when the job ended.
