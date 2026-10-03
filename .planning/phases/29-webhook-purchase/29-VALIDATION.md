---
phase: 29
slug: webhook-purchase
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-03
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> The requirement → test map is `29-RESEARCH.md` § Validation Architecture. The planner fills the per-task map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/web, packages/db); pgTAP via `supabase test db` on an own native stack |
| **Config file** | `apps/web/vitest.config.ts`; `packages/db/supabase/tests/*.test.sql` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/meta lib/checkout/settle.test.ts lib/checkout/return-settle.test.ts lib/db/system-reads.test.ts` |
| **Full suite command** | `pnpm test:unit`; own native stack (`scripts/local-test-stack.sh`, id `vamos-taxi-290`, prefix 623 unless busy) reset + pgtap; `VAMOS_LOCAL_DB_PORT=<own> pnpm --filter @vamos/db exec vitest run test/local/meta-purchase.test.ts test/local/meta-click-ids.test.ts test/local/consent-reader.test.ts`; `typecheck`, `lint`, all `check:*`, `opennextjs-cloudflare build` |
| **Estimated runtime** | quick ~30 s; full ~15 min |

---

## Sampling Rate

- **After every task commit:** the quick run command (touched tests only; memory: parallel-agents-gate-load).
- **After every plan wave:** the full suite command.
- **Before `/gsd:verify-work`:** the full suite must be green.
- **Max feedback latency:** 60 seconds for the quick run.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-T1 | 01 | 1 | (setup) | — | branch has native stack scripts; own stack only | infra | `git merge-base --is-ancestor 8c33453e HEAD` | n/a | ⬜ pending |
| 29-01-T2 | 01 | 1 | META-10..13, D-01..D-03, D-05 | T-29-01..06 | claim branches, once-only, wipe, grants, RLS (red first) | pgTAP | `VAMOS_STACK_ID=vamos-taxi-290 VAMOS_STACK_PORTS=623 VAMOS_STACK_INSPECTOR=8493 bash scripts/local-test-stack.sh pgtap` | ❌ W0 | ⬜ pending |
| 29-01-T3 | 01 | 1 | META-10..13, D-01, D-05 | T-29-01..07 | additive migration; from-zero replay green; types from own stack | pgTAP + types | `VAMOS_STACK_ID=vamos-taxi-290 VAMOS_STACK_PORTS=623 VAMOS_STACK_INSPECTOR=8493 bash scripts/local-test-stack.sh pgtap` | ❌ W0 | ⬜ pending |
| 29-02-T1 | 02 | 1 | META-10, META-11, META-12, META-14 | T-29-08..12 | exact-keys payload, token in body only, one POST, sent/rejected/failed | unit | `pnpm --filter web exec vitest run lib/meta/capi.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-T2 | 02 | 1 | META-14 | T-29-08 | Graph host, pixel id, token name only in allowed files | unit | `pnpm --filter web exec vitest run lib/meta/legal-gate.test.ts` | ✅ update | ⬜ pending |
| 29-03-T1 | 03 | 2 | D-01 | T-29-13, T-29-14 | decision carries subject; none-branches clear all three | unit | `pnpm --filter web exec vitest run lib/meta/click-ids.test.ts` | ✅ update | ⬜ pending |
| 29-03-T2 | 03 | 2 | D-01, META-13 | T-29-15, T-29-16 | route writes 4-arg; Pay answer unchanged | unit | `pnpm --filter web exec vitest run lib/meta/click-ids-route.test.ts` | ✅ update | ⬜ pending |
| 29-04-T1 | 04 | 2 | META-12, META-13 | T-29-18, T-29-19 | claim/finish through Worker client (fetch_types:false); second claim 'already', same event id | local DB | `VAMOS_STACK_ID=vamos-taxi-290 VAMOS_STACK_PORTS=623 VAMOS_STACK_INSPECTOR=8493 bash scripts/local-test-stack.sh exec -- pnpm --filter @vamos/db exec vitest run test/local/meta-purchase.test.ts` | ❌ W0 | ⬜ pending |
| 29-04-T2 | 04 | 2 | META-10, META-13, META-14, D-03, D-04, D-06, D-07 | T-29-17..21 | gate/token/test-code refusals, livemode decides test code, one POST, never throws, logs scrubbed | unit | `pnpm --filter web exec vitest run lib/meta/purchase.test.ts lib/db/system-reads.test.ts` | ❌ W0 | ⬜ pending |
| 29-05-T1 | 05 | 3 | META-10, META-13, D-02, D-03 | T-29-22, T-29-23 | hook after expire loop; HandleResult identical when dep throws; extra never; already_settled still sends | unit | `pnpm --filter web exec vitest run lib/checkout/settle.test.ts` | ✅ add cases | ⬜ pending |
| 29-05-T2 | 05 | 3 | META-10 (must-not: no Graph from thank-you page) | T-29-24 | queue opts in; return route and confirmation/checkout never import purchase/capi | unit | `pnpm --filter web exec vitest run lib/checkout/return-settle.test.ts` | ✅ add cases | ⬜ pending |
| 29-06-T1 | 06 | 4 | META-14, D-07 | T-29-27 | owner's test event code, never invented | checkpoint | owner reply | manual | ⬜ pending |
| 29-06-T2 | 06 | 4 | all | T-29-26, T-29-27 | full gates once on the final tree; must-not greps | full suite | `pnpm test:unit` + own-stack pgtap + local tests + checks + build | — | ⬜ pending |
| 29-06-T3 | 06 | 4 | META-14 | T-29-28, T-29-29 | HANDOVER with live check and stop-and-ask on 'rejected' | doc | `grep -c 20261007260000 .planning/phases/29-webhook-purchase/HANDOVER.md` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/lib/meta/capi.test.ts`, `apps/web/lib/meta/purchase.test.ts`
- [ ] New cases in `settle.test.ts` and `return-settle.test.ts`
- [ ] `packages/db/supabase/tests/meta_purchase.test.sql`
- [ ] `packages/db/test/local/meta-purchase.test.ts` (+ fence allowlist entry)
- [ ] `pnpm install --frozen-lockfile` in this worktree
- [ ] Own native Supabase stack (`scripts/test-lab/lab.sh up <name>`, own port block)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Graph accepts the fbp/fbc-only Purchase; test-mode payment shows under Test events | META-14, D-04 | Needs the real token, Meta and a deployed Worker; the lab Worker never consumes the queue | After the controller deploys: owner opens Events Manager → Test events, makes one 4242 payment with cookies accepted, then the controller does a read-only read of `meta_purchase_events` for that booking. If Graph rejected it, stop and ask; do not widen the payload. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (29-06-T1 is the owner checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each new test file is written in the task that needs it, red first)
- [x] No watch-mode flags
- [x] Feedback latency < 60s for the quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
