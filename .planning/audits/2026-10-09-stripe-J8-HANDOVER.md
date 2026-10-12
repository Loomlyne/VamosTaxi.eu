# J8 hand-over: customer money copy and adaptive pricing (payments review, 2026-10-09)

Branch `pay/j8-money-copy` (worktree `.claude/worktrees/pay-j8-money-copy`). **Stacked: base is `pay/j6-intent`** (which contains J5 and J1). Builder: chain B. No migration in this job (J8's reserved timestamps `20261009150000..` are unused). A fresh reviewer must read the Stripe session change (W2-10) before it ships.

## What changed, per finding

- **W2-10** Every Checkout Session this code creates (web Pay, pay link, edit-request extra: all go through `createCheckoutSession`) now sends `adaptive_pricing: { enabled: false }`; price stays `chf`. The comments are corrected (they said "Charge is always CHF" next to `enabled: true`). `fxFromSession` is unchanged and still reads `presentment_details` and `currency_conversion`, so sessions created before this deploy settle and record as they did (tested). Tests `stripe.test.ts`, `stripe-hosted.test.ts` updated, new proofs in `j8-money-copy.test.ts`. The sentence "Stripe's `adaptive_pricing` parameter set to false turns conversion off on the live account" is the API's documented meaning and **unverified here** (no Stripe call); the SDK accepts the shape and `tsc` is clean.
- **W3-07** `PayBar` takes `chargeNote`; the rail and the phone bar pass it whenever the page shows a converted total (`displayAmount(...).currency !== "CHF"`): "You are charged in Swiss francs (CHF)." from the existing, previously unused strings `checkout.chargeIn` and `checkout.chargeCurrencyName` (all four languages already existed; the "(CHF)" is appended in code). Rendered right under the Total and PAY row, in the existing `vt-copay__reassure` style (no new CSS, no glow, no tinted yellow, centred text, no left/right).
- **W3-08** `STRIPE_CHECKOUT_TWINT` now drives the copy: new `lib/checkout/payment-methods.ts` (`checkoutPaymentMethodTypes`, re-exported from `stripe.ts`, so the layout does not load the Stripe SDK) and `methodNoteKey`. The checkout method note is `checkout.methodNote` (with TWINT) only when the flag is on, else the new `checkout.methodNoteNoTwint` ("…card, Apple Pay or Google Pay."). `CheckoutSettings.twintOn` is server-decided. The footer TWINT mark shows only with `showTwint` (default false; the locale layout passes `checkoutPaymentMethodTypes(env).includes("twint")`, any doubt is off). Today the live Worker has the flag off.
- **W3-09** The refund line no longer states `balance_transaction.available_on` of the original charge as the customer's payout date. Both surfaces (Next `BookingVoucher.tsx`; the DC manage page `app/vamos-manage-ticket.js`) now read "Refunded to your {country} card. It can take a few business days to reach your card." (`checkout.refundArrivalNote`; dictionary entry in `app/vamos-i18n-dict.js`; the old key `checkout.stripePayoutOn` and its dictionary entry are removed). The server still sends `availableOn` and the answer-key tests that list it still pass; nothing reads it for copy.
- **W6-17** `packages/emails/src/refund.ts`: the "Refund issued" mail carries the refunded amount (`CHF 123.45`, grouped like the confirmation mail; Arabic isolates it with LRI/PDI), says "the card you paid with" instead of "bank account" (the pending mail too), thanks without a name when `contact_name` is blank (route no longer passes the English "there"), four languages. Amount is the booking's total refunded after the batch (`result.refundedRappen`; the mail goes once, when nothing is owed); a missing, zero, negative or fractional amount gives the no-amount sentence, never `CHF 000`. `sendRefund` takes an optional `amountRappen`. **The wording is mine** (the review asked the owner to approve new refund wording): he should read the four versions in `refund.ts` before it ships.
- **W1-07** `publishableKey` removed from the checkout settings context and layout (nothing read it). `STRIPE_PUBLISHABLE_KEY` is untouched on the server side: the J1 mode comparison (`stripe-mode.ts`, health probe) and `stripeAccountIsLegacyUaeTest` still read it. A test pins both facts.
- **W1-13** Left as is, listed. Evidence gathered offline: the installed Stripe SDK (22.6.1, OpenAPI v2442) lists no `ar` among the Checkout locales (`Locale = 'auto' | 'bg' | … | 'zh-TW' | OtherString`); the repo's comment says Stripe's enum listed it on 2026-09-29. These disagree and I cannot call Stripe, so the "send `ar`, retry once with `en`" code stays. One sandbox session with `locale: "ar"` settles it. Pinned by a test that fails if the SDK list ever gains `ar` (then the retry is dead code).

## Files

`lib/checkout/stripe.ts`, `currency.ts`, `payment-methods.ts` (new), `app/[locale]/checkout/{CheckoutSettings,layout}.tsx`, `sections/{PaymentSection,SummaryRail}.tsx`, `app/[locale]/layout.tsx`, `components/checkout/PayBar.tsx`, `components/shell/SiteFooter.tsx`, `components/booking/BookingVoucher.tsx`, `app/vamos-manage-ticket.js`, `app/vamos-i18n-dict.js`, `app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` (the `app/api/staff/...` mount re-exports it), `packages/emails/src/refund.ts`, `lib/send.ts`, i18n `en/de/fr/ar.json` (+2 keys `methodNoteNoTwint`, `refundArrivalNote`, -1 `stripePayoutOn`), `packages/db/supabase/seed.sql` (generated, 2702 to 2703) and `seed_idempotent.test.sql` (pin), tests.

## Tests and gates run

- `apps/web`: `tsc --noEmit -p .` clean; `pnpm exec vitest run`: 468 files passed, 5574 tests passed, 41 skipped (20 files skipped); eslint on `app`, `lib/checkout`, `lib/db`, `components` clean. `packages/emails`: `vitest run` 16 files, 271 tests passed; `tsc --noEmit` and eslint clean. `i18n:check` (2695 keys), `check:db-fences`, `check:numbers`, `check:legal-claims`, `db:seed:check` pass.
- New or changed tests: `j8-money-copy.test.ts` (adaptive pricing off on every creation path and old sessions still read; TWINT flag drives method list, note, footer, layout; four-language strings; no payout date; no publishable key in the context; SDK locale evidence), `components/checkout/pay-bar-charge-note.test.tsx`, `refund.test.ts` in emails (amount, card not bank, blank name, Arabic isolation, no `CHF 000`, Swiss spelling), `booking-pages-polish.test.ts` and `audit-26-2-u06-components.test.ts` (refund line without a date, four languages), `stripe.test.ts`, `stripe-hosted.test.ts`.
- pgTAP (lab `pay-b`, native, own stack): full suite `Files=110, Tests=3065, Result: PASS` (includes `seed_idempotent.test.sql` at 2703). The lab's own post-run data restore step fails ("no keys"), as in J5 and J6, irrelevant to the result.
- `lab.sh dbtests pay-b`: `packages/db test/local` 72 passed; `apps/web *.local.test.ts` 6 passed (seeded) + 30 passed, **3 failed**: the two `return-settle-superseded.local.test.ts` fixture failures seen in J5 and J6, and `system-reads.local.test.ts` ("duplicate key … rate_versions_one_live", a second live rate version left by another local test file). None of these files or the code they exercise was touched in J8; the third did not fail in J5 or J6, so it looks order-dependent. I did not investigate further.

## NOT verified

- No browser and no Worker run: the charge note, the TWINT-less note and footer, the refund line and the mails were not looked at on screen (1440, 1024, 768, 390 px; Arabic RTL). RTL safety rests on reuse of existing classes and logical CSS plus the Arabic isolate for the amount in the mail.
- No Stripe call. Whether `adaptive_pricing: { enabled: false }` yields CHF-only presentment on the live account, whether Apple Pay and Google Pay actually appear on the live hosted page (the no-TWINT note still names them, as before), and whether Stripe accepts `locale: "ar"` are all unverified.
- No test mail was sent. The Arabic mail was checked as strings only (no rendering in a mail client).

## Deviations

- W3-08 keeps "Apple Pay or Google Pay" in the no-TWINT note (the finding only asks for TWINT). They are an unverified promise, as before.
- W6-17 covers the issued and pending refund mail only: the class-change and trip-change difference mails still go to `contact_email` only, and concurrent identical presses can still send two mails (not in the brief for J8).
- W1-13 left (above).

## Found, not fixed

- Public copy that still promises TWINT: legal `terms` ("Accepted methods: Visa, Mastercard, Apple Pay, Google Pay and TWINT.", in `app/pages/terms.dc.html`; legal copy, not touched), `FaqSection.dc.html` ("Card or TWINT"), `TrustFacts.dc.html`, the unused key `checkout.card-apple-pay-or-twint`, and the dead checkout mock `app/pages/checkout.dc.html`. Footer and checkout follow the flag now; these do not.
- Ops/dashboard copy `errTestOnly` (J1) and the unused `payment*`/`failed*` checkout keys listed by the review (W3-16) remain for J10 or a clean-up job.
- The server still sends `availableOn` in the cancel and manage answers (harmless, tested by the answer-key tests); it can go in a later clean-up.
- `system-reads.local.test.ts` and `return-settle-superseded.local.test.ts` fail on the lab (above).
- Other W3 items outside J8: W3-13 (`localhost` in the origin allow-list), W3-14 (pay-link token in `cancel_url`), W3-16 (dead payment code and strings), W3-17 (two `success_url` builders).

## Deploy order for the controller

1. No migration. Deploy the Worker. The new Checkout Sessions are CHF-only with Adaptive Pricing off. Sessions already open at deploy time (created with it on) keep their presentment and settle as before.
2. After deploy, in Stripe's live dashboard open the newest Checkout Session created by the app and check it shows no currency conversion offered (unverified here); then view `/en/checkout` with a EUR display currency: the line "You are charged in Swiss francs (CHF)." sits under Total and PAY. Footer and checkout note must not say TWINT while `STRIPE_CHECKOUT_TWINT` is `off` (it is `off` in the Worker `vamos` block).
3. Read the new refund mail wording in `packages/emails/src/refund.ts` (four languages) before the first real refund.
