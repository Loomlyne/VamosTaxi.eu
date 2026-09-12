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

Task IDs below are the contract the planner must keep (or split with a mapping note). Threat IDs land in each PLAN.md `<threat_model>`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | LAUNCH-06 D-18 D-19 D-23 | T-11-01 T-11-02 | Wave 0: `!public_chf` ⇒ public `pricing_live` false; `formatAmount(null)==="CHF 000"` | vitest files | `test -f apps/web/lib/pricing/public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | LAUNCH-06 D-18 | T-11-03 | Wave 0: `publishRateVersion` sets `settings.public_chf=true` in same staff tx; `PRICING_PREVIEW` does not | vitest files | `test -f apps/web/lib/ops/publish-public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | LAUNCH-05 D-03 D-04 D-30 D-31 | T-11-04 T-11-05 | Wave 0: public host no noindex; dashboard noindex; sitemap allowlist; no `/checkout` `/sign-in` `/account` | vitest/playwright files | `test -f apps/web/lib/seo/indexing.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | D-22 D-25 D-26 D-11 | T-11-06 T-11-07 | Wave 0: VAT default 81 bps; UID still TBC; no `info@vamostaxi.eu`; no `sk_live_`; wrangler does not bind `.eu` | vitest files | `test -f apps/web/lib/checkout/vat.test.ts` | ✅ extend | ⬜ pending |
| 11-02-01 | 02 | 2 | LAUNCH-06 D-18 D-19 D-23 | T-11-01 T-11-02 | Engine ANDs live row with `settings.public_chf`; public `preferDraft` false | vitest | `pnpm --filter web exec vitest run lib/pricing lib/quote` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | LAUNCH-06 D-18 | T-11-03 | Publish updates `rate_versions.status='live'` **and** `settings.public_chf=true`; completeness still blocks | vitest | `pnpm --filter web exec vitest run lib/ops/publish-public-chf.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 2 | LAUNCH-05 D-03 D-04 | T-11-04 | `vamostaxi.site` / `www` have **no** `X-Robots-Tag: noindex`; dashboard always noindex; `DEPLOY_ENV=staging` stays | vitest + playwright | `pnpm --filter web exec vitest run lib/seo/indexing.test.ts` | ⚠️ rewrite `dev-exclusion.spec.ts` | ⬜ pending |
| 11-03-02 | 03 | 2 | LAUNCH-05 D-30 D-31 | T-11-05 | `sitemap.xml` = `/` about faq contact terms privacy imprint cookies cancellation only; `PUBLIC_ROUTES` unchanged | playwright | Playwright `public-routes` sitemap count | ⚠️ rewrite | ⬜ pending |
| 11-04-01 | 04 | 3 | LAUNCH-06 D-22 | T-11-06 | Checkout uses `settings.vat_rate_bps` with fallback 81; owner % on OPS Pricing rail | vitest | `pnpm --filter web exec vitest run lib/checkout/vat` | ✅ extend | ⬜ pending |
| 11-05-01 | 05 | 4 | D-25 D-26 D-27 D-28 | T-11-07 | Extracted copy; UID/licence TBC; no `.eu` mailbox; no become-a-partner; en→de/fr/ar | grep + page | imprint has PendingSlot; no `info@vamostaxi.eu` | ❌ W0 | ⬜ pending |
| 11-06-01 | 06 | 5 | LAUNCH-06 D-16 | T-11-01 | Owner apply of SQL on `yaumjzvylngfjhtuffqs` — **agent stops**; then live curl 000 until Publish | manual + grep | migration file exists; no agent apply | ❌ | ⬜ pending |

No three consecutive tasks without an automated verify. Plan 06 owner-apply is manual; it must not sit after two other manuals.

---

## Wave 0 Requirements

- [ ] `apps/web/lib/pricing/public-chf.test.ts` — `!public_chf` ⇒ public not live; live row alone is not the flip
- [ ] `apps/web/lib/ops/publish-public-chf.test.ts` — Publish sets `public_chf`; preview does not
- [ ] `apps/web/lib/seo/indexing.test.ts` — host-split noindex + sitemap allowlist vs `PUBLIC_ROUTES`
- [ ] Extend `apps/web/lib/checkout/vat.test.ts` — injected bps; default 81
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
