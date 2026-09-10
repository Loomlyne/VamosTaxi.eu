# Phase 8 plan check — ISSUES FOUND

Plans 01–09 read against ROADMAP Phase 8, CONTEXT, REQUIREMENTS (OPS-01–05, SITE-03, AUTH-06, DATA-08), RESEARCH, UI-SPEC, VALIDATION, PATTERNS, CLAUDE.md.

Frontmatter, waves (except 08-08 delay), SECURITY DEFINER + hosted apply on 08-09-03, D-01/D-10, emptyBookings, Stripe-first refund, chauffeur-only assign, extra = difference, Hyperdrive direct, Worker `vamos`, no 07-UAT / cost sheet / driver app / GPS, no invented CHF: present.

## Blockers

1. **[requirement_coverage] OPS-02 + DATA-08 timeline is write-only**
   - Plan: 08-04 (also 08-02 claims OPS-02)
   - RESEARCH: replace client `evQuote` labels with `booking_events`. ROADMAP SC2: OpsDetail shows append-only events, no mock timeline. DATA-08: ops can **read** a timeline.
   - No SELECT/GET of `booking_events`, no OpsDetail history UI. `evQuote` copy is unused; staff still cannot see events.
   - Fix: task in 08-04 or new plan — staff GET events (or include on booking JSON) + render on OpsDetail; file-proof no synthetic `evQuote` timeline.

2. **[requirement_coverage] DATA-08 cancel writes no event**
   - Plan: 08-05 Task 3
   - PATTERNS: staff cancel/assign/refund currently do not write events. Assign/refund/edit RPCs add events; cancel only flips status / drops unpaid.
   - Fix: same-tx `booking_events` on paid cancel and unpaid drop (or honest equivalent); pgTAP.

3. **[context_compliance] D-72 customer paid-edit has no public surface**
   - Plan: 08-07 Task 4
   - CONTEXT/UI-SPEC: customer paid edit is a request this phase. Task files = `edit-request.ts` only; verify is `print('ok')`.
   - Fix: name the manage-booking / account detail file, POST requested row, four languages; or PHASE SPLIT if the shell is missing.

4. **[context_compliance] D-55 must-fix email not wired to off-road write**
   - Plan: 08-09 Task 2
   - Files: emails + `edit-request.ts` (D-75 only). Vehicle PATCH / fleet-write not listed. 08-03 defers email here.
   - Fix: server send after vehicle off-road when upcoming assignments exist; add those files to `files_modified`.

5. **[scope_sanity] 08-07 has 5 tasks**
   - Split: SQL+extra session | ops accept UI | customer request + tests (or fold T4 into a new plan with D-72 UI).

6. **[task_completeness] Trivial `<automated>` verifies (always pass)**
   - 08-05 Task 3: reads `bookings-write.ts`, no assert
   - 08-06 Task 2: `print('ok')` — VALIDATION.md wanted intent/`createBooking` refs
   - 08-07 Task 2: `print('ok')` — VALIDATION.md wanted edit-request/settle/unpaid refuse
   - 08-07 Task 4: `print('ok')`
   - Fix: assert the acceptance criteria (and match VALIDATION.md).

## Warnings

7. **[scope_sanity]** 08-04 `files_modified` = 14 (warning band).
8. **[task_completeness]** 08-09 Task 2 verify is true if `packages/emails/src` exists.
9. **[research_resolution]** RESEARCH `## Open Questions` not marked `(RESOLVED)` (plans did pick the recommendations).
10. **[visual_gate]** 08-05 touches OpsDetail with no `--vt-*` / no-glow visual gate.
11. **[dependency_correctness]** 08-08 `wave: 6` but `depends_on: [08-02, 08-03]` ⇒ wave 3. Delay is safe; D-50 still does not depend on 08-04.

## Not issues

Requirement IDs all appear in frontmatter. AUTH-06 = D-05 email+RLS, no claim dialog. Schema apply blocked on 08-09-03. Nyquist: VALIDATION.md exists; new tests are same-plan last tasks (not `MISSING`).
