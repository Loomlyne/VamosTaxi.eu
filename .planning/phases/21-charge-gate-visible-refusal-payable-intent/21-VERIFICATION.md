---
phase: 21-charge-gate-visible-refusal-payable-intent
verified: 2026-09-23T12:11:32Z
status: human_needed
score: 5/6 must-haves verified
overrides_applied: 0
previous_status: gaps_found
previous_score: 3/6
---

# Phase 21: Charge gate + visible refusal + payable intent Verification Report

**Phase Goal:** UAT can tell an unpriced `CHF 000` class from a missing `client_secret`. Stripe never opens for an unpriced class. A priced live-book class (**mahaha**) returns a reusable `client_secret`. Expired 24h lock refuses visibly; pay-link dies with that lock.
**Verified:** 2026-09-23T12:11:32Z
**Status:** human_needed
**Re-verification:** Yes — after 21-09 (`b08cd093`, `99c6b886`, `d4c329e1`) and 21-10 (`006f3028`, `4cfda40d`). Previous report `2026-09-23T10:37:50Z` was `gaps_found`, 3/6.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unpriced class refuses as `pricing_not_live` / `pricingNotLive` and never opens Stripe. Missing class id is the same refusal. | VERIFIED | Intent route refuses a missing class id before `stripeFromEnv` (`intent/route.ts:81`, client at 85-86). Null class total refuses before create (`intent.ts:244`). Pay-link does the same (`pay-link/route.ts:79`, `114`, Stripe at 121). Land uses dummy fields, not `PaymentPanel`, when the class is unpriced (`CheckoutClient.tsx:1132-1138`, `1813` vs `1855`). |
| 2 | Expired 24h lock refuses visibly as `quoteExpired`. Pay-link dies with that lock. Resend does not restart the clock. | VERIFIED | Send path returns `quote_expired` before `stripeFromEnv` (`pay-link/route.ts:108`, Stripe at 121). Token exp is `payLinkTokenExpiresAt(lockPayload.exp)` with no window add (`charge-gate.ts:14-16`, route 185). Open maps a hash miss to `quote_expired` before Stripe (`open/route.ts:117`, Stripe at 154). SQL file `20260923121000_checkout_pay_link_lock_exp.sql` has `token_expires_at` and `t.expires_at > now()`. Hosted apply of that file was not re-checked this pass and is not newly claimed. |
| 3 | Priced live-book class (**mahaha**) returns a reusable Session `client_secret`. Intent reuses `checkout_open_payment` + `sessionIsPayable`. | UNCERTAIN | Code reuses: `loadOpenPayment` then `payableFromOpen` / `sessionIsPayable` before create (`intent.ts:271-272`). Unit test "reuses the unpaid session" is in the 24 that passed. TEST keys are not on Worker `vamos`. Live mahaha `client_secret` was not proven. Secrets were not read. **Not passed.** |
| 4 | `email_failed` stays `email_failed` (502). Unpriced / expired / `email_failed` are not collapsed into `payCouldNotStart` / `invalid_request`. | VERIFIED | Route still returns 502 `{ error: "email_failed", code: "email_failed" }` (`pay-link/route.ts:211`). `REFUSAL_KEYS.email_failed` is `emailFailed` (`CheckoutClient.tsx:87`). The sendPayLink not-ok line is `REFUSAL_KEYS[json.code ?? json.error ?? ""] ?? "payCouldNotStart"` at line 1072, so this code resolves before the fallback. Unknown codes still use the fallback. Pay-foot Alert renders `t(refusal)` for `emailFailed` (1878-1885; that key is not excluded). en/de/fr/ar `checkout.emailFailed` are the four plan sentences, not `payCouldNotStart`, no CHF. German has no ß. |
| 5 | Must-nots: no invented rappen, no Stripe objects for unpriced, Custom Checkout stays, no `sk_live_`, no `.eu`, no fare Publish, leftovers 16/17/19/20 untouched. | VERIFIED | `charge-gate.ts` returns a boolean, a code, or the lock date — no fare. Unpriced land does not render `PaymentPanel`. `CHECKOUT_UI_MODE` is `elements` (`stripe.ts:20`). Phase diff has no `sk_live_` in product source (the string appears only in tests that forbid it) and no `vamostaxi.eu` under checkout. Diff names do not include phases 16/17/19/20. |
| 6 | Lock zero disables an already-mounted Stripe and does not confirm (D-04, D-12, 21-05, 21-07, 21-09). | VERIFIED | `lockedRef.current = locked` is assigned during render (`PaymentPanel.tsx:309-310`). `onExpress` calls `paymentFailed` and returns when `lockedRef.current` is true, before `type !== "success"` and before `checkout.confirm` (365-369, then 371, then 375). Card callback still returns when `locked` (341). Checkout lock zero sets `quoteExpired` then POSTs `/api/checkout/lock-expire` (`CheckoutClient.tsx:567-578`). Token timer does the same (`PayClient.tsx:209-214`). Requote returns `{ ok: true }` only after expire resolved or a successful lookup found no session (`requote/route.ts:65-99`). |

