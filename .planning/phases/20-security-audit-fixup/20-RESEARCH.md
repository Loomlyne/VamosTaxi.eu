# Phase 20 research — 2026-09-19 audit evidence

No booking POSTs. ZAP spider + passive only. SQL was catalog/read-only.

## Live HTTP

| URL | Result |
|-----|--------|
| GET https://vamostaxi.site | HSTS, CSP, XFO DENY, robots Disallow `/api` `/ops` `/checkout` |
| GET /.env .git /api/dev/db-smoke | 404 |
| GET /dev /ops /app/home | 404, **X-Powered-By: Next.js** |
| GET /.well-known/security.txt | 404, X-Powered-By Next.js |
| GET /api/staff/me | 401 (withStaff works) |
| GET /api/photos/upload | 405 (POST only) |
| GET /api/quote | 200 `{ok, classes, fixed_routes}` — no coupon codes in this JSON |
| GET dashboard.vamostaxi.site/ | 308 → /login |
| GET dashboard.vamostaxi.site/login | 200 ops-login HTML. **No HSTS, no CSP, no XFO.** Set-Cookie `vamos_dash=1; Path=/; Secure; SameSite=lax` (**not HttpOnly**) |
| GET dashboard.vamostaxi.site/dashboard | 308 → /login (anon) |
| GET vamos.koussayzayeni.workers.dev/ | 200 **same public site** (CSP/HSTS present) |
| ZAP | 0 High/Critical. Medium: CSP unsafe-inline/eval. Low: powered-by, cookie flags. |

## Why dashboard drops headers

`middleware.ts` `serveOpsDc` builds `new Headers()`, sets only content-type + cache-control. Next `headers()` in `next.config.ts` never runs on that response.

## Database grants (aclexplode, live)

anon+authenticated EXECUTE:

- `create_quote_snapshot` — **P0**. Function inserts `price_snapshots` using caller-supplied `p_total_rappen` / lines. Charge trigger later requires payment to match snapshot total. If a client reaches PostgREST with the anon key they can mint junk/underpriced snapshots. Checkout booking RPC is **not** granted to anon (Worker/Hyperdrive only). Still revoke.
- `evaluate_coupon`, `quote_rate_book` (full book including coupons table), `quote_lock_deadline`, `quote_settings_version`, `record_consent`, `submit_contact_message`

PUBLIC+anon+authenticated EXECUTE: `rls_auto_enable` (event-trigger helper; calling as SQL is a no-op/error, still revoke).

authenticated: `checkout_cancel_unpaid` — body checks JWT email vs `contact_email`. Not IDOR.

vamos_guest: `manage_booking_read/cancel`, `submit_review`, `record_consent`.

No table GRANTs to anon/authenticated/PUBLIC in `information_schema.role_table_grants` (RLS + revoke default).

RLS on, 0 policies (fail-closed): `booking_reference_counters`, `contact_delivery_outbox`, `staff_daily_digests`.

View: `settings_public` (SECURITY DEFINER, intentional for `vamos_public`).

Advisors also: leaked-password protection disabled; 46 unindexed FKs; duplicate index on `distance_bands`.

## Code

- `requireStaffClaims`: MFA paused (comment 2026-09-01). `dashboardHostMiddleware` checks role, not AAL2. `opsStaffGate` still checks AAL2 but public host never serves `/ops`.
- `staffOriginAllowed`: missing Origin = allow. `*.workers.dev` + substring `ops-changes` is broader than this account.
- `/api/photos/upload` uses `requireStaffClaims` but **not** Origin check. `recordId` rejects `/` only; `buildPhotoKey` interpolates it.
- `/api/reviews/photo` uses manage-token or JWT; MIME sniff; UUID booking id.
- Auth callback `next` is allowlisted to `PUBLIC_ROUTES` (no open redirect).
- Stripe webhook: `constructEventAsync`. Health: timing-safe header. db-smoke: hard 404.
- `create_quote_snapshot` + `tg_snapshot_lines_reconcile` + `tg_payment_matches_snapshot` protect Worker checkout **if** the snapshot was minted by the Worker reprice path (`intent.ts` `checkIntentAgainstLock`).

## Not bugs (do not "fix")

- `pk_test_` publishable key on Worker `vamos` — live Stripe is owner-gated.
- CSP eval — DC Babel.
- GET /api/quote public classes — product.
- Charge currency CHF — product.
