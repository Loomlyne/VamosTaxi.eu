---
phase: 3
slug: hyperdrive-data-access-wiring
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-23
updated: 2026-08-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Synced verbatim from `03-RESEARCH.md` § Validation Architecture (lines 2090–2156) after the
> plan-checker pass (0 blockers, 2 warnings — this sync is warning 1's fix). The seven plans
> implement exactly this contract; the checker independently verified Dimension 8 checks
> 8a–8d against the plans (19/19 automated verifies present, no watch-mode, sampling
> continuity holds, no MISSING markers).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Three, by layer. **Vitest** (`environment: node`) for `packages/db` unit tests, the connection-reuse simulator and the deployed isolation harness — **not a dependency anywhere in this repo today** (`grep -rn vitest package.json apps/web/package.json packages/*/package.json` returns nothing), so it is a Wave 0 install. **pgTAP** via the Supabase CLI (2.109.1 locally, local Postgres 17.6) for the SQL-provable half. **Playwright** 1.62.1, already in `apps/web` devDependencies, for web-facing checks only — never the DATA-06 vehicle (`isolation-proof.md` §7.1) |
| Config file | `packages/db/vitest.config.ts` — does not exist. `packages/db/supabase/config.toml` — created by Phase 2 Wave 0 at `packages/db/supabase/` (Phase 2 D-38), not by this phase. `apps/web/playwright.config.ts` — exists |
| Quick run command | `pnpm --filter @vamos/db exec vitest run test/local/connection-reuse.test.ts` for the simulator; `pnpm --filter @vamos/db exec supabase test db supabase/tests/fail_closed.test.sql` for one pgTAP file — `supabase test db` accepts file and directory arguments, so a single file is a real quick run |
| Full suite command | `pnpm --filter @vamos/db exec supabase db reset && pnpm --filter @vamos/db exec supabase test db && pnpm --filter @vamos/db exec vitest run test/local && pnpm --filter @vamos/db run mutation-gate` |
| Estimated runtime | Local: ~1–3 min (reset + migration replay + pgTAP + the simulator's pinned-backend iterations + two mutant apply/rollback cycles). Deployed: not measurable until P6 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-05 | Queries reach Postgres through Hyperdrive on the **direct** string — `origin.port === 5432`, never 6543, and both configs point at the same database | config assertion | `pnpm --filter @vamos/db exec vitest run test/deployed/config-preconditions.test.ts` | ❌ Wave 0 |
| DATA-05 | p50 round-trip under 30 ms from the staging Worker | WAE percentile query | `quantileExactWeighted(0.5)(double1, _sample_interval)` over `vamos_db_latency` via the Analytics Engine SQL API (D32) | ❌ Wave 0 — **DEFERRED**, needs a deployed Worker (P6) |
| DATA-06 | Request-scoped identity cannot survive onto the next request on the same backend — deterministic residue check on a pinned (`sql.reserve()`d) connection through the **shipped** `withIdentity` (D77) | integration (local) | `pnpm --filter @vamos/db exec vitest run test/local/connection-reuse.test.ts` | ❌ Wave 0 |
| DATA-06 | Two concurrent requests as two different customers over the pooled Hyperdrive connection never see each other's row, with an asserted cross-customer adjacency floor `S` | integration (deployed) | `pnpm --filter @vamos/db exec vitest run test/deployed/data-06-isolation.test.ts` | ❌ Wave 0 — **DEFERRED** to P6 |
| DATA-06 | The suite goes **red** against every mutant (NC1 `session_in_txn`, NC2, NC3, NC6, M1 grant layer removed, M2 policy predicate weakened, `is_local=false`) and never leaves a hazard unobserved (D38) | mutation gate + negative controls | `pnpm --filter @vamos/db run mutation-gate` (local M1/M2); `… vitest run test/deployed/negative-controls.test.ts` (NC1–NC6, deferred) | ❌ Wave 0 |
| DATA-02/03/04 *(carried from Phase 2, must stay true under this wiring)* | A forgotten wrapper raises SQLSTATE `42501` and returns no row; a lost `BEGIN` fails to set identity rather than leaking it | pgTAP | `pnpm --filter @vamos/db exec supabase test db supabase/tests/fail_closed.test.sql supabase/tests/cross_claim.test.sql supabase/tests/set_local_without_begin.test.sql` | ❌ Wave 0 |
| DATA-03 / AUTH-05 *(U61)* | Guest and staff pairs appear in the adjacency set, and the entry probe asserts `request.vamos.manage_token_hash` is EMPTY on entry | integration (deployed) | `… vitest run test/deployed/data-06-isolation.test.ts` (ENTRY_PROBE assertions) | ❌ Wave 0 — DEFERRED to P6 |
| *(forward check, no req id)* | No identity import on a statically-rendered route; no module-scope client; no `sql.reserve()` / `sql.end()` / `set_config(…, false)` / bare `SET ROLE` in app code; no raw `postgres` import outside the two `packages/db` modules | CI grep + ESLint | the grep block in `## What Phase 3 must produce` item 10, wired into `pr.yml`; `pnpm typecheck` | ❌ Wave 0 |
| *(forward check, D82)* | The probe Worker, its `dist`, and `PROBE_SECRET` are absent from any production build | CI grep | the three `deploy-production.yml` gates in `isolation-proof.md` §13 | ❌ Wave 0 |
| *(forward check, U31 → Phase 5)* | Isolate-level memoisation of customer-scoped reads once real routes exist | integration + CI grep | Phase 5: re-point the harness at `/api/account/bookings`; grep module-scope `Map`/`Set`/`cache`/`memo`/`store` under `apps/web` | ❌ Not this phase |

### Sampling Rate
- **Per task commit:** the relevant quick run — one Vitest file, or one pgTAP file via
  `supabase test db <path>`
- **Per wave merge:** `supabase db reset && supabase test db && vitest run test/local && pnpm
  run mutation-gate` (all from `packages/db`), plus `pnpm typecheck` and the CI grep block
- **Phase gate:** the full local suite green in `pr.yml` before `/gsd:verify-work` — and P6's
  deployed jobs (config preconditions → negative controls → isolation gate) green, **or** the
  phase summary carrying the literal line `DATA-05 p50 = DEFERRED (no staging Worker)` and P6
  left unmarked. A green local run is not the ROADMAP gate.

### Wave 0 Gaps
`packages/db` currently contains exactly two files — `package.json` (`"main": "index.ts"`,
pointing at a file that does not exist) and `README.md`. There is **no test infrastructure of
any kind** in that package. Phase 2's Wave 0 installs the Supabase CLI and bootstraps pgTAP at
`packages/db/supabase/`; Phase 3's Wave 0 must install Vitest, which is absent from every
manifest in the repo.

- [ ] Framework install: `pnpm add -D --filter @vamos/db vitest` (pinned exact, no `^`) — plus
      `postgres` as a real dependency and the `exports` map, per D80, or nothing imports
- [ ] `packages/db/vitest.config.ts` — `environment: "node"`, `include: ["test/**/*.test.ts"]`,
      no Playwright, no `vitest-pool-workers` (D33)
- [ ] `packages/db/package.json` scripts — `test`, `test:local`, `mutation-gate`, and the
      `supabase` CLI wrappers so every call runs from one working directory (Phase 2 D-38)
- [ ] `packages/db/test/local/connection-reuse.test.ts` — DATA-06 local half
- [ ] `packages/db/test/fixtures/two-customers.ts` — schema-legal per D81
- [ ] `packages/db/test/support/drive.ts`, `test/support/hyperdrive-metrics.ts`
- [ ] `packages/db/test/deployed/config-preconditions.test.ts` — DATA-05 direct-string assertion
- [ ] `packages/db/test/deployed/negative-controls.test.ts` — NC1–NC6, mutants vs hazards (D38)
- [ ] `packages/db/test/deployed/data-06-isolation.test.ts` — skipped unless `PROBE_BASE_URL`
- [ ] `packages/db/supabase/tests/fail_closed.test.sql` — `42501` on a forgotten wrapper
- [ ] `packages/db/supabase/tests/cross_claim.test.sql` — DATA-06 SQL half
- [ ] `packages/db/supabase/tests/set_local_without_begin.test.sql` — lost-`BEGIN` behaviour
- [ ] `packages/db/mutants/M1_grant_layer_removed.sql`, `M2_policy_predicate_weakened.sql`
- [ ] `packages/db/scripts/mutation-gate.mjs` — applies each mutant, asserts red, rolls back
- [ ] `pr.yml` local jobs (`supabase start` → `supabase test db` → `vitest run test/local` →
      `mutation-gate`) appended to the existing single `gate` job
- [ ] Manual / staging only, no local test: **U1** and **U3** (Phase 2's managed-project probes),
      **U23** (`hyperdrive update --caching-disabled`), **U25** (region hint sufficiency),
      **U27/U28** (Hyperdrive `RESET` and abandoned-transaction behaviour, measured by NC1/NC4),
      **U29** (Auth `createUser` addresses), **U30** (Placement Hints on the Free plan), **U32**
      (`show max_connections;` before the first `hyperdrive create`)

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checker-verified 19/19)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency: quick runs single-file; full local suite ~1–3 min by design (mutation gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-24 (plan-checker pass: 0 blockers)
