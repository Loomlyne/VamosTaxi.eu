---
phase: 15
slug: wire-ops-support-to-apis
status: approved
reviewed_at: 2026-09-18
shadcn_initialized: false
preset: none
created: 2026-09-18
---

# Phase 15 — UI Design Contract

> Pixel-faithful to `app/ops/OpsSupportTicket.dc.html` + `app/ops/OpsSidebar.dc.html`.
> Do not redesign the board (D-03). Tokens only `--vt-*`. Lucide via `Icon`. No glow. No tinted yellow. No invented CHF.
> Four languages in the same pass. Dual-DC: writer `app/ops/`, then public copy.

The DC files **are** the visual source. This contract records Phase 15 deltas (D-01…D-12) on top of Phase 12 UI-SPEC.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (DC ops hash console) |
| Preset | Vamos `--vt-*` |
| Component library | `VamosTaxiDesignSystem` already in the DC (Dialog, Table, Input, Textarea, Button, Icon, Logo) |
| Icon library | Lucide via `Icon` |
| Font | `--vt-font-body` / `--vt-font-display` |

Do **not** initialize shadcn. No new registry. No Next.js `/ops/support` page.

---

## Screens

| Screen | Route / hash | What 15 changes |
|--------|----------------|-----------------|
| Support board | `https://dashboard.vamostaxi.site/#support` | Hydrate GET; badge New+Responded; no restyle |
| Ticket overlay | same hash, Dialog on top | One **Save** for phone + booking ref + note; files in existing bubbles; generic overlay error on Save refuse |
| Sidebar | ops chrome | Badge count = New + Responded. Icon `mail`. No Staff tab |

No new screens. No booking-detail jump (SUP-F04 deferred).

---

## Layout

### Desktop (≥861px)

Unchanged Phase 12 board: five kanban columns `[data-kb]` `new / open / replied / responded / closed`. Overlay Dialog `size="lg"`: thread left (`[data-ov-chat]`), details right (`[data-ov-meta]`). Kanban / Table switch stays.

### Tablet (768–860px)

Phone table default already in DC (`opsPhone` 860px). Overlay still Dialog. Do not invent a third layout.

### Phone (≤767px)

Table, not five-column scroll. Meta pane collapse already in DC (`opsHand` 767px). Keep Email / Call / WhatsApp as painted.

### Overlay Save row

Phone + booking inputs stay in `[data-fact-pair]`. Note + **Save** stay in `[data-note-save]`. Relabel only. Do not move Send / Close / Reopen.

### Files (D-10)

Inside the existing `[data-msg]` bubble, after `{{ m.body }}`:

