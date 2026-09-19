# Phase 19: V1 production close-out leftover live gates and 10k booking surge - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Leftover V1 live close (16 paper, 17 Worker + SQL + UAT) plus a **new** surge proof: **10k concurrent checkouts** (quote → pay at once), not Phase 10’s 10k concurrent **browsers**.

Paper (CONTEXT, RESEARCH, UI-SPEC, PLAN.md) is allowed while 17 is still stale on Worker `vamos`. **Execute of 19 is not.** Live 19 waits until 17-C UAT is green **and** paid Hyperdrive is on the account.

This phase does not ship `vamostaxi.eu` DNS, `env.production`, live Stripe keys, OPS Publish, GSC submit, JSON-LD, a driver app, auto-dispatch, Staff, or a practice restore onto `yaumjzvylngfjhtuffqs`.

</domain>

<decisions>
## Implementation Decisions

### Surge definition
- **D-01:** “10k people booking at the same time” means **10k concurrent checkouts** that complete quote → pay (test Stripe). Not 10k browsers. Not 10k quotes/day. Not Phase 10 LAUNCH-01 cache of marketing HTML.
- **D-02:** A concurrent checkout is one in-flight funnel: home quote lock → details → pay (dummy card) → confirmation. Guest checkout counts. Return trips stay out of V1.
- **D-03:** Proof host is `vamostaxi.site` / Worker `vamos`. Never `.eu`.

### Capacity (owner buy)
- **D-04:** Free Hyperdrive (100k queries/day) cannot succeed 10k concurrent checkouts. Koss **buys paid Hyperdrive** and confirms Stripe test-mode + Mapbox quotas in writing before any 19 execute. Agent does not create paid accounts or click billing.
- **D-05:** Until D-04 is true, leftover 17 may still deploy/apply/UAT. 19 execute stays parked (owner-wait, not a product bug).
- **D-06:** Direct Postgres only (Hyperdrive, never Supavisor `:6543`). Printed Worker name stays `vamos`. Do not recreate `vamos-web-staging`.

### Fail closed
- **D-07:** If quota, Stripe, Mapbox, or Hyperdrive is exceeded during ramp: **fail closed**. HTTP 429 / wait-room with a next step. No invented CHF. No silent 200. No charging a booking that did not persist.
- **D-08:** Do not disable `QUOTE_RATE_LIMITER` (8/60 verified, 4/60 bare, per colo) to fake 10k from one IP. Load uses many clients. No public load-test URL.
- **D-09:** Charge currency is always CHF. Public display stays `CHF 000` until owner Publish (`settings.public_chf`). Live `rate_versions` id 5 is not that flip.

### 11-12 / Stripe
- **D-10:** 11-12 owner Publish stays **parked**. Agent never clicks Publish. Stripe on Worker `vamos` stays **test**. No `sk_live_`. No GSC.

### Leftover live close (still this sitting’s spine)
- **D-11:** Live order stays: 17 deploy Worker `vamos` from `main` (#41) → owner apply `20260918140000_ops_chauffeur_desk.sql` → 17-UAT tests 4–8 → tick ROADMAP Phase 16 (16-UAT already 10/10).
- **D-12:** Do not `state.begin-phase` onto 19 while 17 live UAT is open. Do not `supabase db push`. Never restore onto `yaumjzvylngfjhtuffqs`.

### Chrome
- **D-13:** No new public screens. Funnel chrome frozen. UI-SPEC is observation + fail-closed copy on existing quote/checkout/wait-room surfaces. Four languages same sitting if any copy is added. Overlay verbs unchanged (`Keep editing`; never CTA `Save` / `Cancel` / `OK`).
- **D-14:** Home still wipes previous quote on `/`. Extras default off. `/checkout/trip` is never a booking row.

### Claude's Discretion
- Hyperdrive SKU, exact Stripe/Mapbox quota numbers after Koss pastes them, load-tool choice, whether wait-room is the existing voucher wait-room or a 429 page, query-count per checkout. Must match D-01…D-14.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase lock
- `.planning/phases/19-v1-production-close-out-leftover-live-gates-and-10k-booking-/19-CONTEXT.md` — this file; D-01…D-14 win on conflict
- `.planning/ROADMAP.md` — Phase 19 goal, HARD GATE, success criteria
- `.planning/phases/10-hardening-performance-security-compliance/10-CONTEXT.md` — D-23 is **browsers**, not this phase
- `.planning/phases/17-ops-chauffeur-profile-shift-roster-two-driver-vehicles/17-CONTEXT.md` — leftover desk
- `.planning/phases/16-staging-mx-end-to-end-uat/16-UAT.md` — 10/10

### Live kernel
- `apps/web/lib/abuse/rate-limit.ts` — 8/60 and 4/60 per colo
- `apps/web/app/api/quote/route.ts` — quote pipeline
- `apps/web/wrangler.jsonc` — Hyperdrive binds, Worker name `vamos`
- `CLAUDE.md` — `--vt-*`, `CHF 000`, four languages

</canonical_refs>

<code_context>
## Existing Code Insights

- Phase 10 cached marketing HTML so 10k **browsers** barely touch Postgres. Checkout is uncached (`no-store`). 10k concurrent pays is a different bottleneck: Hyperdrive + Stripe + Mapbox + quote limiter.
- Quote limiter is per-IP per-colo, not a global 10k cap. A single-origin k6 hammer hits 4–8/60 immediately.
- Hosted live `rate_version` is id 5. Do not invent CHF.
- Live Zurich already has real paid bookings. Surge proof uses **test Stripe** only.

</code_context>
