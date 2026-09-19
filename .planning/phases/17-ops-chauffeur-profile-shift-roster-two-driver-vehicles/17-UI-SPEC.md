---
phase: 17
slug: ops-chauffeur-profile-shift-roster-two-driver-vehicles
status: approved
shadcn_initialized: false
preset: none
created: 2026-09-18
reviewed_at: 2026-09-18
---

# Phase 17 — UI Design Contract

> Visual and interaction contract for frontend phases. Generated for gsd-ui-checker.
>
> **Canonical:** `17-CONTEXT.md` D-01…D-18 wins on conflict.

**Framing.** Grow the existing fleet desk — do not invent a second dashboard. Source file: `app/ops/OpsFleet.dc.html`. Live `ops.dc.html` must `dc-import name="OpsFleet"` (today it loads stale `OpsFleetBoard.dc.html`). Dual-DC: then `node scripts/sync-dc-mock-to-public.mjs`. Worker serves `apps/web/public/app/ops/`. Do not strip injected `<base href="/app/ops/">`. Bound Vamos tokens only (`--vt-*`, Qurova, `#FDC20B`). Desktop, tablet, and phone in the same pass. Staff ops (dispatcher). No driver app.

Copy in this contract is English. Ship **en / de / fr / ar** in the same sitting (`app/vamos-i18n-dict.js` + `OpsFleet.dc.html` `T` map; Swiss German, "ss" not "ß"). Arabic `dir="rtl"` from `VamosLocale`. Logical CSS properties only.

Every `.dc.html` on this surface sets `--vt-shadow-accent:none` in `:root` and `.vt-input--focus{box-shadow:none}`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Vamos Design Component kit + `--vt-*` only) |
| Preset | not applicable |
| Component library | none (existing Vamos DC: `Button`, `IconButton`, `Icon`, `Input`, `Tabs`/`Tag`, `Dialog`, `Card`, `Badge`, `OpsTable`, `OpsSidebar`) |
| Icon library | Lucide via `Icon` only — never hand-drawn SVG, never emoji, never `→` as an icon |
| Font | Qurova display (`--vt-font-display`), Poppins body (`--vt-font-body`). Do not add a webfont. |

**Ops shell:** `OpsSidebar`, not `SiteHeader` / `SiteFooter`. Sidebar items stay **Vehicles** → `/fleet` and **Chauffeurs** → `/fleet/chauffeurs`.

**Compose, do not restyle.** Use kit components. Local `[data-*]` rules are for layout only (desk two-column, leave list, weekday ticks) and for pieces the kit has no component for. Never restate `Button` / `Input` / `Dialog` / `OpsTable` in local CSS.

**Forbidden:** shadcn, `components.json`, glow, `--vt-shadow-accent`, tinted yellow (`--vt-yellow-50` / `-100` / `-200` / `-300` / `-600` / `-700`), `Alert tone="accent"`, `Badge tone="warning"`, `ListRow` yellow-50 lead tiles, driver app, auto-dispatch, `vamostaxi.eu`, live Stripe keys, Staff tab, unlimited `chauffeurIds` multi-select, status `<select>` as the duty switch, sample `VT-` empty rows.

---

## Spacing Scale

Declared values (must be multiples of 4). Map to the 4px `--vt-*` scale.

| Token | Value | `--vt-*` | Usage |
|-------|-------|----------|-------|
| xs | 4px | `--vt-space-1` | Icon gaps, inline padding |
| sm | 8px | `--vt-space-2` | Compact element spacing, header action gap, weekday tick gap |
| md | 16px | `--vt-space-4` | Default element spacing, profile row gap, card padding |
| lg | 24px | `--vt-space-6` | Section padding, pane stack gap |
| xl | 32px | `--vt-space-7` | Layout gaps, header inline padding |
| 2xl | 48px | 4px × 12 | Major section breaks, page bottom padding |
| 3xl | 64px | 4px × 16 | Page-level spacing |

Exceptions:

- **44px** minimum touch on phone icon-only controls (WCAG 2.2 target size). Not a layout gap.
- Button `size-sm` stays the existing Button component height — not a spacing token.
- Overlay / Dialog that owns its own scroll: `data-lenis-prevent` (and `data-scroll-native` where the panel scrolls). Not a spacing token.

Do not use 14px / 18px / 20px / 26px as **padding**. Those numbers are type, not space.

---

## Typography

