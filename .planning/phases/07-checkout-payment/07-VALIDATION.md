---
phase: 07
slug: checkout-payment
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-10-11
---

# Phase 07 — Validation Strategy (reconstructed, State B)

> Rebuilt after the fact from 07-RESEARCH.md (Validation Architecture), the 16 PLAN/SUMMARY pairs, 07-UAT.md / 07-VERIFICATION.md and the tests now on disk. Every path below was checked with `ls`.
>
> **Superseded in part.** `.planning/PHASE-CLOSURE-2026-09-29.md` wins over the ROADMAP table. Phase 26.1 (payment and pricing integrity, live) and 26.3 (booking-flow simplification, shipped 2026-09-29) replaced the Phase 7 checkout page: payment is now Stripe's hosted page, there is no card form on vamostaxi.site, the pay-link option left checkout, and the calendar-invite route is gone. Server-side pieces (RPCs, webhook, ledger, e-mail) stayed. Most test files were rewritten by 26.x, so the tests cited below prove today's behaviour, not the original 07-0x plan wording.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP (`packages/db`), Vitest (`apps/web`, `packages/emails`), Playwright (`apps/web/tests`) |
| **Config files** | `packages/db/supabase/config.toml`, `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/checkout` |
| **DB command** | `pnpm test:db-lab` (test lab; never the live database) |
| **Email command** | `pnpm --filter @vamos/emails exec vitest run` |
| **Full suite command** | `pnpm test:unit` + `pnpm test:db-lab` + `pnpm test:visual` (Playwright specs tagged `@checkout` run in the local test lab) |
| **Estimated runtime** | ~120 s unit, longer for lab/Playwright |

---

## Sampling Rate

- **After every task commit:** the touched file's Vitest, pgTAP or Playwright spec
- **After every plan wave:** `pnpm test:unit` + `pnpm test:db-lab`
- **Before `/gsd:verify-work`:** full suite green, plus a 4242 test payment on the deployed Worker, then read `booking_payments` by status (CLAUDE.local.md: passing tests do not prove a customer can pay)
- **Max feedback latency:** ~120 s for unit

---

## Per-Requirement Verification Map

| Req | Behaviour | Plans | Test Type | Automated Command | File Exists | Status |
|-----|-----------|-------|-----------|-------------------|-------------|--------|
| PAY-01 | Customer reaches checkout with a locked quote and enters passenger/contact details | 07-04, 07-05, 07-06, 07-07 | Playwright integration + unit | `pnpm --filter web exec playwright test tests/integration/checkout-hosted.spec.ts tests/integration/checkout-steps.spec.ts` ; `pnpm --filter web exec vitest run lib/checkout/checkout-fields.test.ts lib/checkout/checkout-quote.test.ts lib/checkout/intent-schema.test.ts` | yes (`checkout-guest.spec.ts` named in research was never created; `checkout-hosted.spec.ts` covers the flow) | covered |
| PAY-02 | Pay by card / Apple Pay / Google Pay / TWINT, charged in CHF | 07-01, 07-03, 07-16 | pgTAP + Vitest | `packages/db/supabase/tests/payment_fx.test.sql`, `checkout_rpc.test.sql`; `pnpm --filter web exec vitest run lib/checkout/stripe-hosted.test.ts lib/checkout/payment-method-type.test.ts lib/checkout/checkout-charge.test.ts lib/checkout/currency.test.ts` | yes | covered for CHF charge, FX columns, TWINT option, wallet type read-back. Wallet buttons rendering on Stripe's page is manual only (see below). Research's Checkout-Session / Adaptive-Pricing design was replaced by 26.1 (charge CHF, display FX). |
| PAY-03 | Complete booking as guest, no account | 07-02, 07-04, 07-06, 07-14, 07-16 | pgTAP + Playwright | `packages/db/supabase/tests/checkout_roles.test.sql`, `bookings_manage_token_rls.test.sql`, `manage_token_shape.test.sql`; `pnpm --filter web exec vitest run lib/checkout/manage-token.test.ts lib/checkout/guest-account.test.ts`; `checkout-hosted.spec.ts` (signed-out via `/api/checkout/me`) | yes | covered. 26.5 (guest account) later changed what a guest gets after pay. |
| PAY-04 | Booking confirmed only by a verified webhook, never the browser return | 07-04, 07-08, 07-10, 07-11 | Vitest + pgTAP + Playwright | `pnpm --filter web exec vitest run lib/checkout/webhook.test.ts lib/checkout/settle.test.ts lib/checkout/return-settle.test.ts` ; `packages/db/supabase/tests/settlement_rpcs.test.sql`, `webhook_ordering.test.sql`; `tests/integration/webhook-replay.spec.ts`, `tests/integration/confirmation-poll.spec.ts` | yes | covered. `webhook.test.ts` asserts 400 on missing or forged signature and "never captures or marks paid". Note 26.1 added `return-settle` (return page can settle after Stripe retrieval), so "never browser return" is now "never an unverified browser return"; re-read that test before relying on it. |
| PAY-05 | Repeated or out-of-order webhook cannot double-charge, double-confirm, double-send | 07-03, 07-04, 07-08 | pgTAP + Vitest + Playwright | `packages/db/supabase/tests/charge_gate.test.sql` (dedupe_key, one-success index), `webhook_ordering.test.sql`, `settlement_rpcs.test.sql`; `lib/checkout/stripe-event-record.test.ts`, `lib/checkout/webhook.test.ts`; `webhook-replay.spec.ts` (replay 200, ledger does not grow; out-of-order canceled superseded; second confirmation deliver not issued) | yes | covered |
| PAY-06 | Confirmation e-mail in the customer's language with voucher, manage link, calendar invite | 07-04, 07-05, 07-09 | Vitest snapshot + pgTAP | `pnpm --filter @vamos/emails exec vitest run src/ConfirmationEmail.test.tsx src/lib/ics.test.ts src/lib/send.test.ts` ; `packages/db/supabase/tests/confirmation_mail.test.sql`, `confirmation_payload_presentment.test.sql` | yes | partial. Render in en/de/fr/ar (incl. RTL, snapshots), voucher lines and `.ics` builder are unit-tested. Gaps: no test sends through Resend test mode; the manage link in the sent mail is not asserted end to end. The in-page invite route `/api/checkout/invite/[ref]` was removed by 26.3 (`confirmation-poll.spec.ts` asserts 404); only the e-mail attachment remains. |
| PAY-07 | Confirmation page shows reference, route, time, vehicle, amount paid | 07-10, 07-11, 07-13 | Playwright visual + Vitest | `pnpm --filter web exec playwright test tests/visual/confirmation.spec.ts` ; `pnpm --filter web exec vitest run lib/checkout/confirmation-receipt.test.ts lib/checkout/confirmation-phase.test.ts lib/checkout/confirmation-page.test.ts` | yes | partial. English at 1440/1024/768/390 only in the browser (spec says `/de|/fr|/ar` are 308-redirected, so de/ar copy is proven in `confirmation-phase.test.ts`, not visually). Research asked for en + de visuals. |

