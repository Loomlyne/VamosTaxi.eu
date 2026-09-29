# Hand-over — account bookings list and guest linking (quick task 260929-acl)

**Branch:** `fix/26.3-account-link` in `/Users/koss/Developer/vamos-wt/fix-26.3-followups`, cut from origin/main `af93fc8e`. Final commit: the commit adding this file (`git log -1`). Folder clean. No push, no PR, no deploy, no live writes (live read-only selects only).

## Root cause (owner comment 1)
1. **Every customer's bookings list has failed since 2026-09-27.** GET /api/account/bookings (`apps/web/app/api/account/bookings/route.ts:39,48`, added by commit 1de126f2, #57) selects `bookings.pay_link_sent_at`; role `authenticated` has no column grant on it → 42501 → 500; `account.dc.html:546-549` and `bookings.dc.html:375-378` showed that as "no bookings". Live also lacks the `is_test` grant (read-only `has_column_privilege` = false), unlike local migrations — drift.
2. **The owner's only live auth user (admin, created 2026-08-31) has no `customers` row**, so `customer_claim_guest_bookings()` and `customer_id_for_user()` link nothing → VT-26-0736/0737/0738 have `customer_id` null. The signup trigger works locally; why the live row is missing is not provable from live data.

## Fix
- Migration `20260930180000_account_list_grants_and_customer_on_demand.sql`: `grant select (pay_link_sent_at, is_test) on public.bookings to authenticated`; new `app.ensure_customer_for_user(uuid)` (same conflict rule as `tg_link_customer_on_signup`; confirmed e-mail only; never touches erased customers); `customer_claim_guest_bookings()` and `customer_id_for_user(uuid)` recreated to call it (signatures and grants unchanged; `customer_id_for_user` is now volatile because it may insert).
- Route: DB error → 500 `{ error: "list_failed" }`, private no-store. Account and bookings pages: "We could not load your bookings. Try again." + TRY AGAIN, en/de/fr/ar.
- Owner decision (question form, 2026-09-29): **no one-off backfill**; the record is created on demand when he opens his account.

## Checks (details in SUMMARY.md)
From-zero replay exit 0; full pgTAP 73 files / 1660 tests PASS (14 new); pnpm test:unit, typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, db:seed:check, types (no diff vs `packages/db/database.types.ts`), `pnpm --filter web build` with lint — all pass. Playwright: new spec 8/8, existing account specs 18/18 (`--workers=1`).

## Not verified
- No real signed-in browser session: the "no customers row → booking linked and shown" case is proven in pgTAP; the browser spec mocks the list API.
- Why the live customers row was missing (trigger order vs user creation) — not provable.

## Migration safety on real paid bookings
One file, `20260930180000_…`: two column grants (additive), one new function, two function bodies replaced. No data changed by the migration itself. On first open of his account the owner's customers row is created and the three bookings get `customer_id` + a `booking.linked` event each (intended). Apply file-verbatim with the Worker deploy; read back and compare.

## Settings
None new.

## Owner UAT (phone first)
1. After deploy, on your phone open https://vamostaxi.site, sign in, open your account. Expected: VT-26-0738 is listed as "Booked" (and 0736, 0737 as past/booked); no "no bookings".
2. Open "My bookings". Expected: the same bookings.
3. Control session reads (read-only): VT-26-0736/0737/0738 now have a `customer_id`; one `booking.linked` event each; your user has a `customers` row.
4. Book a new trip while signed in, pay with 4242 4242 4242 4242. Expected: it appears in your account right after "Booked"; `customer_id` set on the booking.
