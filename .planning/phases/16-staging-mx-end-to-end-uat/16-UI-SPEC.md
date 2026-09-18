---
phase: 16
slug: staging-mx-end-to-end-uat
status: draft
reviewed_at: 2026-09-18
shadcn_initialized: false
preset: none
created: 2026-09-18
---

# Phase 16 — UI Design Contract

> No new screens. No restyle. Pixel-faithful to Phase 15 / `app/ops/OpsSupportTicket.dc.html`.
> This phase is MX + From flag + live Gmail UAT. The overlay is the **observation surface**, not a design delta.
> Tokens only `--vt-*`. Lucide via `Icon`. No glow. No tinted yellow. No invented CHF.
> Four languages unchanged (no new copy keys this phase).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (DC ops hash console) |
| Preset | Vamos `--vt-*` |
| Component library | existing `VamosTaxiDesignSystem` in the DC |
| Icon library | Lucide via `Icon` |
| Font | `--vt-font-body` / `--vt-font-display` |

Do **not** initialize shadcn. No new registry. No Next.js `/ops/support` page. No Staff tab.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps (existing) |
| sm | 8px | Compact (existing) |
| md | 16px | Default (existing) |
| lg | 24px | Section (existing) |
| xl | 32px | Layout (existing) |
| 2xl | 48px | Major (existing) |
| 3xl | 64px | Page (existing) |

Exceptions: none. Do not add spacing.

---

## Typography

Map to existing tokens only. Do not add a fifth size or a third weight.

| Role | Size | Weight | Token |
|------|------|--------|-------|
| Body | 16 | 400 | `--vt-body-md` |
| Label / meta | 14 | 400 | `--vt-body-sm` |
| Heading 3 | 20 | 600 | `--vt-heading-3` |
| Heading 2 | 26 | 600 | `--vt-heading-2` |

Weights: 400 + 600 only.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg` | Ops canvas (unchanged) |
| Secondary (30%) | `--vt-surface` | Board / overlay (unchanged) |
| Accent (10%) | `--vt-accent` | **not used by this phase** |
| Destructive | `--vt-danger` | Existing Close Ticket only |

Accent reserved for: Publish / active tab / preview total / Live badge — **none of those are added here**. Support active tab already exists from Phase 15; do not retint it. Never “all interactive elements”.

---

## Screens

| Screen | Route / hash | What 16 changes |
|--------|----------------|-----------------|
| Public contact | `https://vamostaxi.site/contact` | None. New submission this sitting for UAT (D-12) |
| Support board | `https://dashboard.vamostaxi.site` → Support rail | None. Observe inbound |
| Ticket overlay | same, Dialog | None. Confirm escaped body + image preview + PDF download (already 15) |
| Gmail | Koss’s real mailbox | Not a Vamos screen. Agent does not open it |

No new screens. No booking-detail jump. No Staff.

### Desktop (≥861px) / Tablet / Phone

Unchanged Phase 15: five columns desktop; table below 860px; overlay Dialog. Do not invent a layout.

### Files (observe only, D-16)

Same 15 rules inside `[data-msg]`:

- Image kept: preview, max-width 100%, `object-fit: contain`, no glow, no yellow wash
- PDF kept: filename + staff download
- Missing files: nothing extra

---

## States

| State | UI |
|-------|-----|
| After Gmail Reply (happy) | Same ticket overlay; new customer bubble; status **Responded** (including previously Closed) |
| No-token inbound | Board unchanged for that mail; no new ticket |
| `<script>` in Reply | Escaped text in the bubble; no executable node |
| Unsigned webhook | Not a UI state (HTTP 4xx) |
| GET empty board | Existing `colEmpty` **No tickets** — do not write “No data found” |

No new loading skeleton. No poll (15 D-02). Tab-focus hydrate stays.

---

## Interaction

UAT only. No new handlers.

| Actor | Action | Surface |
|-------|--------|---------|
| Koss | Submit `/contact` | Public site |
| Agent | Staff **Send** on that ticket | Existing overlay Send (not renamed) |
| Koss | Reply in Gmail, with image + PDF | Gmail |
| Agent | Open Support rail, open ticket | `dashboard.vamostaxi.site` |
| Koss | Confirm intake + staff BCC in `info@` Gmail | Gmail |

Do not add buttons. Do not relabel Send / Save / Close / Reopen.

---

## Copywriting Contract

This phase adds **no** user-facing strings and **no** CTAs. Overlay verbs stay Phase 15 (`Send` for reply, `Save route`-style they already painted as **Save** for phone/ref/note). Do not add Submit / OK / Cancel / Click Here.

| Element | Copy |
|---------|------|
| Primary CTA | none this phase (MX + UAT only) |
| Empty state heading | **No tickets** (existing `colEmpty`) |
| Empty state body | Board stays empty until a contact exists — next step is `/contact`, not a new button |
| Error state | existing sendError; dispatcher retries **Send** |
| Destructive confirmation | none new (Close Ticket already in DC; no extra dialog) |

No new i18n keys. EN/DE/FR/AR stay as Phase 15.

---

## Must-nots (visual)

- No new Support chrome, hash, or page
- No Staff tab
- No glow, no tinted yellow, no invented CHF
- No “No data found”
- No interval poll
- No extra font size/weight
- No accent on Send/Save

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not required |

---

## Motion

No hash-switch overlay. No poll. No new animation.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-18 (gsd-ui-checker)

## UI-SPEC COMPLETE
