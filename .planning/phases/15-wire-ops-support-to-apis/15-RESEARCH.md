# Phase 15: Wire Ops #support to APIs - Research

**Researched:** 2026-09-18
**Domain:** Live `#support` DC hash console → staff tickets GET/PATCH (list, overlay Save, badge, hydrate, escaped thread, inbound file display)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Board
- **D-01:** Sidebar Support badge = count of **New + Responded** (waiting on dispatcher). Amends Phase 12 D-09 (New only).
- **D-02:** Hydrate on entering `#support`, after Send / Close / Reopen / **Save**, and when the browser tab gains focus. That hydrate includes the **open overlay** thread. **No** interval poll. Amends Phase 12 D-11 (adds focus + Save).
- **D-03:** Kanban / one-status table / search / card chips / empty columns / load-error banner stay as Phase 12 + current `OpsSupportTicket.dc.html`. Do not redesign the board.

### Overlay fields
- **D-04:** Phone, booking ref, and internal note are live. **One Save** writes all three. Relabel the control **Save** (not “Save note”). Typing without Save does not persist.
- **D-05:** Empty note is fine — Save still writes phone + ref. Non-empty note appends a dashed `staff_note` thread line, then clears the note field (same as today’s `saveNote` bubble).
- **D-06:** `booking_ref` empty = no chip, ticket still valid. If filled, it **must** match a real `bookings.reference` (or uuid id, same as `resolveStaffBookingId`) or the **entire Save refuses** (generic overlay error, nothing written). No lookup UI. No jump to booking detail (SUP-F04 later).
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

### Deferred Ideas (OUT OF SCOPE)
- Inbound ingest / Svix / quote-strip / storing files — Phase 14
- Staging MX + Gmail UAT — Phase 16
- SUP-F04 deep-link from booking ref into ops detail
- SUP-F03 assignment / SLA / macros / CSAT (local search stays)
- Catch-all `info@` tickets
- Outbound attach on Send
- Live `vamostaxi.eu` DNS
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUP-01 | Dispatcher opens Ops `#support` and sees every contact submission as a ticket | GET `/api/staff/tickets` already hydrates `contact_submissions`. Keep that list. No fixtures. |
| SUP-03 | Overlay shows original form (name, email, phone, message, time) plus thread, newest last | Meta pane already paints name/email/phone/when. First customer bubble is form `message`. GET must include inbound/outbound/`staff_note` in `messages` ordered `created_at` asc; DC already `scrollThread` to bottom. |
| SUP-04 | Ticket shows form `booking_ref` and `locale` when they exist | Mapper already sets `bookingRef` / `locale`. Empty ref omits chip. Save may write ref (D-06). |
| SUP-05 | Dispatcher can filter the list by status | Already in DC (All = kanban, one status = table). Do not restyle. |
</phase_requirements>

## Summary

Phase 15 is **wire the existing hash console**, not a new Support page. Writer is `app/ops/OpsSupportTicket.dc.html` (+ `OpsSidebar.dc.html` badge payload). Dual-DC public copy after DC edits. Staff APIs already exist: GET list, PATCH `{ status }` and (Phase 13) `{ reply }`.

**Gaps vs CONTEXT:**

1. **Badge** — `publishBadge` counts `status === 'new'` only. Change to `new` **or** `responded`. Event stays `vamos:support-badge`; payload field may stay `newCount` if sidebar only reads the number — do not invent a second event.
2. **Hydrate** — `componentDidMount` + after persist Send/Close/Reopen. No `visibilitychange` / `focus`. Add tab-focus hydrate including open overlay. No `setInterval`. After Save, call the same `hydrate()` path as Send.
3. **Save** — `saveNote` is **local-only** (concat a note bubble, never PATCH). Phone/ref `patchOpen` is local state only. `noteOff` **disables** the button when note is empty — that violates D-05. Relabel `tSaveNote` → Save in four languages; enable Save whenever overlay is open; PATCH `{ phone, booking_ref, note }` on the **same** `/api/staff/tickets/:id`. Typing without Save does not persist.
4. **booking_ref** — filled value must exist on `public.bookings` (`reference` or `id::text`, `erased_at is null`) via the existing `resolveStaffBookingId` analog. Miss → `{ ok: false }` → generic `overlayError` (`tLoadError` / send-fail copy already in DC). Write **nothing**. Empty ref is valid.
5. **Files** — `OpsTicketMessage` has no `files`. Phase 14 owns `support_message_files` + staff GET `/api/staff/tickets/:id/files/:fileId`. Phase 15 only **renders** `files` on the message when present. If 14 table/bind is missing, GET still 200 with `files: []`. Do not 500 the board. Do not invent a public file URL.
6. **Escape** — DC paints `{{ m.body }}` (not `innerHTML`). Keep that. Mapper must not pass HTML. Never `dangerouslySetInnerHTML`.

**Primary recommendation:** Extend `PatchTicketInput` with optional `phone`, `booking_ref`, `note` on the existing PATCH. Status-only and `{ reply }` paths stay. Save is a third branch: validate ref, update `contact_submissions.phone` + `booking_ref`, insert `support_messages` with `direction` `staff_note` only when note is non-empty, then GET hydrate. Badge + focus hydrate + dual-DC copy + file chips in the existing `[data-msg]` bubble.

