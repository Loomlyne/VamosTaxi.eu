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

---

# 2026-10 check — what changed since 2026-09-19 (read at af93fc8e, 2026-09-29)

## New or changed server surface (26.3, `git diff cff97a0e af93fc8e`)

| Route | State | First questions for the check |
|---|---|---|
| `POST /api/checkout/intent` | changed | Origin checked; **no per-visitor limit or Turnstile found** (lead, not yet a finding): can a bot open Stripe sessions and booking rows without limit? Is the total always the server's reprice? |
| `/api/checkout/price` | new | limiter present; same questions as `/api/quote` |
| `/api/checkout/resume` | new | who can read a checkout by its link; what personal data comes back |
| `/api/checkout/me` | new | cookie-bound; no other user's data |
| `/api/checkout/return` | changed | can the return URL mark a booking paid without the webhook? |
| `/api/checkout/pay-link/open` | changed | token entropy, expiry, one booking per token |
| `/api/staff/bookings/[id]/take-card`, `/extra-pay` | new | staff role + Origin; amount from the server only |
| removed: `/api/checkout/abandon`, `invite/[ref]`, `pay-link` (public), `requote` | deleted | confirm 404 on live |
| `middleware.ts`, `worker.ts` | changed | language cookie (D-47), hourly purge/resend in `scheduled` |

## New database objects (8 migrations 20260930100000…170000)

`checkout_payment_settle` (new signature), `purge_unpaid_booking` + carve-out in the append-only
trigger, `customer_claim_guest_bookings` + event `booking.linked`, `checkout_booking_details`
setter, `extra_labels` (RLS on) with staff upsert, `checkout_resume_read`,
`confirmation_payload`, `checkout_pay_link_lines(bytea)`. For each: SECURITY DEFINER?
`search_path` empty? EXECUTE granted to whom? Can a guest claim someone else's booking by
e-mail? Can the purge carve-out delete a paid booking?

## Other new surface

Workers AI translation of extra names (cost and prompt input from staff only?), Stripe webhook
now also `checkout.session.expired`, TWINT switch, CSP with Stripe.js hosts removed.

## Regression list

The fixed K-rows of `20-05-PLAN.md` (K16…K83) and SEC-01…SEC-09: headers, cookies, CSRF,
no-store, noindex, error bodies without SQL detail. Re-check each against live after 26.3.
