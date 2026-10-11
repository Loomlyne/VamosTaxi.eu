---
phase: 04
slug: quote-pricing-engine
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-10-11
---

# Phase 04 — Validation Strategy (reconstructed, State B)

> Rebuilt after execution from 04-RESEARCH.md "Validation Architecture", the 16 PLANs and SUMMARYs, and the tests that exist on disk today. Every path below was checked with `ls`. Test files were not created or edited for this document. Paths are relative to `apps/web/` unless they start with `packages/`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (kernel + route contracts, colocated `lib/**/*.test.ts`) + pgTAP (`packages/db/supabase/tests/*.test.sql`) + Playwright (`tests/visual`, `tests/integration`) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`, `packages/db/supabase/config.toml` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/pricing lib/quote lib/geo lib/abuse` |
| **Full suite command** | `pnpm --filter web test && pnpm --filter @vamos/db run test:db && pnpm test:visual` |
| **DB without Docker** | `scripts/test-lab/lab.sh up <name>` then `lab.sh pgtap <name>` (CLAUDE.local.md) |
| **Estimated runtime** | Vitest ~10 s; pgTAP ~60 s; Playwright minutes |

Paths differ from the research plan: tests are colocated under `lib/`, not `tests/unit/api-*.test.ts` (those four names were never created). Wave 0 is complete: Vitest, `vitest.config.ts` and the `test` script exist.

---

## Sampling Rate

- **After every task commit:** `pnpm --filter web exec vitest run lib/pricing` (kernel) or the one touched `.test.sql`
- **After every plan wave:** `pnpm --filter web exec vitest run && pnpm --filter @vamos/db run test:db`
- **Before `/gsd-verify-work`:** full suite plus `pnpm test:visual`
- **Max feedback latency:** 60 s for unit/pgTAP

---

## Per-Requirement Verification Map

Plan column = plans whose frontmatter lists the requirement. Status is "covered" only where a file exists and asserts the behavior; this document did not re-run them (re-run before sign-off).

| Req | Behavior | Plans | Test Type | Automated Command | File Exists | Status |
|-----|----------|-------|-----------|-------------------|-------------|--------|
| QUOTE-01 | Search/pin, geometry returned; Directions 5xx/timeout is `route_unavailable`, no invented metres | 08, 11 | unit (mocked Mapbox) | `pnpm --filter web exec vitest run lib/geo/mapbox.test.ts lib/geo/suggest-route.test.ts lib/geo/session.test.ts lib/quote/pipeline.test.ts` | ✅ | covered |
| QUOTE-02 | Class eligibility by pax/bags, no eligible class is a labelled board; `mode: "hourly"` refused | 03, 05, 09, 11 | unit | `pnpm --filter web exec vitest run lib/pricing/eligibility.test.ts lib/quote/schema.test.ts lib/pricing/party-van-luxury-12.test.ts` | ✅ | covered |
| QUOTE-03 | Fixed route else per-km then min fare, then surcharges; ordering | 01, 02, 03, 04, 06, 10, 11, 12, 16 | unit | `pnpm --filter web exec vitest run lib/pricing/priceQuote.test.ts lib/pricing/lines.test.ts lib/pricing/bands.test.ts lib/pricing/predicates.test.ts lib/pricing/rateBook.test.ts lib/pricing/round.test.ts lib/pricing/d15-recipe.test.ts lib/pricing/one-form-fare-parts.test.ts` | ✅ | covered (no fast-check property test found; see gaps) |
| QUOTE-04 | Expired lock refused server-side; past `quote_lock_expires_at` raises even with open payment window | 05, 07, 13, 16 | unit + pgTAP | `pnpm --filter web exec vitest run lib/quote/lock.test.ts lib/quote/lock-secret.test.ts lib/checkout/lock-expire.test.ts` · `supabase test db packages/db/supabase/tests/quote_lock_clock.test.sql` (also `quote_lock_24h.test.sql`, `charge_gate.test.sql`) | ✅ | covered |
| QUOTE-05 | Same book, `computed_at` years apart is `JSON.stringify`-equal; snapshot total must equal sum of lines | 01, 02, 07, 13 | unit + pgTAP | `pnpm --filter web exec vitest run lib/pricing/priceQuote.test.ts` · `supabase test db packages/db/supabase/tests/snapshot_lines_reconcile.test.sql packages/db/supabase/tests/pricing_frozen.test.sql packages/db/supabase/tests/snapshot_shape.test.sql` | ✅ | covered (determinism is a case in `priceQuote.test.ts`, no `determinism.test.ts`) |
| QUOTE-06 | Seven named coupon refusals; released_at SET not DELETE; refused payment leaves no redemption row | 06, 09, 11, 12 | pgTAP | `supabase test db packages/db/supabase/tests/coupon_evaluate.test.sql` | ✅ | partial: seven refusals + release + no side effect covered; two-parallel-intents race on `global_limit = 1` NOT covered (GAP-1) |
| QUOTE-07 | `out_of_service_area`, `min_advance` with minutes, `service_area_undefined` fail-closed | 08, 09, 11, 12 | unit | `pnpm --filter web exec vitest run lib/geo/serviceArea.test.ts lib/geo/zurich-time.test.ts` | ✅ | covered |
| QUOTE-08 | Landing-time precedence, 400/404/503 leave pickup editable | 14 | n/a | `pnpm --filter web exec vitest run lib/flight/no-provider.test.ts lib/flight/format.test.ts lib/checkout/flight-no.test.ts` | ✅ | superseded (see below), not a gap |
| QUOTE-09 | 4/60 bare vs 8/60 verified cookie; unsigned/rotated cookie never buys a bucket; Turnstile from 3rd; breaker | 05, 09, 15 | unit | `pnpm --filter web exec vitest run lib/abuse/vamos-qs.test.ts lib/abuse/rate-limit.test.ts lib/abuse/quote-turnstile-live.test.ts lib/abuse/turnstile-grace-and-count.test.ts lib/abuse/breaker.test.ts` | ✅ | covered |
| QUOTE-10 | No live version: null totals, `pricing_not_live` 409, direct payment insert raises, `CHF 000` | 06, 07, 10, 11, 13, 16 | unit + pgTAP + Playwright | `pnpm --filter web exec vitest run lib/pricing/public-chf.test.ts lib/pricing/booking-board-null.test.ts lib/quote/intent.test.ts lib/checkout/charge-gate.test.ts` · `supabase test db packages/db/supabase/tests/charge_gate.test.sql packages/db/supabase/tests/rate_version_publish.test.sql` · `pnpm --filter web exec playwright test tests/visual/quote-flow.spec.ts` | ✅ | covered |
| QUOTE-11 | Child seat, extra stop, oversize each own line; return duplicates child seat/oversize on both legs; single-leg cancel reconstructs from row | 02, 04, 09, 11 | unit | `pnpm --filter web exec vitest run lib/pricing/lines.test.ts lib/pricing/priceQuote.test.ts lib/quote/no-extra-stop.test.ts lib/checkout/extras-g6.test.ts` | ✅ | covered (single-leg cancel reconstruction: only indirect, see GAP-3) |

