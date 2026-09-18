---
phase: 15
slug: wire-ops-support-to-apis
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 15 — Validation Strategy

> Unit + source-read only. No Hyperdrive. No `tests/integration/*.spec.ts` (vitest excludes those; `passWithNoTests` would fake green). Point `<automated>` at `apps/web/lib/**/*.test.ts` or `readFileSync` of DC.

Planner remapped Task IDs to 3 plans / 2 waves. Coverage gate is SUP-01, SUP-03, SUP-04, SUP-05 plus CONTEXT D-01…D-12.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (`apps/web`) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/ops/tickets-write.test.ts lib/ops/tickets-map.test.ts` |
| **Full suite command** | same plus `lib/ops/tickets.test.ts lib/ops/phase-15-dc.test.ts` |
| **Estimated runtime** | ~30s |

---

## Sampling Rate

- **After every task commit:** vitest on the files that task named
- **After every plan wave:** all 15 unit files green
- **Before `/gsd:verify-work`:** unit green; live `#support` UAT is owner
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | D-05 D-06 SUP-04 | T-15-03 | Unknown booking_ref refuses entire Save; empty ref allowed; empty note no staff_note row | source | readFileSync `lib/ops/tickets-write.test.ts` (cases present; vitest green is 15-01-02) | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | D-04 D-05 D-06 | T-15-02 | PATCH Save writes phone+ref; empty note skips insert; not mixed with reply | unit | vitest `lib/ops/tickets-write.test.ts` | ✅ | ⬜ pending |
| 15-01-03 | 01 | 1 | D-04 | T-15-02 | Route parses `{ phone, booking_ref, note }` on existing PATCH | unit | readFileSync route + vitest `lib/ops/tickets-write.test.ts` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 1 | D-08 D-09 SUP-03 | T-15-04 | mapTicket body is text; optional files[]; staff_note → note | unit | readFileSync tickets-map.ts (`files`) + vitest `lib/ops/tickets-map.test.ts` | ✅ | ⬜ pending |
| 15-02-02 | 02 | 1 | D-10 SUP-01 | T-15-06 | Missing files table → `files: []`; GET still ok | unit | readFileSync tickets.ts (`support_message_files`) + vitest `lib/ops/tickets.test.ts` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 2 | D-04 D-05 D-07 D-11 | T-15-02 | t.saveNote is Save / Speichern / Enregistrer / حفظ; Save PATCH; noteOff not empty-note; Email/Call/WA stay | source | readFileSync writer DC (Speichern, booking_ref) + vitest `lib/ops/phase-15-dc.test.ts` | ❌ W0 | ⬜ pending |
| 15-03-02 | 03 | 2 | D-01 D-02 D-08 D-10 SUP-01 SUP-03 SUP-04 | T-15-01 T-15-08 | publishBadge new+responded; keep mount-enter hydrate; no setInterval; focus/visibility + Save hydrate open overlay; files in `[data-msg]` | source | readFileSync writer DC (badge responded, visibilitychange, m.files) + vitest `lib/ops/phase-15-dc.test.ts` | ❌ W0 | ⬜ pending |
| 15-03-03 | 03 | 2 | D-03 D-09 D-11 D-12 SUP-05 | T-15-04 T-15-05 T-15-07 | Dual-DC public copy; no innerHTML on body; no `/ops/support` page; no POST /api/quote; board chrome unchanged | source | readFileSync public DC (Speichern) + vitest `lib/ops/phase-15-dc.test.ts` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

Existing vitest covers tickets-map / tickets-write. Add cases; add `lib/ops/tickets.test.ts` (load stub) and `lib/ops/phase-15-dc.test.ts` (readFileSync DC).

- [ ] Extend `apps/web/lib/ops/tickets-write.test.ts` (15-01-01)
- [ ] Extend `apps/web/lib/ops/tickets-map.test.ts` (15-02-01)
- [ ] Add `apps/web/lib/ops/tickets.test.ts` (15-02-02)
- [ ] Add `apps/web/lib/ops/phase-15-dc.test.ts` (15-03-01)

No new runner. No Docker. No pgTAP this phase (no new SQL).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `#support` live list | SUP-01 | Staff cookie + hosted | dashboard `#support` after deploy |
| Overlay Save phone/ref/note | D-04 | Live PATCH | Save; refresh; fields persist; note bubble if non-empty |
| Bad VT- ref | D-06 | Live booking table | Overlay error; nothing written |
| Badge New+Responded | D-01 | Eyes | Sidebar count |
| Tab focus hydrate | D-02 | Browser | Change ticket elsewhere; focus tab; overlay updates |
| Image in thread | D-10 | Needs 14 file row | Skip if 14 not applied; empty files ok |
| Status filter unchanged | SUP-05 D-03 | Eyes | All = kanban; one status = table |

---

## Validation Sign-Off

- [x] Tasks have automated verify or human UAT
- [x] No 3 consecutive tasks without a check
- [x] Wave 0 is extend-existing
- [x] No watch-mode flags
- [x] `nyquist_compliant: true`

**Approval:** remapped to 15-01 / 15-02 / 15-03 (waves 1, 1, 2)
