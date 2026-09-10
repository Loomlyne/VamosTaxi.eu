# Phase 12 — Pattern map

**Phase:** 12 — Ticket schema + #support mock
**Output for planner/executor.** Closest analogs, not a rewrite.

## Files this phase creates or edits

| File | Role | Analog |
|------|------|--------|
| `packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql` | Reconstruct hosted schema into git | Hosted DDL (see RESEARCH). Analog style: `20260828000002_contact_forms.sql` |
| `packages/db/supabase/migrations/20260910180000_ticket_status_responded.sql` | Delta: five statuses + FORCE on header | `alter … drop constraint` / `add constraint` like other check expansions |
| `packages/db/supabase/tests/support_tickets.test.sql` | pgTAP | `packages/db/supabase/tests/contact_forms.test.sql` |
| `apps/web/lib/ops/tickets-map.ts` | Pure map + `nextTicketStatus` | **this file** (extend; do not fork) |
| `apps/web/lib/ops/tickets-map.test.ts` | Unit | **this file** |
| `apps/web/lib/ops/tickets-write.ts` | PATCH transitions | **this file** — drop `reply` insert |
| `apps/web/lib/ops/tickets.ts` | GET loader | **this file** |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts` | GET | keep `withStaff` + `jsonOk` |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` | PATCH | keep `withStaff`; slim body |
| `apps/web/app/api/staff/tickets/**` | Dual-mount | already re-exports |
| `app/ops/OpsSupportTicket.dc.html` | Board UI | **this file** |
| `app/ops/OpsSidebar.dc.html` | Badge default 0 only | `supportNew` init |

Delete: `packages/db/supabase/migrations/20260910000002_ops_support_write.sql` (untracked stale).

## Do not touch

`app/ops/OpsBoard.dc.html`, `OpsDash`, `OpsDetail`, `OpsCalendar`, staff bookings routes, checkout, `20260910000001_bookings_select_by_contact_email.sql`.

## Data flow

```
/contact → submit_contact_message (DEFINER) → contact_submissions + support_messages(inbound_form)
#support mount → GET /api/staff/tickets → asStaff SELECT → mapTicket → DC state
open New → PATCH { status: "open" } → UPDATE ticket_status
Close → PATCH { status: "closed" }
Reopen → PATCH { status: "open" } from closed
```

Staff APIs: `withStaff` from `apps/web/lib/ops/staff-json.ts`. JSON errors via `jsonErr`.

## Hosted apply

Not `supabase db push`. Commit SQL → stop → owner **apply** → MCP `apply_migration` on project `yaumjzvylngfjhtuffqs` for the **new** version only.

## PATTERN MAPPING COMPLETE