**Score:** 5/6 truths verified

Roadmap criteria 1, 2, 4, and 5 are verified in code. Criterion 3 is not passed. The two code gaps from the prior report are closed. Plan must-have "no confirm after lock zero" holds in source.

Stripe will not expire a Checkout Session younger than 30 minutes (`stripe.ts:71-76`). `expireCheckoutSession` calls `sessions.expire` (`stripe.ts:122-127`). A young session, a missing publishable key, or the UAE prefix returns `session_not_expired` and does not claim `ok`. That is the 21-09 contract (no refund, no new session). It does not fail truth 6: the next wallet confirm does not call `checkout.confirm`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/checkout/charge-gate.ts` | Select predicate, UAE prefix, token-exp pin, missing-class code | EXISTS + SUBSTANTIVE | 21 lines. No fare. |
| `apps/web/app/api/checkout/intent/route.ts` | Class-id refuse before Stripe | WIRED | `refuse(refusalForMissingClassId())` at 81, before the lazy `stripeFromEnv`. |
| `apps/web/lib/checkout/intent.ts` | Prefix guard on the payable branch; reuse when payable | WIRED | UAE stop at 260 before `loadOpenPayment`. Reuse at 271-272. Create only after that. Live secret not proven. |
| `apps/web/app/api/checkout/pay-link/route.ts` | Token exp pinned to lock exp; refuse before Stripe | WIRED | Expired and unpriced return before line 121. `email_failed` stays 502 at 211. |
| `apps/web/app/api/checkout/pay-link/open/route.ts` | Hash miss is `quote_expired`; success JSON `lock_expires_at` and `quote_id` | WIRED | Miss at 117. `lock_expires_at` at 77. `quote_id` at 84. |
| `packages/db/supabase/migrations/20260923121000_checkout_pay_link_lock_exp.sql` | Hash RPC returns `token_expires_at`; `vamos_checkout` only | EXISTS + SUBSTANTIVE | Return column at 25. `t.expires_at > now()` at 53. GRANT at 67. Hosted apply not re-checked this pass. |
| `apps/web/app/[locale]/checkout/CheckoutClient.tsx` | Pay backstop Alert, dummy fields, lock timer, `emailFailed` map | EXISTS + SUBSTANTIVE | Dummy fields, lock-expire POST, and `email_failed` → `emailFailed` are real. |
| `apps/web/app/[locale]/checkout/PaymentPanel.tsx` | `locked` stops card and wallet confirm | WIRED | Card path returns. Express fails the event before confirm via `lockedRef`. |
| `apps/web/app/[locale]/checkout/pay/[token]/PayClient.tsx` | Recap, Alert, dummy fields; lock-expire on lock zero | WIRED | Timer sets locked, then POSTs lock-expire. No Requote. |
| `apps/web/app/api/checkout/lock-expire/route.ts` | Expire stored session by quote id. No mint, no cancel, no refund | WIRED | Lookup throw is `session_lookup_failed`. Expire throw, missing key, or UAE prefix is `session_not_expired`. |
| `packages/db/supabase/migrations/20260923120000_checkout_requote_cancel.sql` | `vamos_checkout`-only cancel | EXISTS + SUBSTANTIVE | REVOKE public/anon/authenticated; GRANT `vamos_checkout`. Apply was not proven. May still be unapplied. Route returns 503 `requote_not_applied` on `42883`. |

**Artifacts:** 11/11 exist and are substantive. Hosted apply of the requote SQL is not an artifact miss.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `intent/route.ts` | charge-gate | `refuse(refusalForMissingClassId())` before `stripeFromEnv` | WIRED | Line 81, client built only after that. |
| `intent.ts` | charge-gate | `stripeAccountIsLegacyUaeTest` before create | WIRED | Line 260, before `loadOpenPayment` and create. |
| `intent.ts` | `checkout_open_payment` / `sessionIsPayable` | `payableFromOpen` | WIRED | Lines 271-272. Live secret not proven. |
| `pay-link/route.ts` | charge-gate | `payLinkTokenExpiresAt(lockPayload.exp)` | WIRED | Line 185. No `now + window`. |
| `pay-link/open/route.ts` | errors | hash miss → `quote_expired` before Stripe | WIRED | Line 117, `stripeFromEnv` at 154. |
| `CheckoutClient.tsx` | `PaymentPanel` | rendered only when a payable secret exists and the land is not dummy fields | WIRED | Dummy fields replace the panel on unpriced / already-expired land with no secret. |
| `PaymentPanel` `onExpress` | `lockedRef` | `paymentFailed` then return before `checkout.confirm` | WIRED | Lines 365-369, before 375. Ref written at 309-310. |
| `CheckoutClient` `sendPayLink` | `email_failed` | `REFUSAL_KEYS` resolves to `emailFailed` | WIRED | Line 87 and line 1072. |
| `CheckoutClient` / `PayClient` | `/api/checkout/lock-expire` | POST after lock zero is set | WIRED | Checkout 574. Token timer 214. |
| `requote/route.ts` | `expireCheckoutSession` | `ok: true` only after expire or a successful empty lookup | WIRED | Lookup throw and expire throw return before line 99. |

**Wiring:** 10/10 connections verified. The two links that were not wired in the prior report are wired.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit tests except intent | main vitest binary, cwd worktree `apps/web`, 7 files | 49 passed | PASS |
| `intent.test.ts` | same runner; `stripe` resolved from main `node_modules` for this run only; symlink removed | 24 passed | PASS |
| Express confirm when locked | source read + `express-lock.test.ts` | `paymentFailed` before `type !== "success"` and before `.confirm(` when `lockedRef.current` | PASS |
| Client `email_failed` mapping | source read + `email-failed.test.ts` | lookup resolves to `emailFailed`, not `payCouldNotStart` | PASS |
| Live mahaha `client_secret` | not run | TEST keys are not on Worker `vamos`. Secrets were not read. | SKIPPED |
| Hosted SQL apply | not run | Do not apply. 21-06 requote SQL may still be unapplied. Pay-link lock-exp apply was not re-checked. | SKIPPED |

**Tests:** 73 passed (49 + 24). Worktree `node_modules` has no package install; the runner was the main binary. `vitest.config.ts` reported an unresolved `vitest/config` import and the tests still ran. That warning is the empty worktree install, not a product failure. The temporary `stripe` symlink was removed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PAY-08 | 21-01, 21-02, 21-03 | Unpriced class (`CHF 000`) refuses visibly (`pricing_not_live`) and never opens Stripe | SATISFIED | Missing class id and null total refuse before Stripe. Land path uses dummy fields, not `PaymentPanel`. |
| PAY-09 | 21-04, 21-05, 21-07, 21-09 | Expired 24h lock refuses visibly; pay-link dies with that lock (resend does not restart it) | SATISFIED | Visible `quoteExpired`, token exp pinned to lock exp, and wallet confirm fails before `checkout.confirm` when locked. Hosted apply of the hash RPC was not re-checked. |

**Coverage:** 2/2 requirements satisfied in code. Criterion 3 is not a requirement row and is not passed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `stripe.ts` | 71-76 | Session `expires_at` clamped to at least 30 minutes | Info | A young session cannot be expired. Route returns `session_not_expired`, not `ok`. Not a new gap. 21-09 accepted this. |
| `pay-link/open/route.ts` | 77 | `isoInstant` calls `toISOString()` with no finite check | Info | A non-date would 500. Not a current tree miss. |
| `charge-gate.ts` | 4-6 | `classIsSelectable(0)` is true; open refuses `charged <= 0` | Info | Matches D-01. Zero is not `CHF 000`. |

Prior blockers are closed. `onExpress` no longer confirms when locked. `email_failed` is no longer collapsed. Requote no longer returns `ok: true` when lookup or expire failed.

### Human Verification Required

Criterion 3 is not a pass. Do not treat the reuse wiring as a live `client_secret`.

### 1. mahaha reusable client_secret

**Test:** After the owner puts the client TEST connection on Worker `vamos` (not this verification), lock a priced **mahaha** quote and open Pay.
**Expected:** Intent returns a Session `client_secret`. A second open of the same unpaid quote reuses it (`checkout_open_payment` + `sessionIsPayable`). No new session on the UAE test prefix.
**Why human:** TEST keys are not on Worker `vamos`. Secrets were not read or printed. No live secret was claimed.

### 2. Requote cancel SQL

**Test:** Do not treat guest Requote cancel as live until `20260923120000_checkout_requote_cancel.sql` is applied on `yaumjzvylngfjhtuffqs`.
**Expected:** Applied function cancels the unpaid row. Until then the route returns 503 `requote_not_applied` on `42883`, not success.
**Why human:** Apply was not proven from the tree. This pass did not apply SQL. This is not a code gap.

### Decision Coverage

Warning only. Does not change status.

Honored in code: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-10, D-11, D-12, D-13, D-14 (prefix stop), D-16 (no reuse when retrieve fails), D-17 (no runbook, no invented account id).

D-04 / D-12: lock zero stops Apple Pay and Link confirm in `onExpress`. Card path still returns.
D-13: `email_failed` maps to `emailFailed`. Route 502 is intact. Unknown codes still fall through to `payCouldNotStart`.

D-09 cancel-by-quote is coded. Apply of `20260923120000_checkout_requote_cancel.sql` was not proven. Missing function returns 503, not success.

### Deferred Items

None. Phase 22 owns card capture and webhook wait. Phase 23 owns adding wallet methods. Neither owns the lock confirm gate or the `email_failed` map. Those are in this phase. Do not start phase 22 from this report.

## Gaps Summary

The two code gaps from the prior report are closed.

1. **Lock confirm** — closed. `onExpress` fails the wallet event before `checkout.confirm` when `lockedRef.current` is true. Lock zero on checkout and on the token page POSTs `/api/checkout/lock-expire`. Requote does not return `ok: true` when lookup or expire failed.
2. **`email_failed`** — closed. Four languages have `checkout.emailFailed`. The sendPayLink not-ok line resolves `email_failed` to `emailFailed` before `payCouldNotStart`.

No code gap remains that needs another plan. The phase goal is not passed. Criterion 3 was not proven. 21-06 SQL may still be unapplied.

### Critical Gaps (Block Progress)

None in code.

### Non-Critical Gaps (Can Defer)

None that need a plan. The Stripe 30-minute floor is the accepted `session_not_expired` outcome, not a new hole.

## Recommended Fix Plans

None. Do not add 21-11. Do not start phase 22. Do not check the phase box.

## Verification Metadata

**Verification approach:** Goal-backward (roadmap success criteria plus the prior report's sixth truth)
**Must-haves source:** ROADMAP.md Phase 21 success criteria, prior `21-VERIFICATION.md`, 21-09 and 21-10 summaries, live source
**Automated checks:** 73 unit tests passed. Express lock order and `email_failed` mapping re-read in source.
**Human checks required:** mahaha `client_secret` after TEST keys. Not a pass. Requote SQL apply unconfirmed.
**Secrets:** not read, not printed.
**Not done:** no product edit, no push, no deploy, no SQL apply, no phase 22, ROADMAP box left unchecked.

---
*Verified: 2026-09-23T12:11:32Z*
*Verifier: Hermes (gsd-verifier)*
