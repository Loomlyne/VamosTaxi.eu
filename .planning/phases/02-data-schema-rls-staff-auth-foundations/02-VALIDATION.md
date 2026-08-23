---
phase: 2
slug: data-schema-rls-staff-auth-foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP, run via `supabase test db` (Supabase CLI — pinned in Wave 0 as an exact-version devDependency, `pnpm add -D -w supabase`; CI mirrors the pin with `supabase/setup-cli@v1`) |
| **Config file** | `packages/db/supabase/config.toml` — none exists yet; Wave 0 creates it with `supabase init` |
| **Quick run command** | No per-file flag for `supabase test db` is confirmed anywhere in the phase research — the quick command is the same full run: `supabase test db` |
| **Full suite command** | `supabase db reset && supabase test db` |
| **Estimated runtime** | ~30–60 seconds (local Postgres reset + migration replay + pgTAP pass) — no measured baseline yet |

---

## Sampling Rate

- **After every task commit:** Run `supabase test db`
- **After every plan wave:** Run `supabase db reset && supabase test db`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the `pr.yml` CI job (`db reset` → `test db` → `gen types typescript --local` + `git diff --exit-code`) green on the phase's final PR
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | P1 | 1 | DATA-01 | D2 / — | Extensions, roles and helpers exist so a migration can be written against the database at all | pgTAP | `supabase test db` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner fills in the remaining task rows (one per task ID across P1–P7) when 02-RESEARCH.md is turned into per-plan PLAN.md files.*

---

## Wave 0 Requirements

- [ ] Framework install: `pnpm add -D -w supabase` (pinned exact version) + `supabase/setup-cli@v1` in CI — `packages/db/supabase/` does not exist yet in this repo
- [ ] `packages/db/supabase/config.toml` — created by `supabase init`
- [ ] `packages/db/supabase/tests/extensions.test.sql` — P1, `citext`/`pgcrypto`/`btree_gist`/`pgtap` bootstrap
- [ ] `packages/db/supabase/tests/staff_hook_claim.test.sql` — P2, AUTH-05
- [ ] `packages/db/supabase/tests/rate_version_publish.test.sql` — P3, QUOTE-10 publish gate
- [ ] `packages/db/supabase/tests/exclusion.test.sql` — P4, OPS-03
- [ ] `packages/db/supabase/tests/reference_format.test.sql` — P4, `VT-YY-####` reference generator
- [ ] `packages/db/supabase/tests/charge_gate.test.sql` — P5, QUOTE-10 charge-gate trigger
- [ ] `packages/db/supabase/tests/append_only.test.sql` — P5, DATA-08 foundation
- [ ] `packages/db/supabase/tests/consent_write.test.sql` — P5, `consent_log` append-only write
- [ ] `packages/db/supabase/tests/bookings_customer_rls.test.sql` — P6, DATA-02
- [ ] `packages/db/supabase/tests/bookings_manage_token_rls.test.sql` — P6, DATA-03
- [ ] `packages/db/supabase/tests/ops_role_rls.test.sql` — P6, DATA-04
- [ ] `packages/db/supabase/tests/ops_write_denied.test.sql` — P6, DATA-04
- [ ] `packages/db/supabase/tests/customer_columns.test.sql` — P6, DATA-02 column-level exposure
- [ ] `packages/db/supabase/tests/settings_public.test.sql` — P6, DATA-04 public settings read
- [ ] `packages/db/supabase/tests/fail_closed.test.sql` — P6, D2 fail-closed grants
- [ ] `packages/db/supabase/tests/seed_idempotent.test.sql` — P7, DATA-07
- [ ] `pr.yml` CI job: `supabase start` → `supabase db reset` → `supabase test db` → `supabase gen types typescript --local` + `git diff --exit-code` — no Supabase command runs in any workflow today

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Managed Supabase's `postgres` role can run `grant authenticated to vamos_edge with inherit false, set true` (U1) | DATA-02/03/04 (blocks the roles migration) | Not documented for the managed role's own privileges; only provable against a real project | Run the exact statement in the staging SQL editor before P1 is written. If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated` and swap every `TO authenticated` in P6 |
| `supabase db push --include-seed` re-run semantics on a real project (U3) | DATA-07 | CLI reference documents the flag but not whether it re-runs the seed on every push; only answerable against staging | `supabase db push --include-seed --dry-run` against a scratch project, then a real second push, diff row counts |
| Custom Access Token Hook is actually invoked by the auth server (U15) | AUTH-05 | pgTAP can call the hook function directly and assert the claim comes back, but hook *enablement* is a dashboard setting ("Authentication → Hooks (Beta)"), not a local-suite fact | Confirm the hook is enabled against the live Supabase dashboard when wiring staff auth; pin the CLI/config version used |
| DATA-06 (no identity leak across a pooled Hyperdrive connection) | DATA-06 (Phase 3) | Needs the `HYPERDRIVE_NOCACHE` binding and a deployed Worker; Phase 2 only makes the proof possible (privilege-less `vamos_edge` role + `revoke all` baseline) | Deferred to Phase 3: 200-concurrent-transaction residue probe against the deployed Worker |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
