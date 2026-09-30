# 20-06 findings — security check of the changed app

**Checked:** 2026-09-30 (+04), 03:00–03:45.
**Code:** branch `gsd/phase-20-security-check` = origin/main `49c51749`. Its app code is identical to
`e27014c1` (no code commit since; only planning notes).
**Live:** Worker `vamos` version `a55b2c19` (deployed 2026-09-29 22:17 UTC) = `e27014c1`, serving
vamostaxi.site and dashboard.vamostaxi.site. Database `yaumjzvylngfjhtuffqs`, read-only selects only.
**Not on main, not checked:** 26.4.2, 26.5, 27 (still on their branches). They are checked before 20-09.

**Method (D-18):** two blind Opus code reviewers (reports A1–A29 and B1–B23, merged below), Supabase
security and performance advisors, grant and function readback on live, passive GETs of both hosts,
one TEST SECURITY booking with tamper replays from the page.

## Summary

| id | surface | serious (D-17) | one line | proof | proposed fix | files (who may touch) |
|---|---|---|---|---|---|---|
| F1 | Guest tokens: a pay-link token also works as a manage token | **Yes — another person's data and booking** | Whoever holds a pay link (a company payer, a forwarded e-mail) can open `/manage-booking` with it for up to 24 h, even after payment: read the traveller's name, e-mail, phone, route and flight, the driver's first name, phone and plate, and cancel or change the booking. | Live readback: of 15 functions that look up `booking_access_tokens`, only `checkout_pay_link_by_hash`, `_lines`, `_state` filter `purpose = 'pay'`; `manage_booking_read`, `manage_booking_cancel`, `manage_booking_extras`, `booking_has_manage_token` (guest RLS), `guest_confirmation_read`, `checkout_resume_read`, `submit_review` filter nothing. Live body of `manage_booking_extras`: `where t.token_hash = p_token_hash and t.revoked_at is null and t.expires_at > now()`. Live tokens: 52 `manage` (all active), 8 `pay` (0 active today). Route: `apps/web/lib/checkout/manage-token.ts:68` reads `?token=` for any token; `app/api/manage/booking/route.ts:116,146`. Reviewers A2, B1 agree. Not probed live: needs a staff-sent pay link. | New migration: add `and t.purpose = 'manage'` to every manage lookup and the guest RLS helper; revoke the `pay` token when the booking settles. pgTAP: a pay token gets nothing from each function. | New migration only. Needs a number from the control session. |
| F2 | Dashboard support ticket: PDF preview runs pdf.js 3.11.174 from unpkg | **Yes — act as staff** | Anyone can e-mail a PDF to info@vamostaxi.site. When staff open it in the dashboard, pdf.js 3.11.174 (CVE-2024-4367: a crafted font runs its own script when `isEvalSupported` is on, the default) runs it on dashboard.vamostaxi.site, whose CSP allows `unsafe-eval`. The script then acts with the admin's session. The script is loaded without an integrity pin. | `app/ops/OpsSupportTicket.dc.html:658` `'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'`, `:724` `lib.getDocument({ data: data })` (no `isEvalSupported:false`); `apps/web/lib/ops/ticket-inbound-files.ts:15` accepts `application/pdf`; live dashboard CSP `script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com …`. Reviewer A1 (B did not cover it). Not exploited live (no PDF sent). | `getDocument({ data, isEvalSupported: false })` (the vendor's own mitigation) plus SRI on both pdf.js files; later move to pdf.js ≥ 4.2.67 served from our own host. Test: source check that the option and the integrity are present. | `app/ops/OpsSupportTicket.dc.html` only. No other session's branch changes it (checked 26.4.2, 26.5, 27, 26.0, 26.2 folders). |
| F3 | `POST /api/checkout/intent` has no rate limit and no Turnstile | **Yes — costs without limit** | One valid quote (it lives 24 h) lets a script create a new Stripe Checkout Session plus a booking insert and delete on every call by changing class or extras. That uses up Stripe's API rate budget, which real payers share. No e-mail is sent. | `app/api/checkout/intent/route.ts:60-62` Origin check only, no limiter in the file; `QUOTE_RATE_LIMITER` is used by quote, reprice, price, geo, flight, contact, consent, reviews, not intent. Live: intent without Origin → 403 `csrf`; with the page's Origin → 200. Not flooded live (owner rule). Reviewers A3, B2 agree. | Wire the existing quote limiter (per IP) into intent and cap Pay presses per quote (e.g. 5). Test: the 6th press on one quote is refused. | `apps/web/app/api/checkout/intent/route.ts`, `lib/checkout/intent.ts` — **26.5 and 26.4.2 edit checkout.** Route through the control session. |
| F4 | Bookings matched by the e-mail in the sign-in token | No (owner confirmed "Confirm email" is ON, 2026-09-30) | `bookings_select_own` and `customer_booking_extras` trust the e-mail inside the sign-in token and never check that it was confirmed; no status filter either (26.5 plan 10 adds one). Safe only while Supabase refuses to sign in an unconfirmed e-mail. If "Confirm email" were off, anyone could sign up with a customer's address and read their bookings and driver phone. | Live policy text read back. Live auth users: 2, both confirmed, 0 unconfirmed, 0 anonymous, 0 non-e-mail identities. No code path creates a pre-confirmed user (A19, B5). The hosted switch cannot be read from code or SQL. | Owner reads one switch in the Supabase dashboard. Defence in depth: require `email_confirmed_at` inside the policy and `customer_booking_extras`. | Policy is edited by 26.5 plan 10 → control session. |
| F5 | `customer_confirmation_read(p_reference, p_customer_id)` trusts the caller's customer id | No | Granted to `authenticated`; returns the full confirmation of any booking whose reference and customer id match. The caller picks the customer id instead of the function deriving it from the session. Needs another customer's random UUID, which no route reveals, so not reachable today. Old function (2026-09-24), flagged new by this check. | Live `proacl` `authenticated=X`; body `where b.reference = p_reference and b.customer_id = p_customer_id`. Advisor lint 0029. | Derive the customer from `auth.uid()` inside the function. | New migration → control session. |
| F6 | `GET /api/checkout/return` has no limit | No | Any `cs_test_…`-shaped id makes one Stripe read. Unlimited Stripe reads with made-up ids. Settle stays safe. | Live: fake id → 303 `pay=unknown`; `lib/checkout/return-settle.ts:12,68` (B3). | Per-IP limiter. | Checkout route → control session. |
| F7 | `POST /api/checkout/lock-expire` has no ownership check | No | Whoever knows a traveller's quote id (it is in the `?resume=` URL after Stripe) can expire their open Stripe session; the expired-session hook then deletes the unpaid booking. No money effect. | `app/api/checkout/lock-expire/route.ts:3-4` (B9). | Require the `vt_manage` cookie that owns the booking. | Checkout → control session. |
| F8 | Lock holder gets a manage cookie for an open unpaid booking | No | Calling intent again with the same quote and lock issues a fresh manage token for the existing booking. The lock lives only in the traveller's browser, never in a URL. | `lib/checkout/intent.ts:571` (A8). | Require ownership before re-issuing. | Checkout → control session. |
| F9 | Purge race | No | If a Stripe session is attached between the hourly candidate read and the delete, the booking is deleted; a payment on that session is then refunded automatically (`booking_missing`). Never money kept without a booking. | `lib/checkout/purge-unpaid.ts:41-64`, live `purge_eligible` body (no open-session check), A16, B7. | Pass the session list into `purge_unpaid_booking` and compare under the lock. | Migration + lib → control session. |
| F10 | Hourly confirmation resend has no date cut-off and no test filter | No | Its first runs could mail old or test bookings; always to the booking's own address. | `20260930100000_confirmation_mail_definer.sql:776-791` (B6). | Add a cut-off and `not is_test`. | Migration → control session. |
| F11 | Automatic refunds refuse only `sk_live_` | No (go-live blocker, known) | A restricted live key `rk_live_` passes the guard. Must be lifted on purpose before launch (on the board, Phase 19). | `lib/lifecycle/paid-cancel.ts:115-117` (A21). | One helper `^(sk|rk)_live_`. | Phase 19. |
| F12 | Sign-in link login CSRF | No | An attacker can sign a visitor into the attacker's account with the attacker's own link; a booking made next lands in the attacker's account. Needs the victim to click. | `app/api/auth/callback/route.ts:72-76` (B14). | Bind the callback to a cookie set when the link was requested. | Auth → owner question. |
| F13 | CSP allows all of unpkg.com plus `unsafe-eval` | No (D-20 accepted) | React, ReactDOM, Babel are pinned by SRI (all four `support.js` copies identical). Any other unpkg package would also be allowed by the CSP. | `lib/security/headers.ts:20`, `app/support.js:1143-1152` (A28). | Serve the three libraries from our own host and drop unpkg from the CSP. | Owner question. |
| F14 | Hardening, one line each | No | Empty `QUOTE_LOCK_SECRET` fails closed only implicitly (A5); settle does not re-check amount and currency (A10); `staff_extra_label_upsert` relies on the route for admin (B22); purge owner is `postgres` (B21); `/dev` 404 repeats every security header twice. | as cited | — | 26.2 / later |

