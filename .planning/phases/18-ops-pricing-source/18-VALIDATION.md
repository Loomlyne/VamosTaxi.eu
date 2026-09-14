---
phase: 18
slug: ops-pricing-source
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-14
---

# Phase 18 — Validation Strategy (restart 2026-09-14)

> CONTEXT.md D-01…D-35 win. 2026-09-13 archive is not executable.
> `18-PATTERNS.md` and `18-UI-SPEC.md` rewritten and approved 2026-09-14 — same chrome as CONTEXT (four tabs, VAT-only rail, no History/Preview/region).
> Host `vamostaxi.site` / `dashboard.vamostaxi.site`. No `.eu`. No invented CHF.
> Stripe test. Agent does not Publish. Agent does not `db push`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`) + source-read tests |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/pricing lib/ops` |
| **Full suite command** | `pnpm --filter web exec vitest run lib/pricing lib/ops lib/checkout lib/quote` + `pnpm run typecheck` |
| **Estimated runtime** | ~90 seconds |

Do **not** `vitest run tests/integration/*.spec.ts` unless a plan says so.

---

## Sampling Rate

- **After every task commit:** Vitest on files that task touched
- **After every plan wave:** quick command + typecheck
- **Before `/gsd:verify-work`:** full command green **and** live UAT checklist (owner Publish)
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Filled by planner lockstep with PLAN.md task IDs. Nyquist: no three consecutive tasks without automated verify. Owner Publish is the only manual gate.

Wave 0 must exist before public-board tasks: fixtures for 100+(14.6×12)=275.20 and 12.3×10=123; source-read no History/Preview/region in OpsPricing; no `CLASS_SLUGS` four-tuple on home/checkout.

| Plan | Task | Automated verify |
|------|------|------------------|
| 18-01 | 1 Wave 0 files | `test -f` three lib test files |
| 18-01 | 2 eligibility live-book | `vitest run lib/pricing/eligibility.test.ts` |
| 18-01 | 3 engine no invented classes | `vitest run lib/pricing/eligibility.test.ts lib/quote/engine.test.ts` |
| 18-02 | 1 git SQL unapplied | `rg` on `20260914190000_quote_rate_book_live_classes.sql` |
| 18-02 | 2 home DC + BookingBoard | `vitest run lib/pricing/public-live-book-board.test.ts` |
| 18-02 | 3 checkout + intent + KNOWN_CLASS_SLUGS | `vitest run lib/pricing/public-live-book-board.test.ts lib/ops/ops-dc-finalize.test.ts lib/quote/intent.test.ts lib/quote/schema.test.ts` |
| 18-03 | 1 no post-Publish fork | `vitest run lib/ops/publish-public-chf.test.ts` |
| 18-03 | 2 four tabs Draft/Discard/Publish | `vitest run lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-vat-field.test.ts` |
| 18-03 | 3 dual-DC invert Preview tests | `vitest run lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-source.test.ts lib/ops/ops-pricing-vat-field.test.ts lib/ops/publish-public-chf.test.ts` |
| 18-04 | 1 D-15 fixtures | `vitest run lib/pricing/d15-recipe.test.ts lib/pricing/lines.test.ts lib/pricing/bands.test.ts` |
| 18-04 | 2 band overlap 409 | `vitest run lib/ops/pricing.test.ts lib/pricing/bands.test.ts` |
| 18-04 | 3 drop region tab | `vitest run lib/ops/ops-pricing-tabs.test.ts lib/pricing/d15-recipe.test.ts` + typecheck |
| 18-05 | 1 place/canton + extra_stops 0\|1 | `vitest run lib/pricing/lines.test.ts lib/quote/schema.test.ts lib/checkout/extras-catalog.test.ts` |
| 18-05 | 2 Fixed routes tab + Mapbox | `vitest run lib/pricing/lines.test.ts lib/quote/schema.test.ts lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-vat-field.test.ts` |
| 18-06 | 1 git class photo SQL | `rg` on `20260914191000_vehicle_class_any_photo.sql` |
| 18-06 | 2 R2 classes/ + completeness | `vitest run lib/ops/photos.test.ts lib/ops/pricing.test.ts` |
| 18-06 | 3 one surcharges list | `vitest run lib/checkout/extras-catalog.test.ts lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-dc-finalize.test.ts lib/ops/ops-pricing-vat-field.test.ts` |
| 18-07 | 1 recap VAT extra-wait | `vitest run lib/checkout/extra-wait-no-offsession.test.ts lib/checkout/vat.test.ts lib/pricing/policy.test.ts lib/checkout/intent.test.ts` |
| 18-07 | 2 grep gates + typecheck | `vitest run lib/pricing lib/ops lib/checkout lib/quote` + typecheck |
| 18-07 | 3 [BLOCKING] owner SQL + owner UAT | `test -f` both migrations; owner Publish only |

---

## Wave 0 Requirements

- [ ] `apps/web/lib/pricing/` fixtures for D-15 examples (275.20 and 123)
- [ ] Source-read test: `OpsPricing.dc.html` has four tabs, no History, no Preview, no region table
- [ ] Source-read test: home/checkout do not hardcode economy/business/first/van as the offer list

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Delete class + Publish → no public card | D-31 D-27 | Agent must not Publish | Owner Publish on dashboard; quote on vamostaxi.site |
| Per-km change → next quote matches recipe | D-15 D-27 | Agent must not Publish | Owner sets start/per-km, Publish, new quote |
| New class appears after Publish | D-29 D-30 | Agent must not Publish | Owner adds class+photo, Publish, home shows it |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 / owner-gate
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] `nyquist_compliant: true`
- [ ] Feedback latency < 90s

**Approval:** pending
