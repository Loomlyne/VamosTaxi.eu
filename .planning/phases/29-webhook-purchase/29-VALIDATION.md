---
phase: 29
slug: webhook-purchase
status: draft
nyquist_compliant: false
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
| **Full suite command** | `pnpm test:unit`; own native stack reset + `supabase test db`; `VAMOS_LOCAL_DB_PORT=<own> pnpm --filter @vamos/db exec vitest run test/local/meta-purchase.test.ts test/local/meta-click-ids.test.ts test/local/consent-reader.test.ts`; `typecheck`, `lint`, all `check:*`, `opennextjs-cloudflare build` |
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
| filled by planner | | | | | | | | | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
