---
phase: 29-webhook-purchase
verified: 2026-10-03T17:38:51Z
status: human_needed
score: 5/5 roadmap truths verified in code (2 plan truths open on owner input / pre-ship merge)
overrides_applied: 0
human_verification:
  - test: "Owner copies the test event code from Events Manager (pixel 1595596972063765, Test events); controller adds META_TEST_EVENT_CODE to env.staging.vars only in apps/web/wrangler.jsonc"
    expected: "Staging vars carry the code; top-level vars and env.production carry none"
    why_human: "The value comes only from the owner (D-07) and must not be invented. Today apps/web/wrangler.jsonc has no META_TEST_EVENT_CODE, so every test-mode payment records skip_reason no_test_code and sends nothing"
  - test: "After migration 20261007260000 is applied verbatim and deploy (--env staging): on https://vamostaxi.site Accept all, book, pay with 4242; then read-only select state, skip_reason, test_event, http_status, graph_code, graph_subcode from public.meta_purchase_events for that booking, and that meta_fbp / meta_fbc / meta_consent_subject are NULL"
    expected: "state sent, test_event true, http 200, one Purchase under Test events with value = francs charged, currency CHF; the three booking columns empty"
    why_human: "Needs the live Worker, the real token and Meta. Research assumption A1: Meta documents client_user_agent as required for website events and the locked payload has none. If state is rejected: stop and ask the owner with graph_code/subcode (META-14), do not widen"
  - test: "Hosted read-back after apply (HANDOVER section 3): row counts, empty column and table, function privileges, RLS forced, trigger columns, md5 of the six function definitions"
    expected: "All eight checks match the HANDOVER values"
    why_human: "Live database; this verifier may not touch it"
  - test: "Controller clean-clone gates after merging origin/main (now 2 commits ahead: d15b64a4, fddfae18; merge-tree is clean): pgTAP from reset, pnpm db:types:check with the pinned CLI, full test:unit, typecheck, build"
    expected: "All green; database.types.ts byte-identical"
    why_human: "Needs a database stack and Docker/pinned CLI; this verifier was told not to start stacks. pgTAP (94 tests in meta_purchase.test.sql) and the whole-file types check were not re-run here"
---

# Phase 29: Webhook Purchase Verification Report

**Phase Goal:** One Purchase from the settle queue after a real CHF charge, in the francs Stripe charged, with saved `_fbp` and `_fbc` only. Quote, pay, and confirmation do not change.
**Verified:** 2026-10-03T17:38:51Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One Purchase leaves the settle queue after a real CHF charge; value = francs charged; CHF 000 sends nothing | VERIFIED (code) | `settle.ts` hook runs only for `outcome === "succeeded"` (only `checkout.session.completed` with `payment_status=paid`), `!extra`, `payment_id > 0`, dep present. Dep exists only when `worker.ts` queue passes `{ metaPurchase: true }`. Claim reads `booking_payments.charged_rappen` (the CHF figure, constraint/comment in 20260827000001) for the booking's first succeeded payment; `capi.ts` sends `value: chargedRappen / 100`, `currency: "CHF"`; `<= 0` or non-integer returns null; SQL also skips `zero_charge`. One row per booking (PK `booking_id`), second claim answers `already`. |
| 2 | Payload is `_fbp`/`_fbc` only, only if saved; neither saved sends nothing; no PII/IP/UA | VERIFIED (code) | `buildPurchaseEvent` builds `user_data` from saved fbp/fbc only, null when both empty; SQL skip `no_ids`. Added non-test lines contain no `client_user_agent`, `client_ip_address`, `external_id`, `em`, `ph`, `sha256`, reference. capi.test.ts pins the exact key set. |
| 3 | URL is `https://vamostaxi.site` with no path; event id ours, one per booking, reused on retry, not the reference | VERIFIED (code) | `PURCHASE_EVENT_SOURCE_URL = "https://vamostaxi.site"`. `event_id` = `gen_random_uuid()` on the once-only row; retry gets `already` and sends nothing (no second event id). pgTAP line 187 asserts the id is not and does not contain the reference. |
| 4 | Meta failure does not unpay or change webhook response; retry sends no second Purchase; staging uses test code; token is a wrangler secret; Graph rejection stops, not widened | VERIFIED (code), test code absent (owner) | `sendMetaPurchase` never rejects (outer try/catch); settle hook wraps it again and returns the same `HandleResult`; runs after every money step and expire-session loop. One POST, 5 s timeout, no retry; `rejected` is recorded via `meta_purchase_finish` (only from `sending`). Token read only via `env.META_CAPI_ACCESS_TOKEN` in purchase.ts, sent in body, never logged. Test code sent only when `livemode` false; missing code records `no_test_code`. `META_TEST_EVENT_CODE` is NOT in `wrangler.jsonc` yet (see human item 1). |
| 5 | Must-nots: no sk_live_, no vamostaxi.eu, no invented legal copy/CHF, no hashed email/phone, no browser Purchase, no middle events; quote/pay/confirmation unchanged; no Graph from thank-you page | VERIFIED | Added non-planning lines: 0 hits for `sk_live_`, `vamostaxi.eu`, `CHF [0-9]`. Graph host / token name only in capi.ts, purchase.ts, env.d.ts and tests. Diff under `apps/web/app`: only `api/checkout/intent/route.ts` (background `waitUntil` write gains the subject arg; Pay answer unchanged). `return-settle.ts` untouched, calls `handleStripeMessage` with two args (pinned by return-settle.test.ts). No `app/`, `public/`, components, pricing or confirmation change. |

