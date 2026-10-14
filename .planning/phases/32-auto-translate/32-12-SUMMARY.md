---
phase: 32-auto-translate
plan: 12
subsystem: phase-proof-and-handover
tags: [e2e, chromium, local-worker, gates, pgtap, validation, handover]
requires: [32-01, 32-02, 32-03, 32-04, 32-05, 32-06, 32-07, 32-08, 32-09, 32-10, 32-11]
provides:
  - apps/web/tests/e2e-worker/translate-{browser.e2e.mjs,run.sh,seed.sql} (browser proof of surfaces A, B, C)
  - .planning/phases/32-auto-translate/evidence/README.md (committed record of every run)
  - .planning/phases/32-auto-translate/32-VALIDATION.md signed (nyquist_compliant true, wave_0_complete true)
  - .planning/phases/32-auto-translate/32-HANDOVER.md (seven sections for the controller)
affects: [controller ship of Phase 32]
key-files:
  created:
    - apps/web/tests/e2e-worker/translate-browser.e2e.mjs
    - apps/web/tests/e2e-worker/translate-run.sh
    - apps/web/tests/e2e-worker/translate-seed.sql
    - .planning/phases/32-auto-translate/evidence/README.md
    - .planning/phases/32-auto-translate/32-HANDOVER.md
  modified:
    - .planning/phases/32-auto-translate/32-VALIDATION.md
    - apps/web/lib/checkout/refund-check.test.ts
    - apps/web/lib/translate/sweep.test.ts
    - apps/web/lib/ops/paths.test.ts
    - apps/web/tests/e2e-specs.ts
    - apps/web/tests/unit/db-client-guard.test.ts
    - app/ops/OpsSupportTicket.dc.html
    - apps/web/lib/ops/support-reply-dc.test.ts
decisions:
  - "03:00 cron order after the Phase 31 merge: refund check, then translate sweep, then return (pinned in sweep.test.ts)"
  - "Only POST /api/staff/tickets/<id>/reply-translate is stubbed in the browser run (ready and too-long states); the local Worker has no AI binding"
  - "db:types:check replaced by an entry-for-entry compare with native CLI 2.119 (pinned 2.115 needs Docker)"
metrics:
  completed: 2026-10-14
  tasks: 4
---

# Phase 32 Plan 12: Phase proof and controller hand-over Summary

Chromium proof of the three translator surfaces on the local Worker build (48 frames, all green), the Phase 31 merge with its two fixups, a signed VALIDATION pointing at the real tests, and a seven-section hand-over the controller can land, apply and verify from.

## Tasks