---

## Wave 0 Requirements

- [x] Vitest, `apps/web/vitest.config.ts`, `test` script in `apps/web/package.json`
- [x] `lib/pricing/round.test.ts`, `eligibility.test.ts`, `priceQuote.test.ts`, `lines.test.ts` exist; serviceArea lives at `lib/geo/serviceArea.test.ts`
- [x] `packages/db/supabase/tests/quote_lock_clock.test.sql`, `snapshot_lines_reconcile.test.sql`, `charge_gate.test.sql`, `rate_version_publish.test.sql`
- [x] Playwright `tests/visual/quote-flow.spec.ts` asserts `CHF 000`
- [x] Coupon race: `packages/db/test/local/coupon-race.test.ts` (two real connections; GAP-1 closed 2026-10-11, found and fixed a deadlock via migration `20261011100000_coupon_cap_no_key_update.sql`)
- [ ] `lib/pricing/determinism.test.ts`, `lib/pricing/extras.test.ts`, `tests/unit/{api-geo,api-flight,quote-lock,abuse}.test.ts` were planned under those names; coverage lives in the files mapped above instead

---

## Gaps

| ID | Requirement | Gap | Action |
|----|-------------|-----|--------|
| GAP-1 (CLOSED 2026-10-11) | QUOTE-06 | No test runs two parallel PaymentIntent creations on a `global_limit = 1` coupon and asserts one 200, one 409, one `coupon_redemptions` row (`FOR UPDATE` serialisation). `coupon_evaluate.test.sql` is sequential only. | Add `coupon_race.test.sql` (needs two sessions; may need a Vitest DB test against the lab) |
| GAP-2 (CLOSED 2026-10-11: `lib/pricing/priceQuote.property.test.ts`, 9 properties) | QUOTE-03 | The research plan asks for property tests (percent-basis commutativity, pipeline order) with `fast-check`; no `fast-check` test was found under `lib/pricing`. Example-based cases exist. | Confirm with `grep -rn fast-check apps/web/lib`; add or accept example-based coverage |
| GAP-3 (OPEN: real bug, decision `.planning/decisions/2026-10-11-single-leg-refund-own-subtotal.md`, waits for jobs j7/j10) | QUOTE-11 | "Single-leg cancellation reconstructs its amounts from the row alone" has no test named for it in the Phase 4 files; related behavior sits in Phase 7/10 refund tests (`packages/db/supabase/tests/cancellation_refund_d02.test.sql`, `fare_line_reads.test.sql`), not verified against this claim. | Read those tests; if they assert per-leg amounts, cite them, else add one |

Superseded, not a gap: QUOTE-08 (flight status lookup). Owner decision 2026-10-05 removed the provider and `/api/flight` ("we just need flight number not tracking"); `lib/flight/no-provider.test.ts` pins that it stays removed. The requirement text in REQUIREMENTS.md should be updated by the planner.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mapbox Order / Search Box `permanent` terms (U33, U34) | QUOTE-01 | Account/commercial step | Owner confirms in Mapbox |
| Unit prices and live rate numbers (U35, U44) | QUOTE-03 | Owner never delegates rates; live `rate_version` 18 is "placeholder, not owner-approved" | Owner reviews and publishes |
| Zone rate-limit rule, CRS sensitivity, breaker ceiling (U36, U37, U54) | QUOTE-09 | Cloudflare zone config, real traffic | Owner/controller check in dashboard |
| `now()` freeze across `sql.begin` awaits (U46) | QUOTE-04 | Two-line psql probe | Run on lab DB |
| UAT items in `04-UAT.md` (status partial, items blocked when written) | QUOTE-01…11 | Needed a UI that did not exist then | Re-run as numbered type/click steps after deploy |

---

## Validation Sign-Off

- [x] Every requirement has an automated command or an explicit supersession
- [ ] No gaps open (GAP-3 still open; GAP-1 and GAP-2 closed)
- [ ] Mapped commands re-run green in one session (not done when this file was written)
- [ ] `nyquist_compliant: true` only after the gaps close

**Approval:** pending
