# Hand-over: B5 follow-up 1, a mobile number reaches the dashboard Customers list

Branch `fix/account-phone-dashboard`, cut from `origin/main`, merged with `origin/main` 5d635c44 (and the planning commits after it). Job session, not the controller. Touches sign-in code, so a fresh reviewer reads it before ship. No migration. Worker only (`vamos`).

## Cause

The dashboard Customers list and detail read `public.customers.phone` (`apps/web/lib/ops/customers.ts`). Checkout's prefill reads the same column (`apps/web/app/api/checkout/me/route.ts:27`). Three gaps kept a customer's number out of it:

1. Sign-up. The number is stored in Supabase auth `user_metadata.phone` (`apps/web/lib/auth/run.ts:119`, password and link sign-up). The sign-up trigger copies only the name onto the customer row (`packages/db/supabase/migrations/20260828000001_customers_auth_link.sql:26`, `insert into public.customers (user_id, email, full_name)`). Proved on a real GoTrue sign-up on the local stack: metadata has the phone, the customer row phone is blank.
2. Account page. `update-profile {phone}` calls `supabase.auth.updateUser({ data })` only (`apps/web/lib/auth/run.ts:251-257` on main). It never wrote the customer row.
3. Dashboard read. A customer row wins the e-mail merge over the booking-sourced row (`apps/web/lib/ops/customers.ts:143`, `mergeCustomers`) and `c.phone` is `''` (lines 180, 196, 284 on main), so a row with no number of its own showed blank even when the customer's bookings carry one.

Finish your account (27.1) was already correct: `public.account_finish_done` copies the number onto the row (migration 20261007170000, live). Proved again in the local test.

## Fix (smallest correct change)

- New `apps/web/lib/auth/account-phone.ts`. It writes the signed-in customer's OWN row through `asCustomer` (role `authenticated`): the existing column grant `update (full_name, phone, company)` and the own-row policy `customers_update_own` (20260823000021) are the whole authority. Live has that grant (`has_column_privilege` true, read-only check). No migration, no definer function.
  - "replace": account page `update-profile {phone}` (`apps/web/app/api/auth/route.ts:304`, via a new optional `deps.storePhone` on `runUpdateProfile`). A failed row write answers `ok:false`, so the page says "Could not save" and the person tries again.
  - "if-empty": the first confirmed session after a sign-up that carried a number: `verify-code` (`route.ts:590`), `/api/auth/callback` POST (`callback/route.ts:217`) and the older PKCE GET (`callback/route.ts:103`). Only where the row's phone is `''`, so it never overwrites a number the owner or the person changed. Best effort: a failure is logged by reason only (no number, no address) and never blocks the sign-in. Dashboard host is skipped.
  - The number is validated again server-side (at most 32 characters, at least 9 digits) before it is stored.
  - Review fix: a customer deleted on the dashboard (erased) is never written. The customer role has no SELECT right on `customers.erased_at` (live: `has_column_privilege('authenticated','public.customers','erased_at','SELECT')` is false), so `and erased_at is null` in the update would fail with 42501 on every write (the local test asserts that refusal). The row is found first through `public.customer_id_for_user` (the lookup checkout uses, `asCheckout`): null for an erased, unconfirmed or unknown user, so nothing is written; otherwise the update targets that row id. A confirmed account with no row gets one made on demand by the same function. Costs one extra lookup per write.
- `apps/web/lib/ops/customers.ts`: a row with no number of its own shows the phone of the customer's latest booking (same e-mail or `customer_id`), in the list and in the detail. This is what a booking-only customer already showed.
- `scripts/db-access-fence-allowlist.json`: one entry for the new local test (raw client to seed the disposable stack).

No layout or copy change: the dashboard already has the Phone column and field in en/de/fr/ar (`app/ops/OpsCustomers.dc.html`). Nothing new is shown, so no four-language or 1440/1024/768/390 work is needed.

## Counts on live (read-only SELECTs on yaumjzvylngfjhtuffqs, 2026-10-02, no number printed)