Exactly four sizes. Exactly two weights (400 and 600). No other size or weight on these screens.

| Role | Size | Token | Weight | Line height | Usage |
|------|------|-------|--------|-------------|-------|
| Label | 14px | `--vt-body-sm` | 600 | 1.45 | Kickers, table headers, page subtitle, field labels, back link, badges |
| Body | 16px | `--vt-body-md` | 400 | 1.6 | Table cells, helper copy, dialog body, empty/error body, profile values, booking rows |
| Heading | 20px | `--vt-heading-3` | 600 | 1.18 | Section headings (Profile, Shift, Leave, Live trips, Past bookings) |
| Display | 26px | `--vt-heading-2` | 600 | 1.18 | Page title (Vehicles / Chauffeurs / chauffeur name) and KPI figures |

Page title uses Display. Table cells use Body. Kickers, table headers, and badges use Label (uppercase + `--vt-label-tracking` on kickers / headers / badges only). Display and Heading use Qurova (`--vt-font-display`). Body and Label use Poppins (`--vt-font-body`).

Do not use `--vt-body-xs` or `--vt-figure-lg` on this phase’s surfaces — map them to Label / Display.

---

## Color

60 / 30 / 10 explicit. Hex from `CLAUDE.md` only: yellow `#FDC20B`, charcoal `#1E1F1F`, grey `#DEDEDE`. Never invent a colour.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg-surface` / white page (`--vt-white`) | Page background, tables, overlays, desk cards |
| Secondary (30%) | `--vt-charcoal-900` (`#1E1F1F`) | Ops sidebar |
| Accent (10%) | `#FDC20B` / `--vt-accent` | Reserved list below only |
| Destructive | `--vt-danger` | Delete chauffeur / delete leave / save error text |
| Success | `--vt-success` (existing Badge `tone="success"`) | **On shift** badge only |
| Neutral | Badge `tone="neutral"` | **Off duty** |
| Outline | Badge `tone="outline"` | **On leave** |

Hairlines use `--vt-border-subtle` (`#DEDEDE`). Text on accent uses `--vt-text-on-accent` (`#1E1F1F`).

**Accent reserved for (only these):**

1. **Active Vehicles / Chauffeurs `Tag`** in the fleet header
2. **Add a chauffeur** / **Add a vehicle** primary `Button` on the list

**Not accent:** overlay saves (`Save chauffeur` / `Save shift` / `Save leave`), Keep editing, Open existing chauffeur, weekday ticks, inputs, table chrome, duty badges, photo choose, nested Add.

No glow. No `--vt-shadow-accent`. Hover / press / focus: fill or border change, `translateY(1px)` on press, charcoal shadow tokens, `--vt-ring`. Inputs: charcoal border only — no yellow ring (keep `.vt-input--focus{box-shadow:none}`).

---

## Copywriting Contract

English in this table. Translate de/fr/ar same sitting. Arabic RTL. Never Submit, OK, Click Here, Cancel, or bare Save. Never “No data found” / “No results” / “Nothing here”. Never “Something went wrong”.

Overlay persist verbs are exact. Dialog dismiss is **Keep editing**.

