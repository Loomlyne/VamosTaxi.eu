---
phase: 11
slug: launch-cutover
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
---

# Phase 11 — Validation Strategy

> CONTEXT.md D-01…D-35 win. Host this phase is `vamostaxi.site`. Forget `.eu` as live host.
> Public `CHF 000` until OPS Publish sets `settings.public_chf`. Never invent CHF, UID, or legal.
> Stripe stays test. No JSON-LD. No Search Console. Never restore onto `yaumjzvylngfjhtuffqs`.
> Agent does not `apply_migration` / `supabase db push` — owner apply is a numbered gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (`apps/web`) + Playwright 1.62 (`apps/web/tests/integration`) |
| **Config file** | `apps/web/vitest.config.ts`; Playwright config under `apps/web` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/currency lib/checkout/vat lib/pricing lib/quote` |
| **Full suite command** | `pnpm --filter web exec vitest run` + Playwright `public-routes` `dev-exclusion` `ssr-locale` + `pnpm run typecheck` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter web exec vitest run` on files touched (vat / quote / currency / engine)
- **After every plan wave:** full Vitest + Playwright sitemap/robots specs
- **Before `/gsd:verify-work`:** full suite green **and** live `curl -I` on `https://vamostaxi.site` (no noindex) and `https://dashboard.vamostaxi.site` (noindex); public quote still `CHF 000` until owner Publish
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task IDs match execute plans `11-01`…`11-12` (ROADMAP split). Old 6-plan IDs (`11-02-01` engine, `11-03-*` SEO, `11-04-01` VAT, `11-05-01` extract, `11-06-01` owner apply) are remapped below. Threat IDs land in each PLAN.md `<threat_model>`. Rows ordered by execute wave.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | LAUNCH-06 D-18 D-19 D-23 | T-11-01 T-11-02 | Wave 0: `!public_chf` ⇒ public `pricing_live` false; `formatAmount(null)==="CHF 000"` | vitest files | `test -f apps/web/lib/pricing/public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | LAUNCH-06 D-18 | T-11-03 | Wave 0: both Publish paths set `settings.public_chf=true` in same staff tx; `PRICING_PREVIEW` does not | vitest files | `test -f apps/web/lib/ops/publish-public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | LAUNCH-05 D-03 D-04 D-30 D-31 | T-11-04 T-11-05 | Wave 0: public host no noindex; dashboard noindex; sitemap allowlist; no `/checkout` `/sign-in` `/account` | vitest/playwright files | `test -f apps/web/lib/seo/indexing.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | D-22 D-25 D-26 D-11 | T-11-06 T-11-07 | Wave 0: VAT default 81 bps; UID still TBC; no `info@vamostaxi.eu`; no `sk_live_`; wrangler does not bind `.eu`; dual OpsPricing VAT source-read exists | vitest files | `test -f apps/web/lib/checkout/vat.test.ts && test -f apps/web/lib/ops/ops-pricing-vat-field.test.ts` | ✅ extend | ⬜ pending |
| 11-02-01 | 02 | 2 | LAUNCH-06 D-18 D-19 D-22 | T-11-09 | Git migration `public_chf` + `vat_rate_bps` + quote-read RPC; agent does not apply | file + grep | `test -f packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql` | ❌ | ⬜ pending |
| 11-10-01 | 10 | 2 | D-25 D-26 D-27 D-28 | T-11-07 | Extracted copy; UID/licence TBC; no `.eu` mailbox; no become-a-partner; en→de/fr/ar | vitest | `pnpm --filter web exec vitest run lib/legal/extract-no-invent.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | LAUNCH-06 D-18 D-19 D-23 | T-11-01 T-11-02 | Engine ANDs live row with `settings.public_chf`; fail-closed if columns missing | vitest | `pnpm --filter web exec vitest run lib/pricing/public-chf.test.ts lib/quote/engine.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 3 | LAUNCH-06 D-18 | T-11-03 | Public host `preferDraft` false; `PRICING_PREVIEW` does not write `public_chf`; no `respond.ts` branch | vitest | `pnpm --filter web exec vitest run lib/quote/engine.test.ts lib/pricing/public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 3 | LAUNCH-06 D-18 | T-11-03 | Publish updates `rate_versions.status='live'` **and** `settings.public_chf=true`; completeness still blocks | vitest | `pnpm --filter web exec vitest run lib/ops/publish-public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-06-01 | 06 | 4 | LAUNCH-06 D-19 | T-11-01 T-11-02 | BookingBoard including PriceSummary passes **null** into `formatChfRappen` / `chfRappenToDisplay` when `!quote.pricing_live` | vitest source-read | `pnpm --filter web exec vitest run lib/pricing/booking-board-null.test.ts` | ❌ | ⬜ pending |
| 11-07-01 | 07 | 4 | LAUNCH-06 D-22 | T-11-06 | Injected bps on `vatOnTopRappen`; default 81; `okIntentResponse` JSON field `vat_rate_bps` | vitest | `pnpm --filter web exec vitest run lib/checkout/vat.test.ts` | ✅ extend | ⬜ pending |
| 11-07-02 | 07 | 4 | LAUNCH-06 D-22 | T-11-06 | Intent/receipt pass `loadLaunchFlags().vat_rate_bps`; intent JSON `vat_rate_bps` next to `amount_rappen` | vitest | `pnpm --filter web exec vitest run lib/checkout/vat.test.ts lib/quote/intent.test.ts` | ✅ | ⬜ pending |
| 11-05-01 | 05 | 5 | LAUNCH-05 D-03 D-04 | T-11-04 | After 11-06: `vamostaxi.site` / `www` have **no** `X-Robots-Tag: noindex`; dashboard always noindex | vitest + playwright | `pnpm --filter web exec vitest run lib/seo/indexing.test.ts` | ⚠️ rewrite `dev-exclusion.spec.ts` | ⬜ pending |
| 11-05-02 | 05 | 5 | LAUNCH-05 D-30 D-31 | T-11-05 | `sitemap.xml` = `/` about faq contact terms privacy imprint cookies cancellation only; `PUBLIC_ROUTES` unchanged | vitest | `pnpm --filter web exec vitest run lib/seo/indexing.test.ts` | ⚠️ rewrite | ⬜ pending |
| 11-08-01 | 08 | 5 | LAUNCH-06 D-16 D-22 | T-11-03 T-11-06 | Staff PATCH persists `vat_rate_bps`; extras JSON `vat_rate_bps`; CheckoutClient reads that field (not no-arg 81) | vitest | `pnpm --filter web exec vitest run lib/checkout/vat.test.ts` | ✅ | ⬜ pending |
| 11-09-01 | 09 | 6 | LAUNCH-06 D-16 D-22 | T-11-06 | OPS Pricing rail VAT 8.1 / `vat_rate_bps` / four-language labels / dual-copy equality | vitest `lib/**/*.test.ts` | `pnpm --filter web exec vitest run lib/ops/ops-pricing-vat-field.test.ts` | ❌ W0 | ⬜ pending |
| 11-11-01 | 11 | 7 | LAUNCH-06 D-16 | T-11-09 | Owner apply of SQL on `yaumjzvylngfjhtuffqs` — **agent stops**; then live curl 000 until Publish | manual + grep | migration file exists; no agent apply | ❌ | ⬜ pending |
| 11-12-01 | 12 | 8 | LAUNCH-05 LAUNCH-06 D-17 D-18 | T-11-08 | Owner says pricing is right, then Publish; Stripe stays test; no GSC; wrangler `.eu` unbound | grep + owner | wrangler no `.eu` / no `sk_live_`; owner Publish | ✅ grep | ⬜ pending |

No three consecutive tasks without an automated verify. 11-11 owner-apply is manual; 11-12 has automated wrangler/grep so it does not sit after two other manuals. Do not `vitest run tests/integration/ops-dc-pricing.spec.ts` (vitest excludes `*.spec.ts`; `passWithNoTests` fakes green).

---

## Wave 0 Requirements

- [ ] `apps/web/lib/pricing/public-chf.test.ts` — `!public_chf` ⇒ public not live; live row alone is not the flip
- [ ] `apps/web/lib/ops/publish-public-chf.test.ts` — Publish sets `public_chf`; preview does not
- [ ] `apps/web/lib/seo/indexing.test.ts` — host-split noindex + sitemap allowlist vs `PUBLIC_ROUTES`
- [ ] Extend `apps/web/lib/checkout/vat.test.ts` — injected bps; default 81
- [ ] `apps/web/lib/ops/ops-pricing-vat-field.test.ts` — readFileSync both OpsPricing.dc.html copies: VAT 8.1 / vat_rate_bps / four-language labels / dual-copy equality
- [ ] Rewrite `apps/web/tests/integration/dev-exclusion.spec.ts` public noindex expectations
- [ ] Rewrite `apps/web/tests/integration/public-routes.spec.ts` sitemap ≠ full `PUBLIC_ROUTES`
- [ ] Rewrite sitemap `/sign-up` assertion in `apps/web/tests/integration/auth-flows.spec.ts`
- [ ] Extract no-invent assertions (UID TBC, no `info@vamostaxi.eu`, no partner route)

Existing infrastructure covers currency `formatAmount(null)` and vat 8.1% identities. Do not add a second money formatter. Do not `supabase db push`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner apply migration `public_chf` + `vat_rate_bps` on `yaumjzvylngfjhtuffqs` | LAUNCH-06 | Live Zurich; agent must not apply | Numbered owner sitting. Agent stops. Never restore onto this project. |
| Owner says OPS Pricing is right, then Publish | D-17 D-18 | Fare book is owner data | `https://dashboard.vamostaxi.site/pricing` — owner click Publish. Public then shows book CHF. Until then `CHF 000`. |
| Live `curl -I https://vamostaxi.site` has no `X-Robots-Tag: noindex` | D-03 | Staging Worker is the live host | After deploy to Worker `vamos`. Dashboard host still noindex. |
| `curl -I https://www.vamostaxi.site` is 301 to apex | D-05 | Zone may already do it | Only number a DNS click if broken. Do not touch DNS speculatively. |
| Stripe remains test | D-11 | Secrets are owner terminal | `pk_test_` on Worker `vamos`. No `wrangler secret put` live keys this phase. |
| Search Console submit | D-29 | Owner Google account | **Not this phase.** Remind after all V1 phases. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
