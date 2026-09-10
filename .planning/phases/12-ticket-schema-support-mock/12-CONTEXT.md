# Phase 12: Ticket schema + #support mock - Context

**Gathered:** 2026-09-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Ops `#support` becomes a real ticket board over `contact_submissions`. This phase ships:

1. Schema: tickets **are** `contact_submissions` plus `support_messages` / `support_inbound_events`. No `support_tickets` table. Five statuses (see D-12). `reply_token`, `last_activity_at`, `closed_at`. Backfill existing `/contact` rows. FORCE RLS. Hosted apply waits on owner **apply**.
2. DC `#support` on `dashboard.vamostaxi.site`: writer `app/ops/OpsSupportTicket.dc.html`. Staff **GET** hydrates real rows. Staff **PATCH** for Open / Close / Reopen only.
3. Sidebar `#support` (icon `mail`, after Customers, before Coupons). Staff tab stays gone.

**Not this phase:** Resend send (13), inbound webhook (14), MX (16), full thread UI wire beyond GET+status (15 leftovers that are not GET/status), funnel 7–11 files, ops board/calendar/detail, public `/contact` redesign, customer ticket portal.

**Parallel with Phase 8:** exclusive files only. Do not touch `OpsBoard` / `OpsDash` / `OpsDetail` / `OpsCalendar`, staff bookings, checkout, or account `/bookings`.

</domain>

<decisions>
## Implementation Decisions

### List chrome
- **D-01:** Desktop `#support` is the 4-column kanban already in `OpsSupportTicket.dc.html`, expanded to **five** columns (D-12). Not a single list as the default.
- **D-02:** Phone is a table. Desktop keeps the Kanban / Table switch; default Kanban.
- **D-03:** Clicking a card/row opens a dialog overlay on top of the board. Not a page replace. Overlay: thread left, details right (as now).
- **D-04:** Search box **works** this slice: filters the loaded tickets by name, email, message. Not macros / SLA / saved replies.
- **D-05:** Filter **All** = kanban. Filter **one status** = a table of only those tickets, with extra columns phone + status (plus name, email, time, ref, locale).
- **D-06:** Zero tickets = five empty columns, no fake cards. Each empty column keeps a small “no tickets” line. GET/network fail = **error banner**, never fixtures.
- **D-07:** Kanban card (redesign): **no** message preview. Name, email, time, plus `booking_ref` / locale chips when they exist. Missing ref → still a ticket, chip omitted.
- **D-08:** Each column header has a sort arrow. Click flips **that column** newest ↔ oldest. Default newest first.
- **D-09:** Sidebar Support badge = count of **New** tickets.

### Ticket rows
- **D-10:** Rows are real `contact_submissions` from `/contact` only. Cold `info@` mail is **not** a ticket (INB-02 / catch-all stays out).
- **D-11:** Staff `GET /api/staff/tickets` is in this phase. Refresh on opening `#support` and after a status change. No polling. Inbound HTML always escaped. Backfill existing submissions to New + token + original message as first `inbound_form` thread line.

### Status model (amends SUP-02)
- **D-12:** Five statuses: `new` / `open` / `replied` / `responded` / `closed`. Five kanban columns. Owner signed changing SUP-02 (was four).
- **D-13:** No drag-and-drop. Status is automatic except Close / Reopen:
  - Open overlay on **New** → `open` (same from kanban or table).
  - Opening Open / Replied / Responded → leave status as-is.
  - Opening **Closed** → stays Closed (does not auto-Open).
  - Staff sends a reply → `replied` (**Phase 13** implements the send; rule is locked here).
  - Customer reply on Open / Replied / Responded → `responded` (**Phase 14** implements inbound; rule is locked here).
  - Close button in overlay → `closed`.
  - Reopen button on a Closed ticket → leave Closed (planner: `open` unless a later phase says otherwise — see discretion).
  - Customer reply on **Closed** → auto-reopen to `responded` (reverses “closed stays closed”).
- **D-14:** This slice’s staff writes: PATCH `open` (on view of New), `closed` (Close), and Reopen. Reply→replied and inbound→responded wait 13–14. If Open-on-view PATCH fails: still show the overlay, keep New, error on the overlay.

