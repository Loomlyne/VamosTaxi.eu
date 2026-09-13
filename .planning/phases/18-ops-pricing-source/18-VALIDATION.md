---
phase: 18
slug: ops-pricing-source
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
---

# Phase 18 — Validation Strategy

> CONTEXT.md D-01…D-40 win. Host is `vamostaxi.site` / `dashboard.vamostaxi.site`. Forget `.eu`.
> Public `CHF 000` until owner Publish sets `settings.public_chf`. Never invent CHF, legal, or mail copy.
> Stripe stays test. Agent does not `apply_migration` / `supabase db push` — owner apply is a numbered gate.
> Absorb leftover `04.3-01-PLAN.md`. Do not execute it as a separate phase.
> Planner may remap task IDs — keep this table in lockstep.

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

Task IDs are the intended execute split. Remap if the planner splits PLAN.md files.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | D-11 D-12 D-13 D-14 | T-18-01 | Wave 0: kernel fixtures for start + all-km per-km + per-class bands; no `DISTANCE_FLOOR_KM`; 1 km same recipe; roundHalfUp rappen | vitest files | `test -f apps/web/lib/pricing/lines.test.ts && test -f apps/web/lib/pricing/bands.test.ts` | ✅ extend | ⬜ pending |
| 18-01-02 | 01 | 1 | D-08 | T-18-02 | Wave 0: completeness gaps = name/start/per-km/max pax + empty rows; **not** `min_fare_rappen` | vitest files | `pnpm --filter web exec vitest run lib/ops` | ✅ extend | ⬜ pending |
| 18-01-03 | 01 | 1 | D-27 D-28 D-31 | T-18-03 | Wave 0: source-read five tabs, no `/coupons` sidebar, no charcoal placeholder, `Publish fare book` | vitest source-read | `pnpm --filter web exec vitest run lib/ops` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | D-14 D-19 D-08 | T-18-04 | Git migration: `distance_bands.vehicle_class_id`; drop min_fare from publish trigger; class insert allowed. **Agent does not apply** | file + grep | `test -f packages/db/supabase/migrations/*ops_pricing*.sql` | ❌ | ⬜ pending |
| 18-03-01 | 03 | 3 | D-11 D-12 D-13 D-14 D-15 D-17 | T-18-01 | `lines.ts`/`bands.ts` implement D-11; bands per class on top of all km; inclusive/exclusive per D-14; region % of start+km+bands; fixed route wins | vitest | `pnpm --filter web exec vitest run lib/pricing` | ✅ | ⬜ pending |
| 18-04-01 | 04 | 4 | D-01 D-02 D-03 D-06 D-07 | T-18-05 T-18-06 | Publish tx: completeness 409 with exact gaps; VAT + public_chf only here; clone new draft; dispatcher 404 | vitest | `pnpm --filter web exec vitest run lib/ops` | ✅ extend | ⬜ pending |
| 18-05-01 | 05 | 4 | D-03 D-04 D-19 D-20 D-34 | T-18-06 T-18-07 | Overlay save = draft. Settings VAT PATCH does not flip public VAT. Coupons versioned with draft. Class POST on draft. Lock hours→minutes at boundary | vitest | `pnpm --filter web exec vitest run lib/ops` | ✅ extend | ⬜ pending |
| 18-06-01 | 06 | 5 | D-27…D-32 D-18 D-28 | T-18-03 T-18-08 | DC rebuild: five tabs, header Discard+Publish, rail VAT+preview, CHF only, no EUR keys, `/coupons` gone | vitest source-read | `pnpm --filter web exec vitest run lib/ops` | ❌ W0 | ⬜ pending |
| 18-07-01 | 07 | 6 | D-35 D-36 D-37 D-39 | T-18-09 | After Publish, extras list = surcharge rows; extra stop re-runs distance recipe; service area both pins inside | vitest | `pnpm --filter web exec vitest run lib/pricing lib/quote lib/checkout` | ✅ extend | ⬜ pending |
| 18-08-01 | 08 | 6 | D-20 D-22 D-23 D-24 | T-18-10 | Lock hours; unpaid auto-cancel; webhook after expiry does not capture; price-changed mail **skipped until owner copy** (no invented English) | vitest | `pnpm --filter web exec vitest run lib/quote lib/checkout` | ✅ extend | ⬜ pending |
| 18-09-01 | 09 | 7 | D-38 | T-18-11 | Extra wait CHF 0 at pay; **no** off-session capture this phase | vitest + grep | `pnpm --filter web exec vitest run lib/checkout` | ✅ extend | ⬜ pending |
| 18-10-01 | 10 | 8 | D-40 | T-18-12 | Owner apply + live `/pricing` UAT. Public still `CHF 000` until owner Publish. Stripe test. No `.eu`. Worker `vamos` | grep + owner | wrangler name `vamos`; no `sk_live_`; no `.eu` zone bind | ✅ grep | ⬜ pending |

No three consecutive tasks without an automated verify. 18-02 owner-apply is manual; 18-01 and 18-03 sit around it. 18-10 has grep so it is not a third manual in a row.

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
