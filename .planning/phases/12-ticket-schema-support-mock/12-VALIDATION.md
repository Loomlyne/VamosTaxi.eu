---
phase: 12
slug: ticket-schema-support-mock
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-10
---

# Phase 12 — Validation Strategy

> Per-phase validation contract. Local unit + pgTAP only. No Hyperdrive. No `test/deployed`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 (`apps/web`) + pgTAP (`packages/db`) |
| **Config file** | `apps/web/vitest` via package scripts; `packages/db/supabase/tests/` |
| **Quick run command** | `pnpm exec vitest run apps/web/lib/ops/tickets-map.test.ts --config apps/web/vitest.config.ts` (use repo’s real vitest config path if named differently) |
| **Full suite command** | `pnpm test:unit` (must stay DB-free) + local `pnpm db:test` on the new pgTAP file only when Docker is already up — executors never start Docker |
| **Estimated runtime** | ~30s unit; pgTAP only if owner stack is up |

---

## Sampling Rate

- **After every task commit:** vitest on `tickets-map.test.ts` (and write helper tests if added)
- **After wave 1:** pgTAP file exists and `plan(N)` matches
- **Before `/gsd:verify-work`:** unit green; hosted readback of CHECK + FORCE after apply
- **Max feedback latency:** 60 seconds for unit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SUP-02 | T-12-05 / T-12-06 | No stale 000002 apply; no duplicate 04182631 apply | source | file exists `20260904182631_contact_ticket_schema.sql`; `20260910000002_ops_support_write.sql` absent | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | SUP-02 | T-12-01 | CHECK includes `responded`; FORCE on header; no anon grant; no `support_tickets` | pgTAP | `supabase test db supabase/tests/support_tickets.test.sql` from `packages/db` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | SUP-02 | T-12-06 | Hosted apply only new version after owner **apply** | human | MCP `list_migrations` contains new version; CHECK text includes responded | — | ⬜ pending |
| 12-02-01 | 02 | 2 | SUP-02 | T-12-04 | `nextTicketStatus` five values; closed→open; staff cannot map replied/responded via PATCH | unit | vitest `tickets-map.test.ts` | ✅ | ⬜ pending |
| 12-02-02 | 02 | 2 | SUP-01 | T-12-03 | GET mapper omits `reply_token`; unknown status → `new` | unit | vitest mapTicket cases | ✅ | ⬜ pending |
| 12-02-03 | 02 | 2 | SUP-02 | T-12-04 | PATCH rejects `reply` and `replied`/`responded`/`new` | unit | vitest write helper or status guard | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | SUP-02 | T-12-02 | Five columns; no `draggable`; no `[data-quote]`; no innerHTML on body | source | grep DC | ✅ | ⬜ pending |
| 12-03-02 | 03 | 2 | SUP-05 | — | one-status filter uses table + phone column | source | DC `renderVals` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

Existing infrastructure covers unit + pgTAP. Add:

- [ ] `apps/web/lib/ops/tickets-map.test.ts` — extend (exists)
- [ ] `packages/db/supabase/tests/support_tickets.test.sql` — create
- [ ] Optional `tickets-write` unit if status guard is extracted from Hyperdrive

Executors never `supabase start`. If pgTAP cannot run, document blocked and keep unit green.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `#support` shows real `/contact` rows | SUP-01 | Live staff session + hosted RLS | `https://dashboard.vamostaxi.site/#support` after deploy |
| Open New → Open persists after refresh | SUP-02 | Staff cookie | Open a New card, refresh, still Open |
| Close / Reopen | SUP-02 | Staff cookie | Close, refresh Closed; Reopen → Open |
| GET fail banner | D-06 | Need a failed fetch | Optional; source assertion sufficient if UAT host is healthy |
| Search filters board | D-04 | Eyes | Type a name; other cards hide |

---

## Validation Sign-Off

- [x] Tasks have automated verify or human apply gate
- [x] No 3 consecutive tasks without a check
- [x] Wave 0 is extend-existing, not a new runner
- [x] No watch-mode flags
- [x] `nyquist_compliant: true`

**Approval:** pending plan review