- Image (`kept` + `contentType` image/*): preview, max-width 100% of bubble, `object-fit: contain`, no border glow, no yellow wash.
- Other kept: filename + download (staff GET). Same `--vt-body-sm`.
- Missing / empty `files`: nothing extra.

---

## States

| State | UI |
|-------|-----|
| GET loading first paint | Existing empty columns until data; no skeleton rewrite |
| GET zero tickets | Five empty columns; `colEmpty` **No tickets** (not “No data found”) |
| GET fail | Banner `loadError` above board: **Could not load tickets. Try again.** |
| Overlay open | Thread newest last, scroll bottom. Form name/email/phone/time in meta |
| Save in flight | Do not invent a spinner if DC has none; disable double-click by existing sending pattern if present |
| Save ok | Hydrate; note field cleared if a note was sent; overlay stays open |
| Save refuse (bad booking ref / network) | Generic overlay error (`tLoadError` / existing `data-ov-err`). Nothing persisted. No Resend JSON |
| Closed ticket | Composer hidden; Reopen painted; Save still allowed for phone/ref/note |
| Tab hidden → focus | Re-GET; if overlay open, refresh that thread |

No interval poll.

---

## Interaction

| Action | Result |
|--------|--------|
| Enter `#support` | `hydrate()` GET |
| Send / Close / Reopen / **Save** | persist then `hydrate()` including open overlay |
| Browser tab focus / `visibilitychange` visible | `hydrate()` |
| Type phone / ref / note | local only until Save |
| Save, empty note | writes phone + ref; no note bubble |
| Save, non-empty note | writes all three; dashed note line; clears note |
| Save, filled ref not a real booking | refuse all; overlay error |
| Email / Call / WhatsApp | as painted (`mailto:` / `tel:` / `wa.me` from ticket phone) |
| Click booking chip | **no** navigation |

---

## Must-nots (UI)

- No Staff tab. No Next `/ops/support`.
- No redesign of kanban / table / search / empty columns.
- No glow, no tinted yellow, no invented CHF.
- No `innerHTML` on message body.
- No public hotlink for files.
- No “Keep editing” unless already in this DC (dismiss is Dialog `onClose`).
- No CTA labelled Submit / OK / Cancel on this overlay. Persist verb is **Save**. Mail verb stays **Send**.

---

## Spacing Scale

Declared values (multiples of 4) for **new** 15 nodes only:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Chip / file-name gap |
| sm | 8px | File row under body (existing `gap:8px` on who/when row) |
| md | 16px | Do not add new section padding |
| lg | 24px | unused this phase |
| xl | 32px | unused this phase |
| 2xl | 48px | unused this phase |
| 3xl | 64px | unused this phase |

Exceptions (already in DC — do not rewrite to 4px grid): kanban gap `14px`, card padding `12px`, sidebar padding `22px`, nav gap `11px` / `3px`, badge `18×18` / `11px` type.

Image preview: width 100% of bubble; no extra 5px radii.

---

## Typography

| Role | Size | Weight | Line Height | Token |
|------|------|--------|-------------|-------|
| Body | 16px | 400 | 1.5 | `--vt-body-md` |
| Label / bubble body | 14px | 400 | 1.55 | `--vt-body-sm` |
| Heading 3 | 20px | 600 | 1.3 | `--vt-heading-3` |
| Heading 2 | 26px | 600 | 1.2 | `--vt-heading-2` |

Only 400 and 600. Do not add a fifth size this phase.

Exception already in DC: timestamp `font-size:var(--vt-body-xs)` + `opacity:.72`; sidebar badge `11px` / weight 600. Do not spread xs to new copy.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg` / white surfaces | Board, overlay |
| Secondary (30%) | `--vt-bg-inverse` | Sidebar rail (existing) |
| Accent (10%) | `--vt-yellow-500` (`#FDC20B`) | **Not used on new 15 controls** |
| Destructive | existing outline Close | Close Ticket only — already painted |

Accent reserved for: **nothing new on `#support`**. This page has no Publish, no Live badge, no preview total. Do not put yellow on Save, Send, inputs, or file previews. Selected card border stays charcoal (`--vt-charcoal-900`) as in Phase 12. Sidebar active hash stays as painted (not a new yellow pill).

---

## Copywriting Contract

| Element | Copy (EN; same keys in de/fr/ar) |
|---------|----------------------------------|
| Primary persist CTA | **Save** (not Save note) |
| Send | Send (unchanged) |
| Close | Close Ticket |
| Reopen | Reopen |
| Empty column | No tickets |
| Empty body | Contact-page messages land here. |
| GET / Save error | Could not load tickets. Try again. |
| Destructive | Close Ticket — no extra confirm dialog this phase (DC has none) |

### Save label (D-04, D-11)

| Locale | `saveNote` key value |
|--------|----------------------|
| en | Save |
| de | Speichern |
| fr | Enregistrer |
| ar | حفظ |

Email / Call / WhatsApp labels stay `Email` / `Call` / `WhatsApp` (and current translations).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not required |

---

## Motion

No hash-switch overlay. No poll. No new animation on file preview.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-18 (gsd-ui-checker, D-04 Save override)

## UI-SPEC COMPLETE