Owner decisions already on record, not findings: admin sign-in without TOTP when no authenticator
app is enrolled (quick 260928-wg9); `SUPABASE_SERVICE_ROLE_KEY` on the Worker (26.5 D-15).

## Leads from the control session

| # | Lead | Verdict | Evidence |
|---|---|---|---|
| 1 | `bookings_select_own` trusts the token e-mail, no status filter | **Confirmed**, safe only while "Confirm email" is on → F4 | policy readback; users 2/2 confirmed |
| 2 | "already has an account" reveals customers (26.5) | Not on main. Checked when 26.5 ships. | — |
| 3 | Service-role key on the public Worker | **Dismissed.** Read only by `lib/supabase/service.ts` (daily digest) and the admin-only invite route; not in `next.config` env, no `NEXT_PUBLIC_` form, no client import, never logged or returned. | A20, B17 |
| 4 | Intent: no limit, no Turnstile | **Confirmed** → F3 | route line 60-62 |
| 5 | Refunds refuse `sk_live_` | **Confirmed, known** → F11. The customer's cancel still goes through, marked refund failed, refund-failed mails go out, staff see `stripe-test-only`. | A21 |
| 6 | Pay token can read the driver's phone | **Confirmed, and wider** → F1 (read, cancel, change, review) | live function bodies |
| 7 | Purge vs a payment complete at Stripe but not recorded | **Dismissed.** A booking is deleted only when Stripe itself reports every one of its sessions `expired` and `unpaid`; an empty list or a complete/paid session means skip. Residual race → F9 (refund, not loss). | `purge-unpaid.ts:41-64`, `stripe.ts:325-338` |
| 8 | Mock pages load React/ReactDOM/Babel from unpkg | **Pinned** by SRI sha384. The unpinned unpkg load is the dashboard's pdf.js → F2. | A28 |