### Claude's Discretion
- **Who can open `#support`:** any signed-in staff (same dashboard session). No extra Support-only role.
- **Reopen target:** not specified beyond “not closed”. Use `open`.
- **Reply composer in the overlay:** may stay painted; must not send mail this slice.
- **Filters control chrome:** implement D-05; visual details follow the DC.
- **Untracked `20260910000002_ops_support_write.sql`:** treat as a draft. Planner rewrites it to D-12 (five statuses), unique `reply_token`, `support_inbound_events`, FORCE RLS, no `support_tickets`. Do not apply until owner says apply.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product / requirements
- `.planning/ROADMAP.md` — Phase 12 goal, success criteria, must-nots (funnel files, no live `vamostaxi.eu` DNS, no `env.production`, no push `main`). Status count in ROADMAP is stale vs D-12.
- `.planning/REQUIREMENTS.md` — SUP-02 is **amended by D-12** (five statuses). SUP-01/03/04/05 overlap: GET + status filter + card ref/locale are in this slice per discussion; remaining thread/reply stays 13–15. INB-02 catch-all still out. SUP-F01 auto-reopen is **in** via D-13 (no longer future-only).
- `.planning/PROJECT.md` — v1.1 Ops Support; no customer ticket UI; Gmail is a copy; no IMAP scrape; no live chat.

### Live DC / schema
- `app/ops/OpsSupportTicket.dc.html` — live writer. Do not restore `OpsSupport.dc.html` or `OpsSupportBoard.dc.html`.
- `app/ops/OpsSidebar.dc.html` — `key:'support'`, `href:'#support'`, icon `mail`. No `#staff` rail item.
- `packages/db/supabase/migrations/20260828000002_contact_forms.sql` — existing `contact_submissions` + `submit_contact_message`.
- `packages/db/supabase/migrations/20260910000002_ops_support_write.sql` — untracked draft only (see discretion).

### Parallel / execute rules
- Do not restore `vt-ops-hash-switch`. Do not restore Staff. Hyperdrive = direct Postgres. No invented CHF/legal. Schema apply: owner **apply** then MCP `apply_migration` on `yaumjzvylngfjhtuffqs`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OpsSupportTicket.dc.html` — kanban + table + overlay + drag (drag is **removed** per D-13). Comment already says hydrate from `GET /api/staff/tickets`, no fixtures.
- `OpsSidebar.dc.html` — Support item + New badge via `vamos:support-badge`.
- `submit_contact_message` — mint/extend so new `/contact` rows get `ticket_status=new`, `reply_token`, and an `inbound_form` message.

### Established Patterns
- Ops is DC hash console, not Next `/ops/support`.
- Staff APIs under `apps/web/app/[locale]/(ops)/api/staff/`.
- Ledger-style writes: prefer SECURITY DEFINER RPCs over raw staff UPDATE if that matches existing contact RLS (planner decides).
- Empty ops chrome: never fixtures (same as board vs `emptyBookings`).

### Integration Points
- `ops.dc.html` `isSupport` + `OpsSupportTicket`.
- Public `/contact` already writes `contact_submissions`; do not change the public form this phase except RPC minting if required.
- Phase 8 dirty files in this checkout are **out of bounds**.

</code_context>

<specifics>
## Specific Ideas

- “When I filter one status I want those tickets as a table, not a kanban column.”
- “I don’t want the preview of the first message on the card — redesign the card.”
- Column sort: click an arrow on the column itself to flip newest/oldest.
- Fifth column named **Responded** = customer wrote back.
- Close button moves to Closed; Reopen button; customer mail on Closed auto-reopens to Responded.

</specifics>

<deferred>
## Deferred Ideas

- Staff reply send + Gmail thread (Phase 13) — status rule Replied is locked.
- Inbound Reply-in-Gmail (Phase 14) + staging MX (Phase 16) — status rule Responded is locked.
- Remaining SUP-03 thread completeness if not covered by GET+overlay this slice (Phase 15).
- Catch-all `info@` tickets (cold mail with no ticket) — out of v1.1.
- SUP-F02 attachments.
- SUP-F03 assignment / SLA / saved replies / macros / CSAT (board search is local filter only).
- SUP-F04 deep-link `booking_ref` into ops booking detail.
- Live `vamostaxi.eu` DNS / `env.production` / push `main`.

</deferred>

---

*Phase: 12-Ticket schema + #support mock*
*Context gathered: 2026-09-10*