| # | Task | Commits |
|---|---|---|
| 0 | Merge origin/main (Phase 30 board, Phase 31 refunds #82), fixups | `8930c31c` (merge), `24916f3e` (refund-check pin + 03:00 order), `29a66a2e` (leftover refs to the deleted edit spec), `fb13271e` (merge of a planning note) |
| 1 | Chromium proof of surfaces A, B, C | `f31eacba`; bug found and fixed on the way: `20ca2fba` (test), `c92bfe20` (fix, plan 32-10) |
| 2 | Full local gates and pgTAP on the merged branch | running at the time of writing (started 12:15:20, head `fb13271e`); see marker below |
| 3 | VALIDATION sign-off, hand-over, evidence README | `1e0dc16f` (evidence README), `58241dfa` (VALIDATION + HANDOVER) |

## Results

- Browser (2026-10-14 05:25:57-05:50:47, lab p32): A 16 pass 0 fail, B 16 pass 0 fail, C 16 pass 0 fail at 1440/1024/768/390 x en/de/fr/ar; 0 review translation requests before the first tap in 16/16 home frames; 0 requests to a live host; exit=0.
- No-DB gate at `29a66a2e` (04:56-04:58): 6606 tests passed, 57 skipped; exit=0.
- Types: merged `database.types.ts` = native CLI 2.119 output, 242 = 242 entries (05:01).
- `node --test scripts/i18n-fill.test.mjs` (12:17): 5 pass, 0 fail (VALIDATION legal/`data-tok` skip row).

Task 2 results, 2026-10-14, head fb13271e (merged with origin/main 8ef7e82d), one lane, logs in `evidence/`:
- `gate-local.log` 12:15:20-12:18:22, exit=0: check:public-env, typecheck, lint:css, lint, i18n:check (2698 keys), check:legal-claims, check:numbers, build, test:unit (scripts 45/0; packages/db 14; emails 360; apps/web 6607 passed, 57 skipped, 518 files), DB tests via `lab.sh dbtests p32 --keep` (packages/db test/local 76; apps/web `.local.test.ts` 11 + 44), all pass.
- `pgtap.log` 12:17:44-12:18:15, exit=0: full suite Files=126, Tests=3833, PASS.
- `static.log` 12:18:19-12:18:22, exit=0: test:scripts, db:seed:check (no drift), check:db-fences, i18n:fill --check (0 gaps), each exit 0.
- Stack lock taken 12:16:33, lab p32 destroyed and lock released 12:18:19.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Phase 31 refund-check source pin broke after the merge.** It assumed its block was the last one before `return;` in the 03:00 branch; the translate sweep now follows it. Pin now ends at the next try block; `sweep.test.ts` pins the order. Commit `24916f3e`.
2. **[Rule 1 - Bug] 3 unit reds from the deleted `content-string-edit.spec.ts`** (E2E spec list, db-client exemption, mfa-challenge pin). Commit `29a66a2e` (attributed to 32-03).
3. **[Rule 1 - Bug] Pending/failed customer messages with no detected language showed no note** (found by the browser run). Commits `20ca2fba`, `c92bfe20` (attributed to 32-10).
4. **[Rule 3 - Blocking] Task 2 runs `lab.sh dbtests p32 --keep` instead of `pnpm test:db-lab`**, so the same stack serves the full pgTAP run after it; the lock is held only for the database part, with an EXIT trap.
5. **`db:types:check` not run:** the pinned 2.115 CLI needs Docker. Replaced by the 2.119 entry-for-entry compare (`evidence/types-compare.log`).

### Incident

The first 32-12 agent died at about 05:50 (API error) holding `~/.vamos-scratch/stack.lock` and lab p32 from 05:00 until the orchestrator released them at 12:13; the controller was told.

### Gaps recorded in the hand-over (not fixed here)

- `worker.ts` `queue()` branch order is proven only by a one-time 32-05 source check, not a committed test.
- `ops-dc-content-loader.spec.ts` (Playwright, kept and edited in 32-03) has not been run.
- `app/pages/sitemap.dc.html` still lists dashboard `/pages` and `/legal` (needs his word).

## Known Stubs

None. The browser run's one route stub (reply-translate ready and too-long) is test scaffolding, recorded in `evidence/README.md`.

## Threat Flags

None. T-32-48: committed files carry statuses, ids and counts only (logs are gitignored). T-32-49: lab only; every live step is listed in the hand-over, none run. T-32-50: every claim in the hand-over points to a log with `exit=` and a clock time, or is in the not-verified list.

## Self-Check: PASSED

- Files exist: `evidence/README.md`, `32-HANDOVER.md`, `32-VALIDATION.md`, the three `translate-*` e2e files.
- Commits in `git log`: `8930c31c`, `24916f3e`, `29a66a2e`, `20ca2fba`, `c92bfe20`, `f31eacba`, `fb13271e`, `1e0dc16f`, `58241dfa`.
- Acceptance greps (Task 3): `nyquist_compliant: true` present, `wave_0_complete: true` present, `lib/i18n/machine` 0, "not built by decision (D-05/D-06)" 3, no `overlay-merge` row with ❌, "Migrations by purpose" 1, `vamos-translate-staging-dlq` 1, seven `##` sections, no code block in the hand-over.
- Task 2 gate and pgTAP: not claimed here; filled by the orchestrator at the marker.