## Database readback (live, read-only)

- Every SECURITY DEFINER function in `public` and `app` has `search_path=""`.
- EXECUTE for `anon`/`authenticated`/PUBLIC: the accepted list of 2026-09-19 (quote RPCs, `evaluate_coupon`,
  `record_consent`, `checkout_cancel_unpaid`, `staff_claim_invite`, `is_staff`) plus new
  `extra_labels_read` (public labels, fine), `customer_booking_extras` (F4), `customer_claim_guest_bookings`
  (requires a confirmed e-mail, fine), `customer_confirmation_read` (F5).
- Reviewer B's open question B4 (anon EXECUTE on the functions of migrations 100000–150000) is
  **answered no**: on live they are granted to `vamos_checkout`/`vamos_system` only.
- Advisors, security: 4 tables with RLS and no policy (fail-closed; new: `extra_labels`, read through a
  definer function), the definer functions above. Performance: 48 unindexed foreign keys, 21 unused
  indexes, 1 duplicate index on `distance_bands`, 2 permissive read policies on `reviews` — for 26.2/19.

## Live probes

| Probe | Result |
|---|---|
| Quote with raw coordinates, no address search | 403 `retrieve_without_suggest` — refused |
| `/api/checkout/price` with the signed lock edited to CHF 1.00 | 409 `quote_expired` — refused; the untouched lock still prices (200) |
| Intent with the lock edited to CHF 1.00 | 404 `quote_not_found` — refused, no booking |
| Intent with an extra `amount_rappen` or `charged_rappen` field | 400 `invalid_request` — refused |
| Intent replayed with the same idempotency key | same booking VT-26-0745, same session — no duplicate |
| Intent without Origin / with `https://evil.example` | 403 `csrf` |
| Return URL with the real unpaid session, with another reference, with a fake id | 303 back to checkout `pay=unpaid` / `pay=unknown`; booking stays `pending`, payment `requires_payment` (read back) |
| `/api/checkout/resume` for the test quote without its cookie | `{"state":"none"}` |
| `/confirmation/VT-26-0745` without cookie | no booking data (only the company's footer phone) |
| `/api/checkout/me` without cookie | `{"signed_in":false}` |

## Regression list (2026-09-19, SEC-01…09, K16…K100) on live

All hold: HSTS, CSP, `X-Frame-Options: DENY`, nosniff, Referrer and Permissions policy on both hosts;
`vamos_dash` is `Secure; HttpOnly; SameSite=lax`; no `X-Powered-By`; `/.well-known/security.txt` 200;
`vamos.koussayzayeni.workers.dev` 404; `/api/dev/db-smoke`, `/.env`, `/dev` 404; removed routes
`abandon`, `requote`, public `pay-link`, `invite/[ref]` 404; personal JSON `private, no-store`;
`robots.txt` disallows `/api`, `/checkout`, `/confirmation`, `/account`, `/manage-booking`, `/review`,
`/sitemap`; `X-Robots-Tag: noindex` on auth, checkout, confirmation, manage pages; staff and account
APIs 401 without a session; dashboard `/` and `/dashboard` 308 to `/login`.

## TEST SECURITY bookings (max 10)

| # | Reference | Paid | Contact | Left for |
|---|---|---|---|---|
| 1 | VT-26-0745 | No (Stripe page reached, not paid) | TEST SECURITY, koussay.zayani0+sec1@gmail.com | the hourly clean-up |

## Hand-off

- Serious → 20-07: F1, F2, F3. F4: owner read "Confirm email" = ON (question form, 2026-09-30); defence in depth goes with 26.5 plan 10.
- The rest → 20-08, one question each to the owner.

## Owner decisions (20-08), question form and chat, 2026-09-30

| id | Decision | Built by |
|---|---|---|
| F1 | Fix: a pay link must not open the booking. | Phase 20, migration `20261005100000` |
| F2 | Dashboard Support becomes read-only. No reply box, no files shown in the dashboard (file names only); one button opens the admin's own e-mail to read the file and answer. The PDF viewer is removed completely. Replaces commit `6480ec08` (kept until the rework lands). | Phase 20 |
| F3 | Already built on the 26.5 branch (`2f82572a`, `9dc9b97d`: 8 per minute per IP, 5 presses per price, pgTAP + unit tests). Live with the 26.5 ship. Re-probed in 20-09. | 26.5 |
| F4 | Keep. "Confirm email" is on. | — |
| F5 | Fix: the function works out the customer itself. | Phase 20, migration |
| F6 | Fix: limit on the return route. | routing asked |
| F7 | Accepted: an unfinished booking that is left is cancelled anyway; the customer books again. | — |
| F8 | Fix: ownership before a new manage token is issued. | routing asked (intent.ts is 26.5's) |
| F9 | Keep 31 minutes. Accepted: the rare gap ends in an automatic refund. | — |
| F10 | Fix: date cut-off and no test bookings in the resend job. | Phase 20, migration |
| F11 | Refunds are made by hand: the customer's cancel goes through, the booking shows "Refund due", the admin presses Refund on the dashboard. Nothing goes to Stripe without his click. | routing asked (touches /cancellation wording) |
| F12 | Fix with a confirm screen: the link opens "Sign in as <e-mail>?" with one button; works on any device. | routing asked (new screen, design first) |
| F13 | Proposed: serve React, ReactDOM and Babel from our own host and remove unpkg.com from the allowed script hosts. | routing asked (shared `support.js`, CSP) |
| F14 | Fix them all. | Phase 20 for the database items; routing asked for the rest |