**Score:** 5/5 roadmap truths verified in code. End-to-end send is not observable until the owner supplies the test code and Meta accepts the payload.

### Plan truths not met in the tree

| Plan | Truth | Status | Detail |
|------|-------|--------|--------|
| 29-07 | "The staging Worker config carries the owner's test event code as META_TEST_EVENT_CODE; production carries none" | UNCERTAIN (owner input) | Not in `apps/web/wrangler.jsonc`. Correct not to invent it (D-07). Closing it needs the owner's value, not a gap plan. |
| 29-07 | "Every gate passes once on the final tree, after a last merge of origin/main" | UNCERTAIN (stale) | Gates passed at 17:2x-17:34 UTC on base 62ed97c0. origin/main is now fddfae18 (d15b64a4 abuse/turnstile fix + board). `git merge-tree` is clean; the merged tree is unverified. |

### Owner decisions D-01..D-07

| Decision | Honoured | Evidence |
|----------|----------|----------|
| D-01 re-check consent before send | Yes | Pay press saves `meta_consent_subject` (4-arg writer, `vamos_checkout` only, 22023 if ids without subject). Claim binds the subject and reads `consent_choice(CONSENT_POLICY_VERSION)` at claim time; not `marketing=true` gives `consent_off`. pgTAP covers accept→refuse, older policy, accept→refuse→accept. |
| D-02 first payment only, extras send nothing | Yes | Hook skips `kind === "extra"`; claim returns `not_first_payment` with no row and no clear for a later payment. |
| D-03 no Purchase when settle refunds at once; no negative event | Yes | `refundRequired` → `refunded` skip row; `booking_refunds` row → `refunded`. No code sends on refund/cancel. |
| D-04 follow Stripe livemode | Yes | `testEvent = !livemode`; test code only on test-mode; `session.livemode === true` mapping tested. |
| D-05 wipe ids after decision | Yes | Claim nulls fbp, fbc, subject in the same transaction for every row-writing decision; `meta_purchase_clear_ids` best-effort on claim failure. |
| D-06 one try, failure on row and log (status + code only), no new screen | Yes | No retry; `finish` writes http/code/subcode; log fields bookingId/outcome/reason/http/code only. No UI change. |
| D-07 `META_TEST_EVENT_CODE` Worker var, never invented, missing = test-mode sends nothing | Yes (behaviour); value pending | `env.d.ts` types it; missing → `no_test_code`. Value absent pending owner. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/db/supabase/migrations/20261007260000_meta_purchase.sql` | VERIFIED | Additive: nullable column, empty RLS-forced table without grants, 4-arg writer, widened trigger, claim/finish/clear definers granted to `vamos_system` only. |
| `apps/web/lib/meta/capi.ts` | VERIFIED | Locked payload, one POST, token in body, 5 s timeout, sent/rejected/failed. |
| `apps/web/lib/meta/purchase.ts` | VERIFIED | Gate → token → mode → claim → POST → finish → log; never rejects. |
| `apps/web/lib/checkout/settle.ts` | VERIFIED | Optional `sendMetaPurchase` dep, hook after money steps, `metaPurchaseDepFor` opt-in. |
| `apps/web/worker.ts` | VERIFIED | Queue consumer passes `{ metaPurchase: true }`. |
| `apps/web/app/api/checkout/intent/route.ts`, `lib/meta/click-ids.ts` | VERIFIED | Subject carried into the background write only. |
| `packages/db/supabase/tests/meta_purchase.test.sql`, `packages/db/test/local/meta-purchase.test.ts` | EXISTS, not re-run | 94 pgTAP assertions covering every skip reason; needs a stack. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| worker.ts queue | settle.handleStripeMessage | `{ metaPurchase: true }` | WIRED |
| settle.handleStripeMessage | purchase.sendMetaPurchase | `metaPurchaseDepFor` → `metaPurchaseDepsFromEnv` | WIRED |
| purchase.ts | `public.meta_purchase_claim` / `finish` / `clear_ids` | `asSystem` (vamos_system grant) | WIRED |
| claim | `public.consent_choice` | GUC `request.vamos.consent_subject`, called inside definer | WIRED |
| purchase.ts | capi.postPurchase | injected fetch | WIRED |
| intent route | `checkout_set_meta_click_ids(uuid,text,text,uuid)` | `asCheckout` in `waitUntil` | WIRED |
| return-settle.ts | Meta | none (by design) | NOT WIRED, as intended |
| queue after return route settled first | hook | webhook event `stripe_created` ≥ session.created, so `stripe_event_begin` admits it; hook ignores `already_settled` | WIRED (unit-tested) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Purchase value | `charged_rappen` | `booking_payments` row of the first succeeded payment | Yes | FLOWING |
| user_data | `meta_fbp`/`meta_fbc` | saved at Pay press (Phase 28 + 29-04) | Yes | FLOWING |
| test code | `META_TEST_EVENT_CODE` | wrangler vars | Not set | PENDING owner |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 29 unit suites | `pnpm --filter web exec vitest run lib/meta lib/checkout/settle.test.ts lib/checkout/return-settle.test.ts` | 11 files, 456 tests passed (21:37 +04) | PASS |
| Must-not greps on added non-planning, non-test lines | grep sk_live_/vamostaxi.eu/CHF n/UA/IP/external_id/hash | 0 hits | PASS |
| Debt markers on added lines | grep TBD/FIXME/XXX/TODO/HACK | 0 hits | PASS |
| Branch merges with current origin/main | `git merge-tree --write-tree HEAD origin/main` | clean | PASS |
| pgTAP / Worker-client DB test | needs stack | not run | SKIP (human item 4) |

### Probe Execution

No probes declared by the phase. Step 7c: SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| META-10 | 29-01,02,03,05,06,07 | SATISFIED (code) | Truth 1 |
| META-11 | 29-02,03,04,05,07 | SATISFIED (code) | Truth 2 |
| META-12 | 29-02,03,05,07 | SATISFIED (code) | Truth 3 |
| META-13 | 29-01,02,04,05,06,07 | SATISFIED (code) | Truth 4 |
| META-14 | 29-03,05,06,07 | NEEDS HUMAN | Test code absent; Graph acceptance unproven (A1) |

No orphaned requirements: REQUIREMENTS.md maps exactly META-10..14 to Phase 29, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| none | | | | |

Info: `meta_purchase_claim` does not check `booking_payments.charged_currency`. A payment presented in EUR/USD/AED still sends `charged_rappen` (the CHF figure) as CHF, per research line 220. Consistent with "francs charged"; noted only.

### Human Verification Required

1. **Test event code.** Owner gives the code from Events Manager → Test events; controller adds `META_TEST_EVENT_CODE` to `env.staging.vars` only. Expected: production carries none.
2. **Live 4242 Purchase.** After apply + deploy, Accept all, book, pay 4242, read `meta_purchase_events` read-only. Expected: `sent`, `test_event` true, http 200, one Purchase in Test events at the francs charged; booking ids empty. If `rejected`: stop and ask the owner with the Graph code (META-14).
3. **Hosted read-back** per HANDOVER section 3.
4. **Clean-clone gates after merging origin/main** (2 new commits, merge clean): pgTAP from reset, pinned `db:types:check`, unit, typecheck, build.

### Gaps Summary

No code gaps. All five roadmap criteria and D-01..D-07 are implemented and wired; the queue is the only caller, the return route and customer pages are untouched, and the unit suites pass. What remains is outside the builder's reach: the owner's test event code (until then every staging payment records `no_test_code` and nothing reaches Meta), Meta's acceptance of a website Purchase without a user agent, the hosted migration read-back, and a re-run of the gates after merging the two commits origin/main gained since the hand-over.

---

_Verified: 2026-10-03T17:38:51Z_
_Verifier: Claude (gsd-verifier)_
