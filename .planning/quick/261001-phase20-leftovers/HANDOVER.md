# Phase 20 security leftovers (G7, G10, G11, G12, G28) — hand-over

**To:** the control session. **From:** the Phase 20 leftovers job thread, 2026-10-01 (13:32–14:20 UTC).
**Branch:** `claude/project-thread-cwny3q`, cut from origin/main `50a2a050`, fast-forwarded to `7aed613a`
(27.1 board note + `20261007170000_account_finish`, no file in common). Pushed (branch only).
No PR, no merge to main, no deploy, no hosted SQL. The only live access was one read-only SELECT
of the function grants and the RLS flag (13:4x UTC). The final commit is the one that adds this file.

Source: `reports/phase-20-recheck-2026-10-01.md` (project files). Owner signed the plan in the
thread at 13:59 UTC ("signed").

## What is built

| Item | Fix | Where |
|---|---|---|
| G7 | `alter table public.staff_daily_digests enable row level security` (live already has it on; a from-zero replay left it off) | `packages/db/supabase/migrations/20261007180000_phase20_grant_leftovers.sql` |
| G10 | EXECUTE off `vamos_edge` and `vamos_public` on `quote_rate_book`, `evaluate_coupon`, `quote_lock_deadline`, `quote_settings_version`; off `vamos_edge` (its only grantee) on `create_quote_snapshot` | same migration |
| G11 | EXECUTE off `vamos_guest` and `vamos_public` on `record_consent` | same migration |
| G12 | EXECUTE off `authenticated`, `vamos_checkout`, `vamos_system` on `extra_labels_read` | same migration |
| G28 | ticket id wrapped in `encodeURIComponent` in the PATCH URL | `app/ops/OpsSupportTicket.dc.html:602` |

Tests: new `packages/db/supabase/tests/phase20_grant_leftovers.test.sql` (40 tests: each removed
grant is gone, each kept grant is there, the real caller role still gets an answer and the removed
role gets 42501). `quote_snapshot_rpc.test.sql` ran its calls as `vamos_edge`; they now run as the
owner (comments only + the four `set local role vamos_edge` lines). `apps/web/tests/integration/
extras-charged-recorded-db.spec.ts` read the extra names as `vamos_checkout`; it now reads them as
`anon`, which is what the real code does.

Out of scope, untouched: G23 (CSP, owned by B7), G8/G9 (band tables, separate money job), B3.

## Why no grant the live site uses is removed

Live grants read 2026-10-01 match the migrations. The Worker logs in as `vamos_edge` and always
`SET LOCAL ROLE`s before a query (`packages/db/src/identity.ts`), and no role inherits another
(`inherit false` everywhere), so the login roles' own grants are never used:

- Quotes: `asQuote` → `anon` (`apps/web/lib/db/quote.ts:75-156`). anon keeps all four.
- Price editor: `asStaff` → `vamos_staff` (`lib/ops/rate-book.ts:841`, `api/staff/rate-book/route.ts:628`). Keeps `quote_rate_book` and `extra_labels_read`.
- `create_quote_snapshot`: only called inside `checkout_create_booking` (security definer, runs as owner, `20260827000003_checkout_rpc.sql:113`).
- Consent banner: `asAnon` → `anon` (`app/api/consent/route.ts`). anon and authenticated keep it.
- Checkout extra names: `asQuote` → `anon` (`lib/checkout/checkout-catalog.ts:21`). Note: a failed label read there is silent (names fall back to the code), which is why anon's grant is asserted by pgTAP.
- `vamos_public` (`publicSql`) only reads content_strings and reviews/vehicle_classes; it calls no function.

**Safe on real paid bookings:** grants and one RLS switch only; no function body, no table shape, no row changes.
**Order at ship:** migration only, no Worker change needed for G7–G12. G28 is a dashboard mock file
(ships with the next `vamos` deploy; no gateway change). Apply the migration verbatim, then read back:
the same SELECT as below should list no `vamos_edge`/`vamos_public`/`vamos_guest` row, and for
`extra_labels_read` only `anon` + `vamos_staff`.

```sql
select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'),('authenticated'),('vamos_edge'),('vamos_public'),('vamos_guest'),
  ('vamos_checkout'),('vamos_system'),('vamos_staff')) r(rolname)
where n.nspname = 'public' and p.proname in ('quote_rate_book','evaluate_coupon','quote_lock_deadline',
  'quote_settings_version','create_quote_snapshot','record_consent','extra_labels_read')
  and exists (select 1 from aclexplode(p.proacl) a
              where a.grantee = (select oid from pg_roles where rolname = r.rolname)
                and a.privilege_type = 'EXECUTE')
order by 1, 2;
```

Expected after apply: evaluate_coupon anon; extra_labels_read anon, vamos_staff; quote_lock_deadline
anon; quote_rate_book anon, vamos_staff; quote_settings_version anon; record_consent anon,
authenticated. `create_quote_snapshot` gone from the list.

## Checks (run once on `7aed613a` + this branch)

From-zero replay of every migration (ends `20261007180000`) plus seed on an own stack
(`vamos-taxi-p20`, ports 643xx): pass. Full pgTAP: **94 files, 2299 tests, all pass**.
Types regenerated with the pinned CLI (2.115.0): identical to `packages/db/database.types.ts`
(grants do not change types), so `db:types:check` holds.
typecheck, lint (0 errors, 6 old warnings), lint:css, i18n:check, check:legal-claims, check:numbers,
check:public-env, check:db-fences, db:seed:check: pass. test:unit: web 3508 + 5 skipped (358
files), emails 165, db 14: pass. build: pass.

## Not verified

- The integration spec `extras-charged-recorded-db.spec.ts` was edited (anon read) but not run (Playwright, not in CI).
- No local Worker build was run: no Worker code changed.
- G28 not clicked in a browser; the change is the same `encodeURIComponent` form used in `OpsDetail.dc.html`.

## Owner test steps (after the ship)

1. Open https://vamostaxi.site, enter a trip From/To/When, press for a price. Expected: the three classes show prices as before.
2. On /checkout, tick an extra. Expected: the extra shows its name (not a code like `child-seat`).
3. On the home page, accept or change cookies. Expected: no error; the choice sticks.
4. On dashboard.vamostaxi.site, open Prices. Expected: the price book and extra names load as before.
5. On the dashboard, open a support ticket, edit the phone or note, wait for the save. Expected: saved, no error strip.

## Left

A fresh review of this branch, then the ship: apply `20261007180000` on live verbatim, read back
with the SELECT above, deploy `vamos` for G28 (or let it ride the next deploy), delete this branch.
The local stack `vamos-taxi-p20` is already stopped and removed (`--no-backup`).