| Element | Copy |
|---------|------|
| List title (vehicles) | Vehicles |
| List title (chauffeurs) | Chauffeurs |
| Desk title | `{full name}` |
| Back | All chauffeurs (desk header **Button**, not a muted link) |
| Tab Vehicles | Vehicles |
| Tab Chauffeurs | Chauffeurs |
| Primary list CTA (chauffeurs) | Add a chauffeur |
| Primary list CTA (vehicles) | Add a vehicle |
| Overlay save — chauffeur | Save chauffeur |
| Overlay save — shift | Save shift |
| Overlay save — leave | Save leave |
| Nested add chauffeur (from vehicle) | Add a chauffeur |
| Nested add vehicle (from chauffeur) | Add a vehicle |
| Dialog dismiss | Keep editing |
| Duplicate email title | This email is already on file |
| Duplicate email body | `{name}` already uses this email. Open that chauffeur instead of creating another. |
| Duplicate email confirm | Open existing chauffeur |
| Double-click Add | (no dialog — one row) |
| Duty On shift | On shift |
| Duty Off duty | Off duty |
| Duty On leave | On leave |
| Seat Morning | Morning |
| Seat Night | Night |
| Vehicle seat empty | No chauffeur |
| Seat helper | One Morning and one Night. Not both morning. Not both night. |
| Refuse morning taken | This vehicle already has a Morning chauffeur. |
| Refuse night taken | This vehicle already has a Night chauffeur. |
| Refuse both taken | This vehicle already has Morning and Night chauffeurs. |
| Shift section | Shift |
| Shift helper | One start and one end, Europe/Zurich, on every day you tick. Overnight is allowed when end is before start. |
| Weekdays | Mon · Tue · Wed · Thu · Fri · Sat · Sun |
| Shift start | Start |
| Shift end | End |
| Leave section | Leave |
| Add leave | Add leave |
| Leave from | From |
| Leave until | Until |
| Leave empty heading | No leave ranges |
| Leave empty body | Add a from and until date. A range that includes today sets On leave until it ends. |
| Leave missing dates | Add From and Until before you save this leave. |
| Leave until before from | Until must be on or after From. |
| Delete leave confirm | Remove this leave range? Duty follows the clock again when no range covers today. |
| Delete chauffeur title | Delete this chauffeur? |
| Delete chauffeur body | The chauffeur leaves the console. Their vehicle stays in the fleet. |
| Profile section | Profile |
| Live trips section | Live trips |
| Live empty heading | No live trips |
| Live empty body | Assigned trips that are not finished show here. |
| Past bookings section | Past bookings |
| Past empty heading | No past bookings |
| Past empty body | Finished assigned trips show here. Open a row to see the booking. |
| Photo | Photo |
| Choose photo | Choose photo |
| Remove photo | Remove photo |
| Cannot assign no email | Cannot assign until an email is saved. |
| Empty chauffeurs heading | No chauffeurs yet |
| Empty chauffeurs body | Add a chauffeur and pair them with a Morning or Night seat on a vehicle. |
| Empty vehicles heading | No vehicles yet |
| Empty vehicles body | Add the fleet first — chauffeurs are attached to a vehicle afterwards. |
| Save failed | Save failed. Try again. |
| KPI On shift | On shift |
| KPI On shift foot | Available to assign now |
| Edit chauffeur | Edit chauffeur |
| Edit vehicle | Edit vehicle |
| Phone Add (icon-only) | aria-label matches Add a chauffeur / Add a vehicle |
| Trash aria-labels | Match the matching Delete … confirm sentence |

Duty labels stay `On shift` / `Off duty` / `On leave` (existing `CSTATUS` + i18n dict). Concatenated strings (duplicate body with name, seat refuse) go in `patterns` in `vamos-i18n-dict.js` if they are not already in the `T` map.

**Banned overlay verbs:** Save. Cancel. OK. Submit. Save status. Set on shift.

---

## Screens

| Path | Surface | Notes |
|------|---------|-------|
| `/fleet` | Vehicles list | Host `https://dashboard.vamostaxi.site/fleet`. Morning + Night single-selects on the vehicle overlay. No `chauffeurIds` multi. |
| `/fleet/chauffeurs` | Chauffeurs list | Add a chauffeur overlay. Row click → desk, not the Add dialog. |
| `/fleet/chauffeurs/{id}` | Chauffeur desk | Full working page: photo, profile, shift, leave, live trips, past bookings. **No** Vehicles/Chauffeurs Tags. **Button** All chauffeurs. |
| Duplicate email | `Dialog` on the Add overlay | Not a route. |
| Save chauffeur / Save shift / Save leave | `Dialog` / overlay on the desk or list | Not routes. |
| Non-staff | Existing ops gate | Do not invent chrome. |

**Not screens:** driver app, Staff tab, a second dashboard, `/roster` as chauffeur shifts (`GET /api/staff/roster` is staff users).

Row add on the list is an overlay. Desk is a **page**. Booking row is a link to `/bookings/{ref}`.

---

## Layout

### Breakpoints

| Name | Width | Shape |
|------|-------|-------|
| Phone | max-width 767px | Same controls. Desk sections stack. Tables swipe (`data-scroll-native`). 44px icon-only. |
| Tablet | 768–999px | Desk sections stack. Tables keep columns; wrapper swipes if needed. |
| Desktop | min-width 1000px | List: KPI row + `OpsTable`. Desk: two columns — photo/profile/shift/leave \| live + past. |

Title: one line, `white-space: nowrap`. Nothing may scroll sideways at 390 px. German strings grow ~30 %. Logical properties only. Check 1440 / 1024 / 768 / 390 px and Arabic before calling the page done.

