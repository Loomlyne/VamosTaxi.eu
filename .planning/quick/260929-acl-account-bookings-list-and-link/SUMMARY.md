# Quick 260929-acl Summary

Account bookings list no longer 500s for every customer (missing column grants), guest bookings link through a customers row created on demand, and a failed read shows an error state with TRY AGAIN instead of "no bookings".

## Commits
- 6b9acbbc migration, pgTAP, PLAN.md
- 2b197abe route hardening, error state on account and bookings, i18n en/de/fr/ar, vitest
- c9a64f9c Playwright spec

## What changed
- `packages/db/supabase/migrations/20260930180000_account_list_grants_and_customer_on_demand.sql`: `grant select (pay_link_sent_at, is_test) on public.bookings to authenticated` (idempotent, covers the live is_test drift); `app.ensure_customer_for_user(uuid)` (definer, empty search_path, no caller EXECUTE, same conflict rule as tg_link_customer_on_signup, confirmed e-mail only, erased rows never touched); `customer_claim_guest_bookings()` and `customer_id_for_user(uuid)` recreated to call it, signatures and grants unchanged. `customer_id_for_user` became volatile (it can insert). No existing migration edited.
- `route.ts`: list query wrapped; DB error returns 500 `{ error: "list_failed" }`, private, no-store. 401 unchanged.
- `account.dc.html`, `bookings.dc.html`: non-401 `!r.ok` shows "We could not load your bookings. Try again." with a TRY AGAIN button (design-system Button, md 44px, no icon tile tint, no glow); strings in `app/vamos-i18n-dict.js`.

## Checks
| Check | Result |
|---|---|
| From-zero replay (`supabase db reset --local`, scratch workdir, project vamos-taxi-acct, ports 563xx) | exit 0, new migration applied |
| Full pgTAP (`supabase test db --local`) | PASS, 73 files, 1660 tests, includes new account_list_grants_customer_on_demand (14) |
| `pnpm test:unit` | exit 0 (route vitest: 3 tests) |
| `pnpm typecheck`, `pnpm lint`, `pnpm lint:css` | exit 0 |
| `check:numbers`, `check:legal-claims`, `check:public-env`, `check:db-fences` | exit 0 |
| `pnpm i18n:check`, `pnpm db:seed:check` | exit 0 |
| Types: `gen types typescript --local --schema public` vs `packages/db/database.types.ts` | no diff |
| `pnpm --filter web build` (with lint) | exit 0 |
| Playwright (sandbox off, dev server, workers=1) new spec | 8 passed: 500 -> error state -> retry -> Booked on /account and /bookings, de/ar coverage, 390px no overflow, button height >= 44 |
| Playwright existing account-bookings-26-3 + account-i18n-coverage-26-3 | 18 passed |

## Deviations / notes
- The repo path for the database types is `packages/db/database.types.ts`, not `apps/web/lib/db/database.types.ts`.
- The Playwright "customer without a customers row sees Booked" case is proven at the database level (pgTAP: confirmed user with no row gets a row and the guest booking is linked with a booking.linked event) and in the browser with the list API mocked, matching the existing account specs. No real-auth browser run against a local stack was done.
- The debugger's stack was reset by the replay; I ran `supabase` from a scratch workdir in `$TMPDIR/acl-wd` (copied migrations and tests, project id vamos-taxi-acct, ports 563xx). Running two dev-server specs in parallel times out the 90 s beforeAll; use `--workers=1`.
- Live database not touched. The migration still has to be applied to the hosted project (verbatim, read back vs local) before deploy.

## Self-Check: PASSED
