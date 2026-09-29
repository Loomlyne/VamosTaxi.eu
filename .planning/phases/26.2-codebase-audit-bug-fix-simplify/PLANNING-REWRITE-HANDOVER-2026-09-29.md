# Planning rewrite 19 / 20 / 26.2 — hand-over to the control session

**Branch:** `docs/planning-rewrite` in `/Users/koss/Developer/vamos-wt/planning-rewrite`, cut from
origin/main af93fc8e (= main, verified 2026-09-29). Planning files only. No push, no PR, no deploy.
`ROADMAP.md`, `STATE.md` and `REQUIREMENTS.md` are not edited (another branch owns them).

## Signed by the owner (question form, 2026-09-29)

- Order after 26.0: **26.2 → 20 → 19**.
- 19: plans 19-01…19-05. 20: plans 20-06…20-09 (20-04, 20-05 superseded). 26.2: plans 26.2-01…26.2-12.

## ROADMAP.md lines to change (control session applies)

1. Checklist line of Phase 19 → `- [ ] **Phase 19: 10,000-booking surge proof on the 26.3 checkout** - 10,000 at once on a copy of the database behind a hidden test Worker (fake Stripe), then ~200 real sandbox payments; owner buys Workers Paid and the copy. No .eu, no live Stripe, no Publish.`
2. Checklist line of Phase 20 → `- [ ] **Phase 20: Security check of the changed app (2026-10)** - 2026-09-19 list done (20-01…03); new check of the whole app, 26.1/26.3 changes first; serious findings fixed in-phase; rest decided by the owner.`
3. Add checklist line after 26.1: `- [ ] **Phase 26.2: Codebase audit, bug fix and simplify** - Folder by folder after 26.0; booking path bugs only with owner OK; no visible or pay change.` (and a progress-table row `26.2 | 0/12 | Planned, signed | -`).
4. `### Phase 19` details: Goal, Depends on (26.0, 26.2, 20), Success criteria = 19-CONTEXT D-03 pass bar + must-nots; **delete** success criteria 1 and 2 (Phase 17 Fleet / Phase 16 tick — 17 removed, 16 complete); Plans: `5 (19-01 test switches · 19-02 busy-and-retry on PAY · 19-03 owner paid setup · 19-04 burst + real sample · 19-05 tear-down)`; delete the HARD GATE sentence about 17 live UAT.
5. `### Phase 20` details: Goal → the 2026-10 check; Requirements `SEC-01…SEC-12 (done), SEC-13…SEC-16`; Depends on 26.2; Plans: `20-01…03 done · 20-04, 20-05 superseded · 20-06 check · 20-07 serious fixes · 20-08 owner-decided fixes · 20-09 live proof`.
6. Add `### Phase 26.2: Codebase audit, bug fix and simplify` details from `26.2-CONTEXT.md` (Depends on 26.0; Requirements AUD-01…AUD-06; Plans 12).
7. Order line: `26.3 → 26.0 → 26.2 → 20 → 19 → 27 → 28 → 29`.

REQUIREMENTS.md: add AUD-01…AUD-06 (text in `26.2-CONTEXT.md`) and SEC-13…SEC-16 (text in `20-CONTEXT.md`).
`PHASE-CLOSURE-2026-09-29.md` Parked table: 19 and 20 "rewritten and signed 2026-09-29"; 26.2 "fresh plan signed 2026-09-29".

## Still open for the owner

1. **Paid, his step only (Phase 19):** subscribe the Cloudflare account to Workers Paid (it is on Free), and create the database copy in Supabase (restore a backup to a new project; compute size and cost his choice). Plan 19-03 has the numbered steps.
2. Phase 19: which machine runs the load (proposal: his Mac; a second machine if it cannot open 10,000 connections) — asked at 19-04.
3. Phase 20: up to 10 TEST SECURITY bookings on live; paid ones are removed with the D-37 script by him.
4. Phase 26.2: every booking-path bug needs his OK, one question each.
5. Not from this branch: the main checkout has an untracked folder `.planning/quick/260928-q4t-remove-lenis-smooth-scroll-entirely-mock/` from another session.

## Lead passed to Phase 20

`POST /api/checkout/intent` checks Origin but has no per-visitor limit or Turnstile (read at af93fc8e). Listed in 20-RESEARCH; not yet a confirmed finding.
