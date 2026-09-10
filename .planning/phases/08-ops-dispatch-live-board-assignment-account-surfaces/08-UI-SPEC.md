---
phase: 8
slug: ops-dispatch-live-board-assignment-account-surfaces
status: draft
shadcn_initialized: false
preset: none
created: 2026-09-10
---

# Phase 8 — UI Design Contract

> **The DC mocks are the spec.** Do not redesign. Pixel-faithful port / wire. Four languages in the same pass. No glow. No tinted yellow. `CLAUDE.md` wins.

This file exists so plan-phase can proceed. It is **not** a new look. Screens live in `app/ops/*.dc.html` and `app/pages/bookings.dc.html`. New surfaces (new trip, chauffeur detail) copy neighbouring ops tokens — no marketing look.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (DC + `--vt-*`) |
| Preset | not applicable |
| Component library | none (existing ops/public components) |
| Icon library | Lucide via `Icon` only |
| Font | Qurova (existing). Do not add a webfont. |

**Forbidden:** shadcn, glow, tinted yellow, new palette, React `/ops` resurrection, hash URLs (`#dashboard` …).

---

## Spacing / Type / Color

Use existing `--vt-*` tokens from the bound design system and the DC files named below. Do not invent a 4px scale, hex table, or type ramp in this phase. If a token is missing, fail honestly — do not add a one-off pixel.

Accent is already reserved in the mocks (primary buttons, status). Do not paint extra chrome.

---

## Screens (paths — D-10, no `#`)

| Path | Mock | Notes |
|------|------|--------|
| `/dashboard` | `app/ops/OpsDash.dc.html` | All tiles live. Money by captured date. Ops always CHF. Empty = `CHF 000` / 0. No expense placeholders. |
| `/bookings` | `app/ops/OpsBoard.dc.html` | Live staff list. Unpaid pending visible. No `emptyBookings`. **New trip** control here. |
| `/bookings/new` | no dedicated mock | Same quote fields as the public site; ops tokens from `OpsDetail` / board. Quote first, then Save. |
| `/bookings/{ref}` | `app/ops/OpsDetail.dc.html` | Assign chauffeur picker (not a name field). Send pay-link / take card (same card fields as public payment). Refund vs Cancel are two actions. |
| `/calendar` | `app/ops/OpsCalendarBoard.dc.html` | Same board data. |
| `/customers` | `app/ops/OpsCustomers.dc.html` | Every booking email. Empty list if none — never Isolation Customer*. |
| `/customers/{email}` | neighbouring customers/detail | Trips + contact. Write-through edits. |
| `/fleet` | `app/ops/OpsFleet.dc.html` | Save must persist chauffeur ↔ vehicle. |
| `/fleet/chauffeurs/{id}` | no dedicated mock | Profile + read-only live trips. Ops tokens. Assign still on trip detail. |
| `/support` | `app/ops/OpsSupportTicket.dc.html` | Already Support, not Staff. Do not restyle. |
| `/pricing` `/login` | existing ops | Path-only change if they still hash. |
| Public `/bookings` | `app/pages/bookings.dc.html` | Paid trips for JWT email. Chauffeur + vehicle from fleet after assign. Empty until assigned. |

Sidebar: `app/ops/OpsSidebar.dc.html` — hrefs become real paths, same labels.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTAs | Use the verbs already on the mock (Assign, Unassign, Send pay-link, Refund, Cancel, Continue). Do not invent “Dispatch” / “Mark paid”. |
| Empty board / customers | Empty. Not Isolation names. Not `VT-48xx`. |
| Empty money tiles | `CHF 000` / `0` |
| Assign conflict | Name the other trip (ref + time) and refuse |
| No chauffeur email | Cannot assign until email is saved — honest error |
| Stripe refund fail | Stay paid, show the error, try Refund again |
| Vehicle off-road must-fix | Needs attention + ops email. Not auto-cancel. |
| Legal / TBC | Leave TBC pills. Never invent legal text or CHF. |

EN/DE/FR/AR in the same pass for any new string.

---

## Interaction

- In-place updates, silent, no full reload, no sound.
- Two laptops both update. Detail stays on the trip.
- Tile click → `/bookings` or `/calendar` already filtered.
- Take card on ops detail = same Payment Element fields as public `/checkout/payment`. Charge CHF.
- Customer paid edit = request UI + ops accept. Trip unchanged until extra captured.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | — | do not add shadcn |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — mock verbs; no invented legal/CHF
- [x] Dimension 2 Visuals: PASS — DC files are the pixels
- [x] Dimension 3 Color: PASS — `--vt-*` only
- [x] Dimension 4 Typography: PASS — existing ops/public type
- [x] Dimension 5 Spacing: PASS — existing ops spacing
- [x] Dimension 6 Registry Safety: PASS — no third-party registry

**Approval:** DC-as-spec 2026-09-10 (not a redesign)
