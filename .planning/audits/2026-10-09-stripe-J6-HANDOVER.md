# J6 hand-over: intent abuse and ownership (payments review, 2026-10-09)

Branch `pay/j6-intent` (worktree `.claude/worktrees/pay-j6-intent`). **Stacked: base is `pay/j5-return-page`** (which contains J1). Builder: chain B. Findings: `2026-10-09-stripe-W2.md`, plus W1-12. Money change: a fresh reviewer must read it before it ships.

## What changed, per finding

New order in `runCheckoutIntent` (`lib/checkout/intent.ts`): rate limit and schema in the route, then **signed lock verified**, then quote-left (W2-14), account gate, trip match, **pickup re-check (W2-01)**, test-booking gate, price, **minimum total (W2-03)**, **per-quote press cap (W2-05)**, then any Stripe or booking work. A refusal before the cap does not use a press.

- **W2-01** Pickup re-checked at Pay on Postgres time (the lock clock): every leg must be ahead (`pickup_in_past`), the first leg must also be at least `min_advance_minutes` away when the published settings set one (`pickup_too_soon`; a null rule is no rule, as in the quote pipeline). The settings read is the Pay-time one already used for the snapshot policy. Not mirrored in `/api/checkout/price`: the screen still offers Pay; the press refuses with a message and opens the trip editor. New closed codes, 409, no `requote` action. Client messages `pickupPassed`, `pickupTooSoon`.
- **W2-02** `supersedeBooking` for a changed selection now needs `ownsBooking` (the request's `vt_manage` cookie). A non-owner gets `quote_already_booked`, nothing expired, nothing purged. The old test that passed with `ownsBooking: false` is fixed (owner set explicitly) and a non-owner test added.
- **W2-03 (U19)** `MIN_CHARGE_RAPPEN = 50` (the owner's signed 50 rappen). Under it (a total under 50 rappen, a coupon at or above the fare, a 100 percent coupon) the server answers `409 amount_below_minimum` before Stripe, before the press cap and before any booking row; no bare 500. The checkout also says so on PAY before any request (same message, `amountBelowMinimum`, with the support address). The coupon stays where it was; the customer is told to remove the voucher or write.
- **W2-04** New `loadLaunchFlagsStrict` (throws when the read fails or the rate book carries no usable `public_chf` or `vat_rate_bps`) wired into the intent route and `/api/checkout/price`; the display loader (`loadLaunchFlags`, answers 8.1 percent on any failure) is no longer on a charge path. Tests prove the two behave differently. Not done: reading the flags once per request for both the reprice gate and the charge (the gate still reads through `loadCheckoutReprice`, fail-closed through `public_chf`).
- **W2-05** Press cap moved after the lock check (see order). A stranger with only a quote id can no longer burn the owner's 5 presses. `checkout_pay_presses` has no TTL cleanup: with the lock verified first, rows exist only for real, signed quotes, but there is still no delete. Whether 5 presses per quote is for life or per hour is the owner's question; unchanged.
- **W2-06** Replayed booking (`checkout_create_booking` answers `replayed: true`): the token hash is stored and the cookie set only when the request's cookie already owns the booking; otherwise the page is returned with no cookie, no token, no detail write, no `afterBooking`.
- **W2-07** The contact (name, e-mail case-folded, phone) is part of the selection fingerprint. A corrected contact after Back is a changed selection: the owner's booking is replaced (new booking, new Stripe session with the new e-mail). Sessions opened before this deploy carry no contact in their fingerprint and take the same path once, a harmless one-time re-create. Decision taken (the review asked): supersede, not update in place.
- **W2-08** The false guarantee is removed by documentation, not made real: the engine version is the commit SHA, so a real `engine_changed` would void every open checkout at every deploy. Notes in `lib/quote/intent.ts` (`recompute_pin`) and `lib/checkout/reprice.ts` say what really guards the charge (HMAC lock, live rate-version check, `pricing_live`). **Owner decision still open:** should a deploy invalidate outstanding quotes? If yes, pass the live `ENGINE_VERSION` into `repriceFromLock`, and accept the voiding.
- **W2-12** Migration `20261009130000_checkout_replay_by_quote.sql`: replay lookup is `(idempotency_key, quote_id)`; a key that belongs to a booking of another quote raises `quote_already_booked` (SQLSTATE 23001, mapped by the Worker). Body copied byte for byte from `20260827000003` (its only definition) plus these two changes; ACL kept by `CREATE OR REPLACE`.
- **W2-14** `quoteWasLeft` runs after the lock verified (was before: a stranger with a quote id learned "left quote" 409 vs 404).
- **W2-15** The Pay answer carries `booking_id` and `reference` only for the request that owns the booking (the one that sets the cookie). Everyone else with quote + lock gets `url`, `expires_at`, `amount_rappen`. The browser only reads `url`.
- **W2-18, W1-12** `idempotency_key` for the web intent: `/^[A-Za-z0-9_-]{8,128}$/` (`IDEMPOTENCY_KEY_RE`). The Stripe key `<key>:after:<cs_… or uuid>` is at most 128 + 7 + about 100, under 255 (tested). A blank key can no longer reach `checkout_note_pay_press`. Every page sends a UUID (36). `OpsNewTrip` falls back to `Date.now()` (13 digits): passes.
- **W2-20** Server-side contact: name trimmed and non-blank, e-mail trimmed and checked, mobile 8 to 15 digits (the page's own `isMobileNumber`). The trimmed values are stored.
- **W2-21** Decided and documented, not enforced: the account gate is a UX step (a request without the `account` block is the plain guest flow). Comment in `account-gate.ts` and a pinning test. If the owner wants enforcement the block becomes required when guest accounts are on.

## Files

`lib/checkout/intent.ts`, `intent-schema.ts`, `errors.ts`, `checkout-charge.ts` (MIN_CHARGE_RAPPEN), `account-gate.ts` (comment), `reprice.ts` (comment), `lib/quote/intent.ts` (comment), `lib/db/quote.ts` (strict loader), `app/api/checkout/intent/route.ts`, `app/api/checkout/price/route.ts`, `app/[locale]/checkout/CheckoutForm.tsx`, i18n `en/de/fr/ar.json` (+3 keys: `pickupPassed`, `pickupTooSoon`, `amountBelowMinimum`; same pass, four languages), `packages/db/supabase/seed.sql` (generated, 2699 to 2702), `seed_idempotent.test.sql` (pin), migration and pgTAP below, tests.

## Migration (one)

`packages/db/supabase/migrations/20261009130000_checkout_replay_by_quote.sql` (J6 timestamp as assigned). Replaces `public.checkout_create_booking(...)` (15 arguments, unchanged signature and return type; the previous and only definition is `20260827000003`). pgTAP: `tests/checkout_rpc.test.sql` plan 39 to 41, new `(replay g)` and `(replay h)`. `database.types.ts` unchanged (signature unchanged).

## Tests and gates run

- `apps/web`: `pnpm exec tsc --noEmit -p .` clean; `pnpm exec vitest run`: 466 files passed, 5557 tests passed, 41 skipped (20 files skipped); eslint on `app`, `lib/checkout`, `lib/db`, `lib/quote`, `components/checkout` clean; `i18n:check`, `check:db-fences`, `check:numbers`, `check:legal-claims`, `db:seed:check` pass.
- New tests: `intent.test.ts` J6 block (past, too soon, null rule, under 50, coupon at/above fare, 100 percent, exactly 50, press cap and quote-left not asked for a forged lock, cap 429 stops before Stripe, left quote after lock, VAT read throws, strict loader wired in both routes, replay by non-owner and owner, contact fix replaces, same contact reuses, no booking-naming text for a non-owner) and a non-owner changed-selection test; `intent-schema.test.ts` (key and contact rules); `intent-limits.test.ts` (order proofs); `launch-flags-strict.test.ts`; `pay-refusal-messages.test.ts`; `account-gate.test.ts`. Existing tests that used 7-character keys or relied on `ownsBooking: false` replacing a booking were corrected.
- pgTAP (lab `pay-b`, native, own stack): full suite `Files=110, Tests=3065, Result: PASS`, including `checkout_rpc.test.sql` and J5's `guest_resume_quote.test.sql`.
- `lab.sh dbtests pay-b`: `packages/db test/local` 72 passed; `apps/web *.local.test.ts`: 6 passed (seeded) + 31 passed, **2 failed**, the same two in `return-settle-superseded.local.test.ts` that failed in J5 (fixture problem at the snapshot insert, not touched here).

## NOT verified

- No browser and no Worker run: the pickup, minimum-total and contact messages were not looked at on screen (four languages, RTL, 390 px). Message strings are tested for presence and shape only.
- No Stripe call (as ordered). The claim that Stripe's minimum for CHF is 50 rappen is the owner's decision, not checked against Stripe's current docs here (unverified).
- The migration was applied only to the local lab stack. `database.types.ts` needs no change; `db:types:check` not run.
- Behaviour with real concurrent presses (W2-06 replay, W2-16/17 races) is unit-tested with in-memory fakes only.

## Deviations

- W2-08: documented, not made real (reason above).
- W2-07: supersede, not in-place update (review's first option).
- The press cap sits after the account gate; it used to be first. The gate has its own limits (IP, e-mail, Turnstile).

## Found, not fixed

- W2-09 (policy read at Pay vs lock's settings version) and W2-10 (adaptive pricing): W2-10 is J8; W2-09 is an owner decision (which terms bind) and untouched.
- W2-11: held migration `20261007320000` (controller, after the 4242 payment per CLAUDE.local.md; with live mode that payment is the owner's own small real payment).
- W2-13 (Stripe `client_reference_id` and `metadata.booking_reference` carry the idempotency key, `booking_id` carries the quote id; `return-settle` reads them), W2-16 (simultaneous presses on an expired session can expire the winner's session), W2-17 (supersede race: a session created after the one-time list is not expired before the purge), W2-19 (`/api/checkout/price` and `/extras` unlimited and read `now()` before the lock check), W2-22 (limited coupons held by unpaid bookings), W2-23 and W2-24 (documentation-only), W2-25 (limiter fails open when the binding is missing; present in both wrangler blocks), W2-26 (price route accepts a body coupon the lock lacks), W2-27: not touched, none trivial and safe enough.
- `checkout_pay_presses` has no TTL or sweep (W2-05b, table growth now bounded by real quotes).
- The price route does not mirror the pickup check (W2-01's optional second half).
- `return-settle-superseded.local.test.ts` fails in its fixture on the lab (see J5).

## Deploy order for the controller

1. Apply `20261009130000_checkout_replay_by_quote.sql` verbatim, read back the function source (it must contain `b.idempotency_key = p_idempotency_key` and `and b.quote_id = p_quote_id`) and `has_function_privilege('vamos_checkout', 'public.checkout_create_booking(uuid,text,jsonb,text,text,jsonb,jsonb,bigint,text,bytea,timestamptz,text,text,rappen,uuid)', 'execute')` still true. The Worker works before and after (the old function simply keeps the old replay).
2. Deploy the Worker (J5 and J6 together if J5's migration `…120000` is also applied). A customer holding an open Stripe page from before the deploy who presses Pay again gets a new booking once (fingerprint change, W2-07); the old unpaid booking is superseded by its owner's cookie.
3. After deploy: PAY with a pickup in the past (a stale tab) shows the new message, not a 500; a fully discounted voucher shows the new message and creates no Stripe session (Stripe dashboard: no new session).