- Auth users: 2. With a phone in metadata: 0. Metadata phone but a blank customer row: 0. Metadata phone without a customer row: 0.
- Customer rows (not erased): 2. Phone set: 0. Phone blank: 2.
- Customer rows with a blank phone whose bookings carry a phone: 2 of 2 (the dashboard list shows blank for both today; the read fix shows the booking phone).
- Distinct booking e-mails: 6, all with a phone; 2 of them have a customer row.
- So no backfill is needed today. Proposal only, if the owner and controller ever want accounts made before this fix (password sign-ups that never pass a confirm step again) copied:

      update public.customers c
         set phone = btrim(u.raw_user_meta_data ->> 'phone')
        from auth.users u
       where c.user_id = u.id and c.erased_at is null and c.phone = ''
         and length(btrim(u.raw_user_meta_data ->> 'phone')) <= 32
         and length(regexp_replace(coalesce(u.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g')) >= 9;

  Today it would change 0 rows. Not applied; never rewrite a live row without the owner.

## Checks on the final commit (merge of origin/main included)

- Unit, `pnpm exec vitest run lib/auth lib/ops lib/db app/api/auth` in apps/web: 129 files passed, 1400 tests passed (9 files skipped: the local-database ones without a port).
- New: `lib/auth/account-phone.test.ts` (unit), `app/api/auth/account-phone-route.test.ts` (7 cases through the real route handlers: update-profile, verify-code, callback POST).
- Local database through the Worker client options (`asCustomer`, `asSystem`, `asStaff`, login `vamos_edge`, `fetch_types:false`) on own stack `vamos-taxi-acp`, port 65422: `lib/auth/account-phone.local.test.ts`, 6 passed (the sixth: an erased customer is not written, a confirmed customer with no row gets one; a mutant without the lookup fails it). It proves: the row has no number after sign-up (the cause), the number shows in `loadCustomers` and `loadCustomerHistory` after the first confirmed session, a later sync never overwrites, the account-page replace shows on the dashboard, a customer cannot write another customer's row (RLS, 0 rows), the finish step number shows, and the booking-phone fallback (latest booking wins, a number of its own wins, another address lends nothing). Mutation check: with the old `customers.ts` the fallback test fails.
- Real GoTrue sign-up on the stack: `user_metadata.phone` present, customer row blank. Confirms the shape the sync reads.
- `pnpm --filter web run typecheck`: clean. eslint on the touched folders: clean. `node scripts/check-db-access-fences.mjs`: 8 of 8 passed.

## NOT verified

- No real Worker build with a real confirm click (tests/e2e-worker needs a built Worker, hook secret and its own stack; I did not run it). The hooks are proved through the real route handlers with Supabase replaced by recorders, and the SQL through the real Worker client on a real database.
- Not run by me: full gates (lint:css, i18n:check, check:numbers, check:legal-claims, check:public-env, seed:check, types:check, build, pgTAP, from-zero replay). No migration, no copy, no CSS changed; the controller runs the full set.
- Live is not checked after deploy (nothing deployed).
- Password sign-in does not sync. An account made before this fix with a number in metadata that only ever signs in by password keeps a blank row until it saves its number on the account page. Live has none. The proposal above covers it if wanted.

## Found, not fixed (outside this job)

- Name edits on the account page (`update-profile {firstName,lastName}`) also write only auth metadata, so the dashboard and checkout prefill keep the old name. Same class, same small fix (add `full_name` to the same own-row update). Waiting for the owner's word.
- The sign-up trigger could carry the number atomically instead (create or replace `tg_link_customer_on_signup`, insert path only). I did not choose it: it needs a migration number (my message to the controller was refused as "current session", so none was requested) and a trigger on `auth.users` that breaks every sign-up if it ever raises. If the controller prefers it, the Worker sync stays as is and the migration only makes the first confirmed session unnecessary.

## Migration

None. Safe on real paid bookings: no schema, no grant, no row changed. Deploy order: nothing to apply first.

## Owner UAT (live, after the controller deploys)

1. On vamostaxi.site open Sign up. Enter a new address, your name, the optional mobile number +41 79 000 11 22, tick the box, press Create account. Expected: the "check your e-mail" screen.
2. Open the mail, press the confirm button. Expected: you land in your account, signed in.
3. On dashboard.vamostaxi.site open Customers. Expected: the row for that address shows +41790001122 in the Phone column; opening the row shows the same number in the Phone field.
4. On vamostaxi.site open Account, find the mobile number, change it to +41 79 000 33 44 and save. Expected: it shows as saved. Reload Customers on the dashboard: the row shows +41 79 000 33 44.
5. On the dashboard open Customers and look at the two customers that already had bookings. Expected: each shows the phone of its latest booking instead of an empty Phone cell.
6. Sign in by e-mail link with another new address, finish the account with a mobile number. Expected: that number shows on the dashboard row (the 27.1 path, unchanged).
