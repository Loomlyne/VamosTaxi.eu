# Phase 15: Wire Ops #support to APIs - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Live `#support` talks to staff APIs: list, overlay thread (form + messages, newest last), `booking_ref` + `locale`, status filters, EN/DE/FR/AR, escaped text. Staff tab stays gone. Keep the DC hash console — no Next.js `/ops/support` page.

**Also this phase:** badge **New + Responded**; refresh on enter / after Send-Close-Reopen-Save / tab focus; overlay **one Save** for phone + booking ref + internal note; inbound **files** render on the thread; Email + Call + WhatsApp stay as painted.

**Not this phase:** inbound webhook ingest (14), staging MX (16), funnel 7–11, Staff tab, `vamostaxi.eu`, `env.production`, push `main`. Does not need live MX.

</domain>

<decisions>
## Implementation Decisions

### Board
- **D-01:** Sidebar Support badge = count of **New + Responded** (waiting on dispatcher). Amends Phase 12 D-09 (New only).
- **D-02:** Hydrate on entering `#support`, after Send / Close / Reopen / **Save**, and when the browser tab gains focus. That hydrate includes the **open overlay** thread. **No** interval poll. Amends Phase 12 D-11 (adds focus + Save).
- **D-03:** Kanban / one-status table / search / card chips / empty columns / load-error banner stay as Phase 12 + current `OpsSupportTicket.dc.html`. Do not redesign the board.

### Overlay fields
- **D-04:** Phone, booking ref, and internal note are live. **One Save** writes all three. Relabel the control **Save** (not “Save note”). Typing without Save does not persist.
- **D-05:** Empty note is fine — Save still writes phone + ref. Non-empty note appends a dashed `staff_note` thread line, then clears the note field (same as today’s `saveNote` bubble).
- **D-06:** `booking_ref` empty = no chip, ticket still valid. If filled, it **must** match a real `bookings.ref` or the **entire Save refuses** (generic overlay error, nothing written). No lookup UI. No jump to booking detail (SUP-F04 later).
- **D-07:** Email + Call + WhatsApp stay as painted. Email may be `mailto:` (out of band). Call / WhatsApp use the ticket phone.

### Thread
- **D-08:** Original form (name, email, phone, message, time) plus thread, newest last, scroll to bottom. `booking_ref` / `locale` chips when they exist.
- **D-09:** Stored text is escaped. Never raw inbound HTML.
- **D-10:** Inbound files from Phase 14 render on that message: image preview, other types filename + download. Staff-only.
- **D-11:** EN/DE/FR/AR same pass. Dual-DC: `app/ops/OpsSupportTicket.dc.html` then the public copy.

### Must-nots
- **D-12:** No Staff tab. No Next `/ops/support`. No `POST /api/quote`. No live DNS. No `env.production`. No push `main`. Funnel 7–11 frozen.

### Claude's Discretion
- PATCH shape for `{ phone, booking_ref, note }` — reuse `/api/staff/tickets/:id` if it stays clean; do not invent a second overlay.
- How image preview is sized in the existing bubble — tokens only, no glow, no tinted yellow.
- Reopen target stays `open` (Phase 12 discretion + current DC).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product
- `.planning/ROADMAP.md` — Phase 15 success criteria SUP-01/03/04/05; DC hash console; must-nots
- `.planning/REQUIREMENTS.md` — SUP-01, SUP-03, SUP-04, SUP-05
- `.planning/phases/12-ticket-schema-support-mock/12-CONTEXT.md` — list chrome D-01…D-09 except badge (15 D-01) and refresh (15 D-02)
- `.planning/phases/13-staff-apis-outbound-resend-replies/13-CONTEXT.md` — Send PATCH `{ reply }`, generic overlay error, Closed no send
- `.planning/phases/14-inbound-webhook/14-CONTEXT.md` — inbound rows + files this UI must show

### Live DC
- `app/ops/OpsSupportTicket.dc.html` — writer. Overlay, kanban, table, Send, Close, Reopen, mailto/Call/WA. Change persist to **one Save** (D-04); do not restyle the board.
- `app/ops/OpsSidebar.dc.html` — `#support`, icon `mail`, badge event `vamos:support-badge` (payload must carry New+Responded)

### Code
- `apps/web/app/[locale]/(ops)/api/staff/tickets/` — GET list + PATCH
- `apps/web/lib/ops/tickets.ts` / `tickets-map.ts` / `tickets-write.ts` — map `whoKey` already knows `note` / `staff_note`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- GET `/api/staff/tickets` already hydrates the board. Extend payload for files + ensure notes/inbound/outbound are all in `messages`.
- PATCH already handles status + `{ reply }`. Save is additional fields, same overlay error.
- `publishBadge` today counts `status === 'new'` only — change to New+Responded.

### Established Patterns
- Ops is DC hash console, not Next `/ops/support`
- Dual DC: `app/ops/` then public copy
- Generic `overlayError` copy already in DC (`tLoadError` / send fail). Reuse for Save refuse.
- Zurich stamps via `Europe/Zurich` in the DC `stamp()`

### Integration Points
- 13 Send already appends staff bubble then `hydrate()`
- 14 ingest is the source of inbound + files; 15 only displays
- `saveNote` today is local-only — D-04 makes it a real PATCH

</code_context>

<specifics>
## Specific Ideas

- “make one save button unify them all” — phone + ref + note, one Save
- Booking ref must match a real VT- booking or refuse
- Keep Email + Call + WhatsApp as painted
- Badge = New + Responded (waiting on you)
- Refresh on enter, after own writes, and tab focus — no poll

</specifics>

<deferred>
## Deferred Ideas

- Inbound ingest / Svix / quote-strip / storing files — Phase 14
- Staging MX + Gmail UAT — Phase 16
- SUP-F04 deep-link from booking ref into ops detail
- SUP-F03 assignment / SLA / macros / CSAT (local search stays)
- Catch-all `info@` tickets
- Outbound attach on Send
- Live `vamostaxi.eu` DNS

</deferred>

---

*Phase: 15-Wire Ops #support to APIs*
*Context gathered: 2026-09-17*
