---
phase: 18
slug: ops-pricing-source
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-13
---

# Phase 18 — Validation Strategy

> CONTEXT.md D-01…D-40 win. Host is `vamostaxi.site` / `dashboard.vamostaxi.site`. Forget `.eu`.
> Public `CHF 000` until owner Publish sets `settings.public_chf`. Never invent CHF, legal, or mail copy.
> Stripe stays test. Agent does not `apply_migration` / `supabase db push` — owner apply is a numbered gate.
> Absorb leftover `04.3-01-PLAN.md`. Do not execute it as a separate phase.
> Remapped 2026-09-13 to match 18-01…18-10 PLAN.md (2–3 tasks per plan).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`) + Playwright DC fingerprints |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/pricing lib/ops lib/checkout/vat lib/quote` |
| **Full suite command** | `pnpm --filter web exec vitest run` + `pnpm run typecheck` |
| **Estimated runtime** | ~90 seconds |

Do **not** `vitest run tests/integration/*.spec.ts`. Vitest excludes `tests/integration/**` and `**/*.spec.ts` and sets `passWithNoTests: true`.

---

## Sampling Rate

- **After every task commit:** Vitest on the files that task touched (`lib/pricing`, `lib/ops`, DC `readFileSync` tests)
- **After every plan wave:** `pnpm --filter web exec vitest run` + typecheck
- **Before `/gsd:verify-work`:** full Vitest green **and** live dashboard `/pricing` matches DC; public quote still `CHF 000` until owner Publish
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task IDs lockstep with PLAN.md tasks. Nyquist: no three consecutive tasks without an automated verify. 18-02-03 owner-apply is manual (18-02-02 and 18-03-01 sit around it). 18-10-03 owner UAT is manual (18-10-01 grep sits before it).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | D-11 D-12 D-13 D-14 | T-18-01 | Wave 0: kernel fixtures start + all-km per-km + per-class bands; no DISTANCE_FLOOR_KM; 1 km same recipe; roundHalfUp rappen | vitest files | `test -f apps/web/lib/pricing/lines.test.ts && test -f apps/web/lib/pricing/bands.test.ts` | ✅ extend | ⬜ pending |
| 18-01-02 | 01 | 1 | D-08 | T-18-02 | Wave 0: completeness = name/start/per-km/max pax + empty added rows; not min_fare_rappen | grep | `grep -n 'D-08' apps/web/lib/ops/pricing.test.ts` | ✅ extend | ⬜ pending |
| 18-01-03 | 01 | 1 | D-27 D-28 D-31 | T-18-03 | Wave 0: source-read five tabs, no /coupons, no charcoal placeholder, Publish fare book | file | `test -f apps/web/lib/ops/ops-pricing-source.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | D-08 D-14 D-19 D-20 D-22 D-33 D-34 | T-18-04 T-18-12 | Git migration: bands per class; drop min_fare from trigger; no public_chf = true. Agent does not apply | file + grep | `test -f packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` | ❌ | ⬜ pending |
| 18-02-02 | 02 | 2 | D-08 | T-18-02 | pgTAP publish tests drop min_fare_rappen; still refuse null base/per-km/max_pax | grep | `grep -n 'max_pax' packages/db/supabase/tests/rate_version_publish.test.sql` | ✅ extend | ⬜ pending |
| 18-02-03 | 02 | 2 | D-14 D-19 D-40 | T-18-12 | Numbered owner apply on yaumjzvylngfjhtuffqs. Never restore. Agent does not apply_migration | manual | owner resume-signal | — | ⬜ pending |
| 18-03-01 | 03 | 3 | D-14 D-19 | T-18-01 | Open VehicleClassSlug; DistanceBandRow.vehicle_class_id; hide_from_public | vitest | `pnpm --filter web exec vitest run lib/pricing/rateBook.test.ts lib/pricing/public-chf.test.ts` | ✅ | ⬜ pending |
| 18-03-02 | 03 | 3 | D-14 | T-18-01 | bands.ts: extras on top of all km; no DISTANCE_FLOOR_KM | vitest | `pnpm --filter web exec vitest run lib/pricing/bands.test.ts lib/pricing/round.test.ts` | ✅ | ⬜ pending |
| 18-03-03 | 03 | 3 | D-11 D-12 D-13 D-15 D-17 D-19 | T-18-01 | lines.ts D-11 recipe; no reverse match; extra stop skips fixed | vitest | `pnpm --filter web exec vitest run lib/pricing` | ✅ | ⬜ pending |
| 18-04-01 | 04 | 4 | D-08 | T-18-02 | loadCompleteness drops min_fare; requires name/start/per-km/max pax | vitest | `pnpm --filter web exec vitest run lib/ops/pricing.test.ts` | ✅ extend | ⬜ pending |
| 18-04-02 | 04 | 4 | D-02 D-03 D-06 D-09 | T-18-05 T-18-06 T-18-12 | Publish tx: public_chf + vat_rate_bps + forkLiveRateVersion; no unpublish | vitest | `pnpm --filter web exec vitest run lib/ops/publish-public-chf.test.ts` | ✅ extend | ⬜ pending |
| 18-04-03 | 04 | 4 | D-07 D-09 | T-18-05 | withAdmin Publish; not-draft envelope; no history DELETE | vitest | `pnpm --filter web exec vitest run lib/ops/publish-public-chf.test.ts lib/ops/pricing.test.ts` | ✅ extend | ⬜ pending |
| 18-05-01 | 05 | 4 | D-01 D-04 D-18 D-20 | T-18-05 T-18-08 | Overlay Save = draft; CHF only; lock hours→minutes | vitest | `pnpm --filter web exec vitest run lib/ops` | ✅ extend | ⬜ pending |
| 18-05-02 | 05 | 4 | D-03 D-19 D-34 | T-18-06 T-18-07 | Settings PATCH ignores vat_rate_bps; versioned coupons; POST class | vitest | `pnpm --filter web exec vitest run lib/ops lib/checkout/vat.test.ts` | ✅ extend | ⬜ pending |
| 18-05-03 | 05 | 4 | D-05 D-09 D-10 D-33 | T-18-05 | Discard / preview / test unpaid / clone: withAdmin, no Stripe, no mail, pay_url null for is_test, preferDraft false | vitest | `pnpm --filter web exec vitest run lib/ops lib/quote/engine.test.ts lib/pricing/public-chf.test.ts` | ❌ new routes | ⬜ pending |
| 18-06-01 | 06 | 5 | D-02 D-09 D-14 D-15 D-18 D-27 D-28 D-29 D-30 D-31 D-32 | T-18-03 T-18-08 | DC rebuild: five tabs, header Discard+Publish, rail VAT+preview, CHF only, overlap warn on confirm | vitest source-read | `pnpm --filter web exec vitest run lib/ops/ops-pricing-source.test.ts lib/ops/ops-pricing-vat-field.test.ts` | ❌ W0 | ⬜ pending |
| 18-06-02 | 06 | 5 | D-07 D-28 | T-18-03 | No /coupons nav/route; dispatcher /pricing not found | vitest source-read | `pnpm --filter web exec vitest run lib/ops/ops-pricing-source.test.ts` | ✅ extend | ⬜ pending |
| 18-06-03 | 06 | 5 | D-05 D-09 D-10 D-31 D-33 | T-18-05 | vamos-ops-data draft APIs; dual-copy equality; four-language T | vitest source-read | `pnpm --filter web exec vitest run lib/ops/ops-pricing-source.test.ts` | ✅ extend | ⬜ pending |
| 18-07-01 | 07 | 6 | D-35 D-36 | T-18-09 | Catalog from published surcharge chips; automatic rules never chips; preferDraft false | vitest | `pnpm --filter web exec vitest run lib/checkout/extras-catalog.test.ts lib/ops/surcharge-codes.test.ts` | ✅ extend | ⬜ pending |
| 18-07-02 | 07 | 6 | D-37 | T-18-09 | Extra stop re-runs D-11; not amount × qty | vitest | `pnpm --filter web exec vitest run lib/pricing/lines.test.ts lib/checkout/extras-catalog.test.ts` | ✅ extend | ⬜ pending |
| 18-07-03 | 07 | 6 | D-16 D-39 | T-18-09 | Both pins inside service area; coupon before VAT floors at 0 | vitest | `pnpm --filter web exec vitest run lib/geo/serviceArea.test.ts lib/pricing/policy.test.ts` | ✅ | ⬜ pending |
| 18-08-01 | 08 | 6 | D-20 D-22 | T-18-10 | New quotes live book; expire at quote_lock_expires_at | vitest | `pnpm --filter web exec vitest run lib/quote/lock.test.ts lib/quote/engine.test.ts lib/checkout/booking-lifecycle.test.ts` | ✅ extend | ⬜ pending |
| 18-08-02 | 08 | 6 | D-23 D-26 D-33 | T-18-10 | Webhook after expiry does not capture; pay before expiry uses snapshot; is_test intent refused | vitest | `pnpm --filter web exec vitest run lib/checkout/settle.test.ts lib/checkout/webhook.test.ts lib/checkout/intent.test.ts` | ✅ extend | ⬜ pending |
| 18-08-03 | 08 | 6 | D-21 D-24 D-25 | T-18-05 T-18-10 | Select refuses stale version; skip-send mails; ops snapshot amounts | vitest | `pnpm --filter web exec vitest run lib/quote/intent.test.ts lib/ops/phone-booking.test.ts lib/lifecycle/notify-lifecycle.test.ts` | ✅ extend | ⬜ pending |
| 18-09-01 | 09 | 7 | D-38 | T-18-11 | Meet & greet and free wait two cards, default on | vitest | `pnpm --filter web exec vitest run lib/checkout/extras-catalog.test.ts` | ✅ extend | ⬜ pending |
| 18-09-02 | 09 | 7 | D-38 | T-18-11 | Extra wait CHF 0 at pay; ops arrived_at via bookings-write + OpsDetail; no Stripe charge from waiting | vitest | `pnpm --filter web exec vitest run lib/checkout/intent.test.ts lib/pricing/lines.test.ts` | ✅ extend | ⬜ pending |
| 18-09-03 | 09 | 7 | D-38 | T-18-11 | Grep: no off_session extra-wait debit | vitest source-read | `pnpm --filter web exec vitest run lib/checkout` | ❌ W0 | ⬜ pending |
| 18-10-01 | 10 | 8 | D-40 | T-18-12 | Worker vamos; no sk_live_; no .eu; SQL has no public_chf = true | vitest grep | `pnpm --filter web exec vitest run lib/pricing/public-chf.test.ts lib/ops/ops-pricing-source.test.ts` | ✅ grep | ⬜ pending |
| 18-10-02 | 10 | 8 | D-40 | T-18-03 | Dual-DC equality; lib/pricing lib/ops vitest; typecheck | vitest + typecheck | `pnpm --filter web exec vitest run lib/pricing lib/ops lib/checkout/vat.test.ts lib/quote` | ✅ | ⬜ pending |
| 18-10-03 | 10 | 8 | D-40 | T-18-12 | Owner UAT on live /pricing. Agent does not Publish. Public CHF 000 until owner click | manual | owner resume-signal | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] Extend `apps/web/lib/pricing/lines.test.ts` — D-11 recipe; 1 km; no 20 km floor
- [ ] Extend `apps/web/lib/pricing/bands.test.ts` — per-class bands on top of class per-km; From inclusive / To exclusive
- [ ] Completeness tests without `min_fare_rappen`
- [ ] `apps/web/lib/ops/ops-pricing-source.test.ts` — `readFileSync` both OpsPricing copies: five tab labels, `Publish fare book`, no charcoal placeholder, no `/coupons` in OpsSidebar
- [ ] Existing `public-chf.test.ts` stays: live row is not the flip

Existing `round.ts` / `vat.ts` / `formatAmount(null)==="CHF 000"` stay. Do not add a second money formatter. Do not `supabase db push`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner apply schema on `yaumjzvylngfjhtuffqs` | D-14 D-19 | Live Zurich; agent must not apply | Numbered owner sitting. Never restore onto this project. |
| First public CHF | D-40 | Fare book is owner data | Current or new `/pricing` Publish. Until then public `CHF 000`. |
| Price-changed / expired mail English | D-24 | Owner supplies copy later | Wire skip-send / TBC. Do not invent. |
| Extra-wait off-session debit | D-38 | Stripe SCA / legal gate | Do not ship silent capture. |
| Live dashboard visual | D-27 | DC pixel | `https://dashboard.vamostaxi.site/pricing` after deploy to Worker `vamos`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (18-02-03 / 18-10-03 are owner gates with automated neighbors)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