Supporting security checks from research (not separate requirements):

| Threat | Test |
|--------|------|
| Forged webhook | `lib/checkout/webhook.test.ts` (400, nothing recorded or enqueued) |
| Replay | `webhook-replay.spec.ts`, `stripe_events` cases in `settlement_rpcs.test.sql` |
| Client-supplied price smuggled | `lib/checkout/intent-schema.test.ts`, `intent.test.ts` |
| Double-submit | `lib/checkout/pay-idempotency.test.ts`, `checkout_rpc.test.sql` |
| Secret keys in client bundle | `scripts/check-next-public-allowlist.mjs` (CI gate, Phase 1) |
| Raw manage token logged | **gap** — no test asserts the raw token is never logged |

---

## Wave 0 Requirements (from research)

- [x] `packages/db/supabase/tests/checkout_rpc.test.sql`
- [ ] `apps/web/tests/integration/checkout-guest.spec.ts` — never created; folded into `checkout-hosted.spec.ts` and `checkout-steps.spec.ts`
- [x] `apps/web/lib/checkout/webhook.test.ts`
- [x] `apps/web/tests/visual/confirmation.spec.ts`
- [x] `packages/emails/src/ConfirmationEmail.test.tsx` (research named `*.test.tsx` in `packages/emails/src`)
- [x] `apps/web/vitest.config.ts`
- [ ] Stripe CLI `stripe listen` — dev-loop only, not recorded

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apple Pay / Google Pay / TWINT buttons on Stripe's hosted page | PAY-02 | Rendered by Stripe, device and region dependent | Owner UAT with a real device on vamostaxi.site; Passed for dummy card only (07-UAT tests 1–9, 07-VERIFICATION) |
| 4242 payment after every checkout deploy | PAY-02, PAY-04 | Tests do not prove a customer can pay | Pay with 4242 4242 4242 4242, then read `booking_payments` by status |
| Confirmation e-mail arrives and links open | PAY-06 | Needs a real Resend send | Owner checks inbox after a test payment |
| Charge only after `pricing_live` | PAY-02 | `rate_version` 18 is "placeholder, not owner-approved"; the agent never clicks Publish | Owner decision |

---

## Gap Summary

- Requirements: 7 (PAY-01 … PAY-07). Plans also tag QUOTE-06, QUOTE-10, LIFE-03, DATA-08, I18N-05, AUTH-06; those belong to other phases' validation and are not counted here.
- Covered: 5 (PAY-01, PAY-02, PAY-03, PAY-04, PAY-05). PAY-02 keeps a manual wallet check.
- Partial / gap: 2 (PAY-06: no Resend send test, invite route removed; PAY-07: no visual de/fr/ar).
- Extra gap: raw-manage-token-never-logged has no test.
- Not run in this reconstruction: no test was executed to write this file; "covered" means a test file exists and targets the behaviour, not that it is green today.

---

## Validation Sign-Off

- [ ] Run the cited commands and record pass/fail (not done here)
- [x] Every cited test path exists
- [ ] PAY-06 and PAY-07 gaps filled or accepted by the owner
- [ ] `nyquist_compliant: true` only after the above

**Approval:** pending
