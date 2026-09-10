# Phase 8 plan check — ISSUES FOUND (revision 2)

Plans 01–10 read against ROADMAP Phase 8, CONTEXT, REQUIREMENTS (OPS-01–05, SITE-03, AUTH-06, DATA-08), RESEARCH, UI-SPEC, VALIDATION, PATTERNS, CLAUDE.md / HERMES.md.

## VERIFICATION FAILED

**Phase:** 08-ops-dispatch-live-board-assignment-account-surfaces
**Plans checked:** 10 (08-01 … 08-10)
**Issues:** 2 blocker(s), 6 warning(s)

Revision 2 did land the six named fixes: OPS-02/DATA-08 GET+render on OpsDetail (08-04 T3 + `bookings.ts`, no `evQuote`); cancel writes `booking_events` (08-05 T3) with a real assert; D-72 public UI in 08-10 (`bookings.dc.html` + account bookings POST); D-55 wired to vehicles PATCH / `fleet-write` (08-09 T2); 08-07 is 4 tasks; previous `print('ok')` verifies on 08-05 T3 / 08-06 T2 / 08-07 extra session / 08-09 T2 are gone.

Still true and honored: no dummy-card in execute, hosted apply is 08-09 T3 owner-gated, Worker `vamos`, Hyperdrive direct, no 07-UAT rewrite, DC as-is, no invented CHF.

## Coverage (requirements — IDs present)

| Requirement | Plans | Status |
|-------------|-------|--------|
| OPS-01 | 01, 02, 08 | Covered (paths, live board/tiles, poll) |
| OPS-02 | 02, 04 | Covered (detail + `booking_events` read/render in 08-04 T3) |
| OPS-03 | 03, 04, 09 | Covered (fleet persist, assign RPC, chauffeur mail) |
| OPS-04 | 06 | Covered (quote → intent → pay-link / take-card) |
| OPS-05 | 05, 07, 10 | Covered (refund/cancel, ops edit accept, customer request) |
| SITE-03 | 08 | Covered (account list Postgres; detail URL still Phase 9 per ROADMAP) |
| AUTH-06 | 08, 10 | Covered as D-05 email match + RLS, no claim dialog |
| DATA-08 | 04, 05, 07, 09 | Covered (assign/refund/edit events + cancel events + hosted apply) |

Locked D-01–D-75 all appear in at least one plan. Deferred (cost sheet, driver app, GPS, auto-dispatch, 07-UAT, Phase 9 leftover shells) stay out.

## Plan summary

| Plan | Tasks | Files | Wave | depends_on | Status |
|------|-------|-------|------|------------|--------|
| 01 | 4 | 10 | 1 | [] | Valid (warning-band size) |
| 02 | 4 | 5 | 2 | 08-01 | Valid |
| 03 | 4 | 6 | 2 | 08-01 | Valid |
| 04 | 4 | 15 | 3 | 08-03 | Warning — 15-file line |
| 05 | 4 | 10 | 4 | 08-04 | Valid |
| 06 | 4 | 7 | 5 | 08-01, 08-05 | Valid |
| 07 | 4 | 10 | 6 | 08-04, 08-05, 08-06 | Valid (split honored) |
| 08 | 4 | 8 | 6 | 08-02, 08-03 | Valid (wave delay) |
| 09 | 4 | 9 | 7 | 08-04, 08-05, 08-07 | Conflict with 10 |
| 10 | 2 | 4 | 7 | 08-07 | Malformed YAML + same-wave overlap |

## Blockers (must fix)

**1. [dependency_correctness] Wave 7 concurrent write on `edit-request.ts`**
- Plans: 08-09, 08-10
- Both `wave: 7`. 08-09 T2 patches `apps/web/lib/ops/edit-request.ts` (D-75 must-fix). 08-10 T1 lists the same file (customer POST `requested`). Neither `depends_on` the other.
- Parallel execute will clobber or merge-conflict.
- Fix: `08-10` `depends_on: ["08-07", "08-09"]` and `wave: 8`, **or** drop `edit-request.ts` from 08-10 and keep the POST only under `apps/web/app/api/account/bookings` using 08-07 helpers.

**2. [task_completeness] 08-10 frontmatter never closes**
- Plan: 08-10
- File starts with `---` and has **no** closing `---` before `<objective>` (only one `---` in the file). `must_haves` / `wave` / `depends_on` will not parse as GSD frontmatter.
- Also missing `execution_context` (other 08-0N plans have it).
- Fix: close YAML with `---`, add `execution_context` like 08-01…09.

## Warnings (should fix; not blocking execute if blockers land)

**3. [scope_sanity] 08-04 `files_modified` = 15 (blocker threshold)**
- Extra file vs rev1 is `apps/web/lib/ops/bookings.ts` (required OPS-02 GET). Do **not** split assign RPC from OpsDetail. Leave as warning unless another plan takes only the timeline read.

