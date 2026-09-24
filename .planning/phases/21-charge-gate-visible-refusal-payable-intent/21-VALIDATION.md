---
phase: 21
slug: charge-gate-visible-refusal-payable-intent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-23
---

# Phase 21 — Validation Strategy

> From `21-RESEARCH.md` ## Validation Architecture. CONTEXT D-01…D-17 win.
> Host `vamostaxi.site`. No `.eu`. No invented CHF. No `sk_live_`.
> Stripe stays TEST. Payable sessions only after the owner points TEST at the client account (not the UAE prefix `pk_test_51U65pW`).
> Agent does not `supabase db push`. D-09 migration is owner-apply, `autonomous: false`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`apps/web`) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run lib/checkout/intent.test.ts lib/checkout/checkout-fields.test.ts lib/quote/intent.test.ts` |
| **Full suite command** | `cd apps/web && npx vitest run lib/**/*.test.ts` |
| **Estimated runtime** | ~60 seconds |

`vitest.config.ts` excludes `tests/integration/**` and `**/*.spec.ts` and sets `passWithNoTests: true`. Do **not** verify with `vitest run tests/integration/*.spec.ts` — an empty match is vacuously green.

Do not edit `apps/web/lib/checkout/checkout-comments.test.ts` unless a plan task owns it. It is dirty from another session. Do not drop `refusal === "pricingNotLive"`.

---

## Sampling Rate

- **After every task commit:** `cd apps/web && npx vitest run lib/checkout/intent.test.ts lib/checkout/checkout-fields.test.ts lib/quote/intent.test.ts`
- **After every plan wave:** `cd apps/web && npx vitest run lib/**/*.test.ts`
- **Before `/gsd:verify-work`:** full lib suite green. Staging UAT is human (unpriced card, Pay land, lock zero, mahaha secret after the owner checkpoint).
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Planner fills Plan / Task IDs and must keep these commands. Remap this table if task IDs split. Nyquist: no three consecutive tasks without an automated verify. Owner key put and owner SQL apply are the only manual gates.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 21-01 | 0 | PAY-08 | T-21-UAE | UAE prefix blocks `sessions.create`; missing class id is `pricing_not_live`; selectable predicate | unit | `cd apps/web && npx vitest run lib/checkout/charge-gate.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-02 | 21-01 | 0 | PAY-09 | T-21-CODES | `email_failed` stays 502 | unit | `cd apps/web && npx vitest run lib/checkout/charge-gate.test.ts` | ❌ W0 | ⬜ pending |
| 21-03-02 | 21-03 | 1 | PAY-08 | T-21-CODES | Null class total and expired lock refuse before create | unit | `cd apps/web && npx vitest run lib/checkout/intent.test.ts` | ✅ | ⬜ pending |
| 21-04-02 | 21-04 | 1 | PAY-09 | T-21-CODES | Open returns `lock_expires_at` from `token_expires_at`, not `snapshot_expires_at` | unit | `cd apps/web && npx vitest run lib/checkout/pay-link-gate.test.ts` | ❌ W0 | ⬜ pending |
| 21-04-03 | 21-04 | 1 | D-04 | T-21-RPC | Owner applies the hash return. Agent does not `db push` | source | `test -f packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql` | ❌ owner-apply | ⬜ pending |
| 21-05-02 | 21-05 | 2 | D-04 | — | Checkout timer reads trip `expires_at` (lock `payload.exp`) | unit | `cd apps/web && npx vitest run lib/checkout/pay-land.test.ts` | ❌ W0 | ⬜ pending |
| 21-06-03 | 21-06 | 2 | D-09 | T-21-RPC | Guest cancel is `vamos_checkout` only. No `db push` | source | `test -f packages/db/supabase/migrations/20260923120000_checkout_requote_cancel.sql` | ❌ owner-apply | ⬜ pending |
| 21-07-01 | 21-07 | 3 | D-04 | T-21-CODES | Token sitting lock-zero passes `locked`, does not `confirm`, does not timer off `expires_at` | unit | `cd apps/web && npx vitest run lib/checkout/token-pay.test.ts` | ❌ W0 | ⬜ pending |
| 21-08-02 | 21-08 | 3 | D-14 | T-21-UAE | Payable task stops while prefix is `pk_test_51U65pW` | unit | `cd apps/web && npx vitest run lib/checkout/payable-account.test.ts` | ❌ W0 | ⬜ pending |
| 21-09-01 | 21-09 | 4 | PAY-08 | T-21-CODES | onExpress reads lockedRef before confirm | unit | `cd apps/web && npx vitest run lib/checkout/express-lock.test.ts` | ❌ W0 | ⬜ pending |
| 21-09-02 | 21-09 | 4 | PAY-09 | T-21-CODES | Lock-zero expires the stored session; no mint | unit | `cd apps/web && npx vitest run lib/checkout/token-pay.test.ts` | ❌ W0 | ⬜ pending |
| 21-09-03 | 21-09 | 4 | PAY-09 | T-21-RPC | Requote ok only after expire or a successful empty lookup | unit | `cd apps/web && npx vitest run lib/checkout/requote-cancel.test.ts` | ❌ W0 | ⬜ pending |
| 21-10-01 | 21-10 | 5 | PAY-09 | T-21-CODES | emailFailed exists in en/de/fr/ar and is not payCouldNotStart | unit | `cd apps/web && npx vitest run lib/checkout/email-failed.test.ts` | ❌ W0 | ⬜ pending |
| 21-10-02 | 21-10 | 5 | PAY-09 | T-21-CODES | not-ok branch maps email_failed to emailFailed | unit | `cd apps/web && npx vitest run lib/checkout/email-failed.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/checkout/charge-gate.test.ts` — prefix guard, token-exp pin, missing class id → `pricing_not_live`, selectable predicate. No key material.
- [ ] Do not add `tests/integration/*.spec.ts` as the proof.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner replaces `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and staging `STRIPE_PUBLISHABLE_KEY` with the client TEST account | D-15 | Secrets stay in the owner terminal. Agent never reads keys. | Owner runs `wrangler secret put` for the two secrets and replaces the staging publishable var. Payable UAT starts only after the prefix is no longer `pk_test_51U65pW`. |
| Owner applies the D-09 guest-cancel definer | D-09 | Agent writes the migration. Agent does not `supabase db push`. | Numbered owner apply on a copy, never wipe `yaumjzvylngfjhtuffqs`. Until applied, Requote must not pretend the unpaid row is gone. |
| Pay land and token sitting: no Stripe iframe on land-blocked; lock-zero disables an already-mounted Stripe on checkout and on the token page | PAY-08 / PAY-09 | UI mount is not in the lib glob | Staging UAT against `21-UI-SPEC.md`. Token timer uses `lock_expires_at`, not `expires_at`. No Requote on the token page. Mahaha `client_secret` only after the account checkpoint. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
