---
phase: 03-hyperdrive-data-access-wiring
plan: 07
subsystem: database
tags: [hyperdrive, cloudflare-workers, supabase, data-05, data-06, wae]

requires:
  - phase: 03-hyperdrive-data-access-wiring (plans 03-01..03-06)
    provides: withIdentity, isolation probe, deployed harness, local fences
provides:
  - Three staging Hyperdrive configs on direct :5432 (rls/public/probe)
  - Deployed DATA-06 adjacency proof (customer, guest, staff)
  - Deployed DATA-05 WAE p50 from vamos-web-staging
affects: [Phase 4, Phase 5, Phase 6]

tech-stack:
  added: []
  patterns:
    - "resetPooledSession on Hyperdrive checkout (D-01); one round-trip set_config(role=session_user) plus GUC clears"
    - "DATA-05 p50 is quantileExactWeighted over vamos_db_latency, never a local timer"

key-files:
  created: []
  modified:
    - packages/db/src/identity.ts
    - packages/db/test/deployed/data-06-isolation.test.ts
    - packages/db/test/support/drive.ts
    - packages/db/vitest.config.ts
    - apps/web/wrangler.jsonc
    - apps/web/lib/db/identity.ts
    - .github/workflows/deploy-staging.yml

key-decisions:
  - "Hyperdrive Free is 100k queries/day UTC; isolation runs exhausted it. Workers Paid ($5) or wait until 00:00 UTC."
  - "Staff A1 own-rows skipped until Phase 6 TOTP/aal2; A2–A4 still apply."
  - "Host placement triangulated FRA (p50 47 ms). Region aws:eu-central-2 placed ZRH (p50 23 ms last 15 min)."
  - "V5 GraphQL 401 on CF_ANALYTICS_TOKEN: fallback is allowlist caching.disabled + distinctPids>1."
  - "DATA-06 proven for the isolation probe Worker only (U31 / Phase 5)."

patterns-established:
  - "Do not mark DATA-05 from an all-time WAE mix that includes a failed placement window."

requirements-completed: [DATA-05, DATA-06]

duration: multi-session
completed: 2026-08-28
---

# Phase 3 Plan 7: Staging Hyperdrive, DATA-06, DATA-05

**Staging Worker reaches hosted Postgres through Hyperdrive; concurrent identities do not leak; ZRH p50 is under 30 ms.**

## Performance

- **Completed:** 2026-08-28
- **Tasks:** owner provision + configs + deploy + measured gates

## Accomplishments

- Three Hyperdrive configs on `db.yaumjzvylngfjhtuffqs.supabase.co:5432` (never `:6543`): rls 20 / public 12 / probe 5, probe cache-disabled.
- `vamos-web-staging` and `vamos-isolation-probe-staging` deployed (`workers.dev`).
- Negative controls 8/8 locally against the probe.
- DATA-06: customer and guest N=400 S≥200 no leak; staff N=500 **S=265** distinctPids=6 peakInFlight=32, vitest passed (2026-08-28).
- DATA-05: after reverting host→region, `cf-placement=remote-ZRH`. WAE last 15 min **p50 = 23 ms** (n=35, p95=35, blob1=anon). Bar < 30. Earlier region-only 34 ms and host/FRA 47 ms stay on record; all-time mix is polluted by FRA.

## Findings (not blockers for the two ROADMAP criteria)

- Staff own-row A1 empty until Phase 6 MFA.
- `CF_ANALYTICS_TOKEN` GraphQL 401; V5 falls back to pinned `caching.disabled`.
- GitHub Actions `data-06` job is in `deploy-staging.yml`; repository secrets/vars not filled (owner).
- DATA-06 is the probe, not OpenNext product routes.

## Do not

- Tick live `vamostaxi.eu` DNS.
- Set GitHub secrets until the owner says so.
- Flip `pricing_live`.
