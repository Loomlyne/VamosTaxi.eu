---
phase: 12
slug: ticket-schema-support-mock
status: draft
shadcn_initialized: false
preset: none
created: 2026-09-10
---

# Phase 12 — UI Design Contract

> Pixel-faithful to `app/ops/OpsSupportTicket.dc.html`. Do not redesign the ops chrome. Tokens only `--vt-*`. Lucide via existing `Icon`. No glow. No tinted yellow.

The DC file **is** the contract. This document only records discuss deltas (D-01…D-09, D-12…D-14).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (DC ops console) |
| Preset | Vamos `--vt-*` |
| Component library | `VamosTaxiDesignSystem` in the DC (Dialog, Table, Input, BrandSelect, Icon) |
| Icon library | Lucide via `Icon` |
| Font | `--vt-font-body` / `--vt-font-display` |

---

## Spacing / type / color

Use existing tokens on the page. Do not introduce a new scale. Kanban gap stays `14px` as in `[data-kb]`. Card padding stays `12px`. Do not switch to a 4px-grid rewrite.

Accent is charcoal (`--vt-charcoal-900`) on selected card border — already in the mock. No yellow CTA glow.

---

## Layout (D-01…D-09, D-12)

### Desktop default

Five kanban columns in `[data-kb]`: `new` / `open` / `replied` / `responded` / `closed`. CSS `grid-template-columns: repeat(5, minmax(0, 1fr))`. Not four.

Desktop **Kanban / Table** switch stays. Default Kanban.

### Phone

Table. Do not side-scroll five columns as the default phone view.

### Overlay

Click card/row → existing `Dialog` on top of the board. Thread left, details right. Not a route replace.

### Empty / error

- GET success + zero tickets: **five empty columns**, each with `data-kb-empty` “no tickets” line. **No** fixture cards. **No** page-level empty hero that hides the columns.
- GET/network fail: **error banner** above the board. Never fixtures. Never silent empty columns pretending success.

### Card (redesign vs current mock)

Keep: name, email, time, `booking_ref` chip if non-empty, locale chip if present.
Remove: `[data-quote]` message preview, grip, `draggable`, drop target, drag hint copy.
Missing booking_ref: still a ticket; omit the chip.

### Column header

Label + count + **sort arrow**. Click flips **that column** newest ↔ oldest. Default newest first.

### Search

Works. Filters loaded tickets by name, email, message (and may include ref). Not macros/SLA/saved replies.

### Filter

- **All** → kanban (unless user picked Table on desktop).
- **One status** → table of those tickets. Extra columns: **phone** + **status** (display). Plus name, email, time, ref, locale. Status cell is **not** a PATCH control.

### Overlay actions this slice

- Close button → Closed.
- Reopen button on Closed → Open.
- Reply composer may stay painted; Send does **not** send and does **not** change status.
- No status dropdown that sets arbitrary columns.

### Sidebar

`#support`, icon `mail`, after Customers. Badge = count of **New** only. Default badge count **0** until GET. No `#staff`.

### Copy

Four languages in the DC `T` object (en/de/fr/ar), same pass. Closed body must **not** say inbound never reopens.

---

## Copywriting

| Element | Copy (EN; translate in T) |
|---------|---------------------------|
| Title | Support |
| Search placeholder | Name, email, ref, or message |
| Empty column | No tickets |
| GET error | Could not load tickets. Try again. |
| Close | Close Ticket |
| Reopen | Reopen |
| Fifth column | Responded |

---

## Motion

No hash-switch overlay (`vt-ops-hash-switch` stays gone). No drag motion. Column/card hover borders already in the file may stay.

---

## Checker note

If current source still has four columns or drag, that is the **bug**, not a reason to rewrite this contract.