Every scroller (table wrapper, overlay body) sets `data-scroll-native` (and `data-lenis-prevent` where the panel owns scroll). Never a second Lenis. Never `scroll-behavior: smooth`.

### Desktop (min-width 1000px) — list

1. **OpsSidebar** + main surface.
2. **Header:** Display title Vehicles or Chauffeurs. Inline-end: Vehicles / Chauffeurs `Tag`s (active = accent).
3. **KPI cards** then **OpsTable**. Add control is the list primary (accent).

### Desktop — chauffeur desk (D-15…D-18)

One chauffeur dossier. Not a second fleet list.

1. **Header (one row):** `Button` size-sm **All chauffeurs** (not accent, not a muted Label link) → `/fleet/chauffeurs`. Display name. Duty `Badge` (success / neutral / outline — not accent). **Edit chauffeur** (outline) opens the details overlay. **No** Vehicles / Chauffeurs `Tag`s. **No** Keep editing on this header.
2. **Column stack (16px / 24px gaps):** Photo + Profile card → Shift card (ticks + Start + End + **Save shift**) → Leave card (ranges + **Add leave**) → Live trips → Past bookings. Each booking row is a link: ref · route · when.
3. Desktop ≥1000px may put Live + Past in a second column **after** profile/shift/leave. Phone/tablet: single column, photo above profile.

### Tablet / phone

Same sections, single column, 16px gap. Header actions wrap under the title with 8px gap. Photo above profile. Booking rows stack (ref, then route, then when).

### Shift card

Weekday ticks (seven). One **Start** time and one **End** time. **Save shift**. No per-day times. No Morning/Night windows on the person.

### Leave card

List of ranges `From → Until`. **Add leave** opens overlay (**Save leave**). Trash on a row confirms then removes. Empty = copy table, not an error.

### Vehicle overlay

Replace `chauffeurIds` multi-select with two fields: **Morning** and **Night** (single-select chauffeur). Helper from copy table. Occupied seat / both taken: overlay stays open, `--vt-danger` exact refuse, next step is pick the other seat or Keep editing.

---

## Visual hierarchy

**Focal point (list):** **Add a chauffeur** / **Add a vehicle** (accent fill).

**Secondary focal:** active Vehicles / Chauffeurs `Tag`.

**Focal point (desk):** chauffeur name (Display) + duty badge.

**Order the eye follows (desk):** Button All chauffeurs → name + duty → photo/profile → shift → leave → live trips → past bookings.

Do not compete with Add using accent on overlay saves or Keep editing.

Icon-only actions have a visible text label **or** `aria-label` from the copy table. Trash is never unlabeled.

---

## States

| State | What the dispatcher sees |
|-------|--------------------------|
| List empty chauffeurs | Heading + body from copy table. Add a chauffeur available. Not an error. |
| List empty vehicles | Heading + body from copy table. Add a vehicle available. |
| Desk loading | Existing skeleton. No sample `VT-` rows. |
| Desk missing chauffeur | Treat as gone — back to list. Existing “That chauffeur is gone.” |
| No email | Profile banner: Cannot assign until an email is saved. Still can Save chauffeur / Save shift / Save leave. |
| No vehicle / no seats | Profile shows No chauffeur / No vehicle. Cannot assign a transfer (existing rule). |
| On shift | Badge success. KPI count includes this chauffeur. |
| Off duty | Badge neutral. Clock outside window or no window / no days. |
| On leave | Badge outline. A leave range contains Zurich today. Overrides the clock. |
| No shift saved | Off duty (unless leave). Shift card empty days + empty times is valid. |
| Overnight window | End before start. Helper copy. Duty wraps midnight. |
| Live empty | Heading + body from copy table. Not “No data found”. |
| Past empty | Heading + body from copy table. |
| Duplicate email | Dialog. Open existing chauffeur or Keep editing. Confirm does not insert. |
| Double Add | One row. No dialog. |
| Seat refuse | Overlay stays open. Exact reason. Keep editing. |
| Leave save blocked | Overlay stays open. Missing dates or until before from. Copy table. |
| Save failed | `--vt-danger` + Save failed. Try again. Overlay stays. |
| Delete chauffeur | Dialog. Confirm deletes. Dismiss Keep editing. |
| Delete leave | Dialog. Copy table. |
| Overlay / Dialog | Focus trap. `data-lenis-prevent`. Dismiss **Keep editing**. |
| Photo missing | Empty photo control. Choose photo. Not an error. No invented image. |