**Graph context:** `.planning/graphs/graph.json` is absent. No graph queries.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GET ticket list + messages + optional files | API / Backend | Database | `loadTickets` + `mapTicket`. Browser must not query Hyperdrive. |
| PATCH status / reply | API / Backend | Resend (13) | Already `patchTicket`. Do not reopen send identity. |
| PATCH phone + booking_ref + note | API / Backend | Database | Same route. `resolveStaffBookingId` for D-06. |
| Badge New+Responded | Browser / Client (DC) | Sidebar | Count in `publishBadge`; sidebar already listens. |
| Hydrate enter / after writes / tab focus | Browser / Client (DC) | GET | No poll. Re-apply open overlay from fresh GET. |
| File bytes | Phase 14 staff GET | R2 `SUPPORT_FILES` | 15 only `<img>` / download `href` to that staff route. |
| Dual-DC | CDN / Static | `scripts/sync-dc-mock-to-public.mjs` | Writer `app/ops/`. Do not patch public by hand. |
| Inbound ingest / MX / Staff tab / quote | — | — | Out of scope (14, 16, D-12). |

## Current code (main checkout 2026-09-18)

| File | Today | 15 change |
|------|-------|-----------|
| `apps/web/lib/ops/tickets.ts` | SELECT submissions + messages (`body_text`, `direction`) | Left join or second query for files when table exists; never fail closed on missing relation |
| `apps/web/lib/ops/tickets-map.ts` | `OpsTicketMessage` `{ whoKey, when, body }` | Add `files?: { id, filename, contentType, kept }[]`. Escape `body`. `whoKey` already maps `staff_note` → `note` |
| `apps/web/lib/ops/tickets-write.ts` | `PatchTicketInput` `{ status?, reply? }` | Add `{ phone?, booking_ref?, note? }` branch. Empty note skips insert. Invalid ref → `invalid-booking-ref` (map to 400, generic overlay) |
| `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts` | Parses `status` / `reply` | Parse phone / booking_ref / note; pass through |
| `apps/web/lib/ops/resolve-booking-id.ts` | Staff lookup `id` or `reference` | Reuse. Do not duplicate SQL. |
| `app/ops/OpsSupportTicket.dc.html` | Local `saveNote`; badge New; no focus hydrate | Save PATCH; badge; focus; file nodes in `[data-msg]`; `noteOff` false when overlay open |
| `app/ops/OpsSidebar.dc.html` | `#support`, `vamos:support-badge` | Keep event. Count is New+Responded. |

Phase 13 send-then-GET lives on `gsd/phase-13-staff-apis-outbound-resend-replies` (PR 38). Do not revert `rejectStaffReply` or send path in 15. If 15 execute lands before 13 merge, do not rewrite `reply` handling.

## Discretion: PATCH shape

One JSON object on existing PATCH:

```json
{ "phone": "+41 …", "booking_ref": "VT-…", "note": "" }
```

- Presence of `phone` / `booking_ref` / `note` (any of the three keys) selects the Save branch.
- Do not combine Save with `{ reply }` or `{ status }` in one request.
- Persist phone even if empty string (clear). Persist booking_ref empty (clear chip). Note empty = no `support_messages` row.
- `direction` for the note row: `staff_note` (mapper already treats `note` / `staff_note` as `whoKey: "note"`).

## Files display (D-10)

14-06 staff GET: `withStaff`, stream `SUPPORT_FILES`, `Content-Disposition` inline for `image/*`, attachment for pdf. 15 DC:

- `kept: true` + `contentType` starts with `image/` → `<img>` in the bubble, max width existing overlay column, `object-fit: contain`, no glow.
- Other kept types → filename + download link to `/api/staff/tickets/{ticketId}/files/{fileId}` (staff cookie).
- `kept: false` → muted filename line already stored as text by 14, or skip empty files array.

If GET has no `files` key, treat as `[]`.

## Validation Architecture

**Framework:** vitest in `apps/web` on `lib/**/*.test.ts`. Source-read DC with `readFileSync` (same as 13-10 must-not). Do **not** point `<automated>` at `tests/integration/*.spec.ts` (`passWithNoTests` would go green).

**No new SQL this phase.** File table is 14 (`autonomous: false` owner apply). 15 does not `supabase db push`.

**Nyquist map (planner remaps task IDs):**

| Threat | Secure / correct behavior | Type |
|--------|---------------------------|------|
| T-15-01 | Badge counts new+responded only | unit or source |
| T-15-02 | Save PATCH writes phone+ref; empty note no message row | unit `tickets-write` |
| T-15-03 | Filled unknown booking_ref refuses entire Save | unit |
| T-15-04 | GET mapper escapes body; no innerHTML in DC | source + unit |
| T-15-05 | No `/ops/support` page; no `POST /api/quote` in these files | source |
| T-15-06 | Files array optional; missing table does not throw | unit with stub |
| T-15-07 | Dual-DC public copy after DC edit | source / script |
| T-15-08 | No interval poll; focus + Save call hydrate | source DC |

**Human UAT (after deploy, not this research):** dashboard `#support` list, overlay Save, invalid VT- ref shows overlay error, badge, tab-focus refresh. Owner. Do not fake Gmail. MX is 16.

## Pitfalls

- **`noteOff`:** today Save is disabled when note is empty. D-05 requires Save for phone/ref alone. Flip that.
- **Optimistic phone/ref:** `patchOpen` mutates local tickets. After failed Save, revert from GET (already `hydrate` on ok; on fail set `overlayError` and re-hydrate or restore).
- **14 not applied:** `select` from `support_message_files` will error if relation missing. Feature-detect or catch undefined_table and return `files: []`. Do not block 15 on 14-07 owner apply.
- **13 not merged:** do not touch send/From/BCC in 15.
- **CTA copy:** overlay control is **Save**, not Save note / Submit / OK.
- **Accent:** do not paint every button yellow. Existing charcoal selected card stays. No Publish/Live badge on this page.

## PATTERN / UI

UI-SPEC is required (ROADMAP `UI hint: yes`). DC remains the visual source. UI-SPEC records 15 deltas only (badge, Save, hydrate, files in bubble).

## RESEARCH COMPLETE