**4. [research_resolution] RESEARCH `## Open Questions` still lacks `(RESOLVED)`**
- Plans already picked the recommendations (D-10 table, optional fee column, chauffeur locale, `booking_edit_requests`, D-58-if-control, DEFINER/`asSystem`). Mark the section resolved.

**5. [dependency_correctness] 08-08 `wave: 6` vs `depends_on: [08-02, 08-03]` ⇒ wave 3**
- Delay is safe; D-50 still does not need 08-04. Optional: set wave 3 or document the delay.

**6. [verification_derivation] VALIDATION.md is stale vs the split**
- Still lists 08-07-04 (customer paid edit) and 08-07-05; no 08-10 rows. Wave 0 still names `08-07-05`. Update the per-task map.

**7. [task_completeness] 08-10 T2 verify is weak; D-71 is conditional**
- Verify: `'edit' in t.lower() or 'request' in t.lower()` can pass without a POST to `/api/account/bookings`. Assert the account edit-request call.
- Action: unpaid edit “only if that control already exists” can skip locked D-71. Wire unpaid reprice-then-pay on the existing `bookings.dc.html` / manage surface this phase, or PHASE SPLIT D-71 honestly.

**8. [task_completeness] 08-04 T3 verify does not prove timeline render**
- Action/acceptance cover GET + OpsDetail history + no `evQuote`. Automated only greps `evQuote` absent and `booking_events`/`events` in `bookings.ts`/`staff-json.ts`. Assert OpsDetail renders the events array.

## Dimension notes (non-issues)

- Nyquist 8e: VALIDATION.md exists. 8a: every auto task has `<automated>`; 08-09-03 is `checkpoint:human-action`. No `MISSING` / `--watch`. Sampling OK.
- Dimension 7c: staff writes stay API/DB DEFINER; phone booking reuses checkout intent; poll not Realtime. PASS.
- Dimension 10: Worker `vamos`, Hyperdrive direct, DC ops, no React `/ops`, no invented CHF, no 07-UAT rewrite, no dummy-card execute. PASS.
- Dimension 12: analogs are same-file DC / checkout RPC / PayLinkEmail. PASS.
- 08-03 T1 verify is still emptyBookings-only; T4 `fleet-persist.test.ts` is the real proof — not re-raised as a blocker.

## Structured issues

```yaml
issues:
  - plan: "08-09"
    dimension: dependency_correctness
    severity: blocker
    description: "08-09 and 08-10 both wave 7 modify apps/web/lib/ops/edit-request.ts with no depends_on between them"
    task: 2
    fix_hint: "08-10 depends_on 08-09 and wave 8, or keep customer POST out of edit-request.ts"
  - plan: "08-10"
    dimension: task_completeness
    severity: blocker
    description: "Frontmatter never closed (no ending ---); wave/must_haves will not parse; missing execution_context"
    fix_hint: "Close YAML with --- and add execution_context like sibling plans"
  - plan: "08-04"
    dimension: scope_sanity
    severity: warning
    description: "15 files — blocker threshold; extra file is bookings.ts for OPS-02 read"
    metrics:
      tasks: 4
      files: 15
    fix_hint: "Do not split assign; leave timeline GET in 08-04 T3"
  - plan: null
    dimension: research_resolution
    severity: warning
    description: "RESEARCH.md ## Open Questions has no (RESOLVED) suffix; plans already chose the recommendations"
    file: "08-RESEARCH.md"
    fix_hint: "Mark ## Open Questions (RESOLVED) with the six planner picks"
  - plan: "08-08"
    dimension: dependency_correctness
    severity: warning
    description: "wave 6 but depends_on only 08-02/08-03 (wave 3). Delay is safe."
    fix_hint: "Set wave 3 or keep delay documented"
  - plan: null
    dimension: verification_derivation
    severity: warning
    description: "VALIDATION.md still has 08-07-04/05 and no 08-10"
    fix_hint: "Rewrite per-task map for 08-07 (4 tasks) + 08-10"
  - plan: "08-10"
    dimension: task_completeness
    severity: warning
    task: 2
    description: "Verify is edit|request substring; D-71 unpaid edit is 'if control exists'"
    fix_hint: "Assert account edit-request POST; deliver D-71 on existing surface or split"
  - plan: "08-04"
    dimension: task_completeness
    severity: warning
    task: 3
    description: "Verify does not assert OpsDetail renders booking_events"
    fix_hint: "Grep OpsDetail for events/timeline array render, not only evQuote absent"
```

## Recommendation

2 blockers require revision (close 08-10 YAML; serialize 08-10 after 08-09 or drop the shared file). Warnings can ride. Do not reopen the six revision-2 coverage fixes.