---

## Interaction

### List Add (D-04, D-05)

- **Add a chauffeur** opens overlay. Overlay open pins one UUID. Fast double-click **Save chauffeur** → one row, no extra dialog.
- If email matches another chauffeur: Dialog **This email is already on file**. **Open existing chauffeur** → `/fleet/chauffeurs/{id}`. **Keep editing** stays on the form. Confirm never inserts.
- Phone and licence required (existing). Email may be empty on Add; assign still blocked until email.

### Row click (D-01)

- Chauffeur row → `/fleet/chauffeurs/{id}` (already `href` on the name). Do not open the Add/Edit overlay as the desk.
- **Edit chauffeur** on the desk (or pencil on list if kept) opens the details overlay — photo, name, phone, email, licence, languages, Morning/Night vehicle seat. **Save chauffeur**. No status `<select>`.

### Duty clock (D-09…D-12)

- Dispatcher ticks days and sets one start/end. **Save shift**.
- Duty badge is computed in Zurich. No manual On shift / Off duty.
- Leave range containing today → On leave until it ends. Multiple ranges stay on the list.

### Vehicle seats (D-07, D-08)

- Vehicle overlay: Morning + Night only. Pairing still owned from the chauffeur side (saving a seat writes that chauffeur’s vehicle).
- Third / double morning / double night: exact refuse copy. Overlay stays open.

### Bookings (D-02)

- Live = assigned and not finished. Past = assigned and finished (cancelled / completed / refunded / no-show). Click → `/bookings/{ref}`. Real empty copy. No sample refs.

### Photo (D-03)

- Existing upload / replace / remove. R2 key. Never `data:`.

### Shared chrome

- Fleet header Tags switch `/fleet` ↔ `/fleet/chauffeurs` via `history.pushState` (existing) **only on list screens**. When `isDetail`, omit those Tags (D-15). No `vt-ops-hash-switch`.
- Desk Back is `Button` **All chauffeurs** → `/fleet/chauffeurs` (D-16). Not `history.back`. Not `/api/staff/chauffeurs`.
- Dual DC: edit `app/ops/` then sync. Agent does not `supabase db push`.

---

## Must-nots

- Do not invent a second dashboard or a new route prefix. Keep `/fleet/chauffeurs/{id}`.
- Do not render Vehicles / Chauffeurs `Tag`s on `/fleet/chauffeurs/{id}` (D-15).
- Do not leave `saveShift` / `saveLeave` as empty functions (D-17).
- Do not treat `GET /api/staff/chauffeurs` as a document. That is JSON, not the Fleet page.
- Do not leave live `dc-import` on `OpsFleetBoard` if the file we edit is `OpsFleet.dc.html`.
- Do not keep unlimited `chauffeurIds` multi-select.
- Do not keep a status `<select>` as the way to flip On shift / Off duty / On leave.
- Do not put Morning/Night windows on the chauffeur (seats are on the vehicle).
- Do not give different hours per weekday.
- Do not ship leave without dates.
- Do not show sample `VT-` rows on empty live or past.
- Do not use `GET /api/staff/roster` for chauffeur shifts.
- Do not build a driver app, auto-dispatch, or Staff tab.
- Do not use glow, `--vt-shadow-accent`, or tinted yellow.
- Do not use `Alert tone="accent"`, `Badge tone="warning"`, or `ListRow` yellow-50 icon tiles.
- Do not use shadcn / `components.json`. Tool: none.
- Do not use SiteHeader on ops. Do not add a webfont.
- Do not bind `vamostaxi.eu`. No live Stripe keys. No `sk_live_`. Agent does not `db push`. Never invent CHF, legal copy, or photographs.
- Icons: Lucide via `Icon` only.
- Copy: never Submit, OK, Click Here, Cancel, or bare Save. Never “No data found” / “Something went wrong”.
- Overlay dismiss is Keep editing. Persist verbs are Save chauffeur / Save shift / Save leave.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | — | not applicable — Tool: none; no shadcn; no third-party registry |

Do not add shadcn. Do not initialize `components.json`. Do not vendor blocks from any registry.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-18. **Amendment 2026-09-18 owner UAT:** D-15…D-18 (no list Tags on desk, Button back, persist shift/leave). Checker dimensions unchanged — still Tool: none, four type sizes, reserved accent, copy table verbs.
**reviewed_at:** 2026-09-18
