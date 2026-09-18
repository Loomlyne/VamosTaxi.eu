# Phase 17: Ops chauffeur profile, shift roster, two-driver vehicles — Research

**Researched:** 2026-09-18
**Domain:** Ops fleet chauffeur desk (DC + staff APIs + Hyperdrive Postgres)
**Confidence:** HIGH on in-repo identifiers; HIGH on live `dc-import` name vs source file; MEDIUM on hosted chauffeur row counts (not SELECTed this sitting)

Canonical: `.planning/phases/17-ops-chauffeur-profile-shift-roster-two-driver-vehicles/17-CONTEXT.md` D-01…D-14. `17-NOTES.md` (2026-09-11) is superseded where CONTEXT is more specific.

## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked. Planner and executor honour these.

### Locked Decisions

- **D-01:** Fleet → Chauffeurs → row click opens a **dedicated full page**. Not the Add/Edit dialog. Not a read-only stub. Path `https://dashboard.vamostaxi.site/fleet/chauffeurs` then `/fleet/chauffeurs/{id}` (already routed). Grow the existing fleet DC — no second dashboard. UI-SPEC + DC first, then port. en/de/fr/ar same sitting.
- **D-02:** Page shows details (name, phone, email, licence, languages, vehicle seats), photo, shift days + times, leave ranges, live trips, **and** past assigned bookings. Booking row → `/bookings/{ref}`. Empty live / empty history is real empty, not sample `VT-` rows.
- **D-03:** Photo = existing chauffeur photo (`/api/photos/upload`, R2 key, never data-URI). No invented photographs.
- **D-04:** One Add, including fast double-click on the same new form, creates **one** row. No extra dialog. Idempotent create.
- **D-05:** Duplicate email: inform, Confirm does **not** insert — it **opens the existing chauffeur page**. Two chauffeurs must not share an email.
- **D-06:** Phone and licence required on Add (`assertChauffeurInput`). Email required before assign (“Cannot assign until an email is saved”). Duplicate check on normalised email when present.
- **D-07:** A plate accepts **at most two** chauffeurs. Seats **Morning** and **Night**. Not both morning. Not both night. Third assign / occupied seat refused with the **exact reason**.
- **D-08:** Morning/Night is a **vehicle seat**, independent of the chauffeur clock. Pairing owned from the chauffeur side. Do not keep unlimited `chauffeurIds` multi-select.
- **D-09:** Tick weekdays + **one** start and **one** end for every selected day. Europe/Zurich. Not per-weekday hours. Not two named windows on the person.
- **D-10:** In window on a selected day → **On shift**. Else **Off duty**. No manual On shift / Off duty toggle. Remove status `<select>` as the duty switch. Stored `chauffeurs.status` is derived.
- **D-11:** End before start wraps midnight (night seat). Overnight duty allowed.
- **D-12:** Leave is a **list of ranges** (from → until, inclusive, Zurich civil dates). Range containing today overrides the clock → **On leave**. Multiple future/past ranges stay. Add/remove on the profile. No leave without dates.
- **D-13:** Board On shift count and assign lists follow computed duty. Chauffeur with no vehicle still cannot take a transfer. Assignment overlap (OPS-03) stays.
- **D-14:** Copy: On shift / Off duty / On leave (`CSTATUS`). Exact refuse strings for D-07 in en/de/fr/ar same sitting.

### Claude's Discretion

- SQL shape (junction vs columns)
- Idempotency key for D-04
- Overnight wrap comparison
- Leave storage
- Cron vs request-time recompute of status
- Overlay verbs `Save chauffeur` / `Save leave` / `Save shift`; dismiss `Keep editing`

### Deferred Ideas (OUT OF SCOPE)

- Phase 16 Staging MX + Reply-in-Gmail
- Driver app / chauffeur login (`chauffeurs.user_id`)
- Auto-dispatch / nearest driver
- Staff tab
- Live `vamostaxi.eu`, `sk_live_`, owner Publish of public CHF
- Different hours per weekday (rejected)

### Must-not (every wave)

- No driver app, no auto-dispatch, no Staff tab
- No `vamostaxi.eu`, no `env.production`, no `sk_live_`
- No `supabase db push` (agent). New SQL = numbered owner-apply gate
- Never restore onto `yaumjzvylngfjhtuffqs`
- No invented CHF, legal copy, or photographs
- No push `main`; Worker `vamos` until owner says
- Funnel Phases 7–11 frozen (no `POST /api/quote` from this phase)

### Project Constraints (from CLAUDE.md)

- `--vt-*` only. Lucide via `Icon`. `--vt-shadow-accent:none`. No glow. No tinted yellow.
- Four languages same pass. Logical CSS. Arabic `dir="rtl"`.
- Dual DC: edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`. Do not strip injected `<base href="/app/ops/">`.
- Ops shell: `OpsSidebar`. Amounts `CHF 000` (fleet has no plate price).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dedicated chauffeur page | Browser/Client (DC) | API/Backend | Ops is DC, not React. Path already in `ops.dc.html`. |
| Duty clock (On shift / Off duty / On leave) | API/Backend (pure fn + present) | Database/Storage | Europe/Zurich must not depend on the browser TZ. Persist derived `status` so board KPI stays `status === 'shift'`. |
| Leave ranges | Database/Storage | API/Backend | List of civil-date ranges; today-in-range wins. |
| Morning/Night seats | Database/Storage | API/Backend | Unique per (vehicle, seat). Worker returns exact refuse copy. |
| Idempotent Add + duplicate email | API/Backend | Browser/Client | Server must refuse a second row even if the client double-fires. UI opens existing on 409. |
| Photo | CDN/Static (R2) | API/Backend | Existing `/api/photos/upload`. |
| Assign overlap | Database/Storage (existing RPC) | API/Backend | OPS-03 stays. Filter picker by computed duty + vehicle rule. |

## Summary

Phase 17 is not a library choice. Fleet CRUD already ships: `public.chauffeurs` / `public.vehicles`, `POST/PATCH /api/staff/chauffeurs`, DC list + a **thin** `/fleet/chauffeurs/{id}` (profile rows + live trips). What is missing is the **desk**: shift days/times, leave ranges, computed duty, Morning/Night seats, one-row Add, duplicate-email open-existing, past bookings.

Today three layers **fork the product from D-01…D-14**:

1. **SQL** — `chauffeurs.status` is a **manual** enum (`shift` \| `off` \| `leave`). No shift window, no leave ranges, no unique email, no vehicle seats. Pairing is `chauffeurs.default_vehicle_id` only (unlimited chauffeurs per plate).
2. **Staff write path** — `insertChauffeur` always INSERTs. `POST` accepts a client UUID (`parsed.id`) but there is no `ON CONFLICT`. Double-click = two rows. Email is nullable with no unique index. `parseChauffeurBody` still accepts `status` from the client.
3. **DC** — Vehicles tab uses unlimited `chauffeurIds` multi-select. Chauffeur form still has a status `<select>`. Detail page is read-only profile + live trips (no photo editor on the page, no shift, no leave, no history). **Live `ops.dc.html` imports `OpsFleetBoard`**, which sibling-fetches `OpsFleetBoard.dc.html`. Source of truth in git is `app/ops/OpsFleet.dc.html`. Public still has a stale `OpsFleetBoard.dc.html` that sync does not overwrite. Editing `OpsFleet.dc.html` alone does **not** change what dashboard loads.

`GET /api/staff/roster` is the **staff-users** roster (admin/dispatcher), not chauffeur shifts. Do not extend it for D-09.

**Primary recommendation:** Pure `dutyStatus` in `chauffeurs-model.ts` (Zurich, weekdays, one window, leave wins, overnight wrap). Git SQL: leave table + unique email + `vehicle_seats` + shift columns; owner apply once. Idempotent `INSERT … ON CONFLICT (id) DO NOTHING`. Duplicate email 409 `{ existingId }`. Point `ops.dc.html` at `OpsFleet` (or promote Board into `app/ops`). Grow that page per UI-SPEC. Recompute `status` on every staff read/write — no cron.

## Standard Stack

Do **not** add a library.

### Core (already in repo)

| Piece | Where | Purpose |
|-------|-------|---------|
| DC ops | `app/ops/OpsFleet.dc.html`, `OpsTable.dc.html`, `ops.dc.html` | Product UI |
| Staff JSON | `withStaff` + `asStaff` on `HYPERDRIVE_NOCACHE` | Reads/writes |
| Dual-mount | `app/[locale]/(ops)/api/staff/*` impl, `app/api/staff/*` re-export | Dashboard origin has no locale prefix |
| Photo | `apps/web/lib/ops/photos.ts` prefix `chauffeurs/` | R2 key, never data-URI |
| Assign | `apps/web/lib/ops/assign.ts` + `ops_assign_leg` RPC | Overlap stays |
| Zurich civil date | `licenceState` / `toCivilDate` in `chauffeurs-model.ts` | Copy this clock, do not invent a second TZ helper |
| Overnight window | `apps/web/lib/pricing/predicates.ts` wrap `(t >= from \|\| t < to)` | Copy for shift end < start |

### Supporting

| Piece | When to use |
|-------|-------------|
| Vitest `lib/**/*.test.ts` | All automated verify. Never `tests/integration/*.spec.ts` (`passWithNoTests: true` hole) |
| `readFileSync` source-read | DC copy, overlay verbs, no status select, Morning/Night fields |
| Owner-apply SQL | New migration in git; agent does not `db push` |

## Current kernel (do not reinvent)

| File | Role today | Change this phase |
|------|------------|-------------------|
| `packages/db/supabase/migrations/20260823000005_fleet.sql` | `chauffeurs` + `vehicles`; `default_vehicle_id`; `status` enum | New migration; do not edit this file |
| `packages/db/supabase/migrations/20260823000003_types.sql` | `chauffeur_status = shift\|off\|leave` | Keep enum; values become derived |
| `apps/web/lib/ops/chauffeurs-model.ts` | Types, `licenceState` Zurich | Add `dutyStatus`, shift/leave types |
| `apps/web/lib/ops/chauffeurs.ts` | `assertChauffeurInput`, list/detail SQL | Stop accepting client `status` as duty; load seats/leave/shift |
| `apps/web/lib/ops/chauffeurs-write.ts` | INSERT/UPDATE/DELETE | Idempotent insert; do not write client status; seats + leave writers |
| `apps/web/lib/ops/fleet-http.ts` | parse/present + `chauffeurErrorCopy` | Duplicate-email 409; seat refuse copy; present seats |
| `…/api/staff/chauffeurs/route.ts` | GET list, POST create | ON CONFLICT id; email lookup |
| `…/api/staff/chauffeurs/[id]/route.ts` | PATCH/DELETE | PATCH shift/leave via same or nested routes |
| `app/ops/OpsFleet.dc.html` | List + thin detail | Full desk (D-01…D-02) |
| `app/ops/ops.dc.html` | `dc-import name="OpsFleetBoard"` | Must load the file we edit |
| `apps/web/public/app/ops/OpsFleetBoard.dc.html` | Stale live sibling (~36020 B) | Delete after import points at `OpsFleet`, or replace from source |
| `app/ops/OpsDash.dc.html` | `c.status === 'shift'` KPI | Follows derived status if kernel writes it |
| `GET /api/staff/roster` | Staff users | **Do not use** for chauffeur shifts |

Vehicle pairing today (DC): on vehicle save, `chauffeurIds` CSV → upsert each chauffeur’s `defaultVehicleId`. Unlimited. D-07 replaces this with two named seats.

## Recommended SQL (discretion, one git migration)

Filename pattern: `packages/db/supabase/migrations/20260918XXXXXX_ops_chauffeur_desk.sql` (timestamp at execute). Git only until last-plan owner apply.

1. **`public.chauffeurs`**
   - `shift_weekdays smallint[] not null default '{}'` — ISO 1=Mon … 7=Sun (or 0=Sun; lock in PLAN and tests)
   - `shift_start time`, `shift_end time` — null = no window → Off duty (unless leave)
   - `shift_tz text not null default 'Europe/Zurich'`
   - Unique index `chauffeurs_email_lower_uidx` on `lower(email)` WHERE email is not null and `length(trim(email)) > 0`
2. **`public.chauffeur_leave_ranges`**
   - `id uuid pk`, `chauffeur_id` FK cascade, `from_date date not null`, `until_date date not null`, check `until_date >= from_date`
3. **`public.vehicle_seats`**
   - `vehicle_id` FK, `seat text check in ('morning','night')`, `chauffeur_id` FK
   - PK `(vehicle_id, seat)`
   - UNIQUE `chauffeur_id` (one plate per chauffeur, matches “pairing owned from chauffeur side”)
4. **Backfill (in SQL, documented for owner apply):** existing `default_vehicle_id` groups ordered by `created_at`: 1st → morning, 2nd → night, 3rd+ → `default_vehicle_id = null` (unpaired). Do not invent a third seat.
5. **Keep** `chauffeurs.default_vehicle_id` as denormalised pointer equal to the seat’s vehicle (writers keep them aligned) so assign-without-vehicle and existing joins stay.

Worker still enforces D-07 copy even before SQL apply (same pattern as Phase 18 `quote_rate_book` filter). After apply, unique constraints are the backstop.

## Duty function (discretion)

```
dutyStatus({ now, weekdays, start, end, tz: 'Europe/Zurich', leaveRanges }) → 'leave' | 'shift' | 'off'
```

1. Zurich civil `today`. If any leave range has `from <= today <= until` → `leave`.
2. Else if `today` weekday not in `weekdays` → `off`.
3. Else if `start`/`end` missing → `off`.
4. Else Zurich clock time in window: if `end > start` then `start <= t < end`; if `end < start` wrap (`t >= start || t < end`); if `end === start` treat as 24h on selected days (lock in tests).
5. Recompute on list/detail/board GET and after PATCH. Write `chauffeurs.status` so `OpsDash` / fleet KPI `status === 'shift'` keep working without DC math.

Do **not** send duty from the browser. Ignore client `status` on POST/PATCH.

## Idempotent Add + duplicate email

- Overlay open generates one UUID; both clicks POST the same `id`. `insertChauffeur`: `ON CONFLICT (id) DO NOTHING RETURNING id`; if no row, `loadChauffeur(id)` and 200/201 the existing.
- Before insert, if email present: `lower(trim(email))` match → **409** `chauffeurs-duplicate-email` with `existingId` + `fullName`. DC Dialog: inform, Confirm navigates to `/fleet/chauffeurs/{existingId}`, Keep editing stays. Confirm never INSERTs.
- Empty email: no duplicate-email path (D-06). Double-click still one row via id conflict.

## Assign / board

- Keep `ops_assign_leg` overlap.
- Picker: still refuse no-email, no-vehicle.
- Prefer listing On shift first; Off duty / On leave remain visible but labelled (do not hide — dispatcher may still need them; CONTEXT says lists **follow** computed duty for the On shift count; do not auto-block assign of Off duty unless existing assign already does). Exact: D-13 “assign lists follow computed duty” = the On shift set used for “available to assign” is computed, not the old manual select. Overlap RPC unchanged.
- Seat mismatch is **not** a trip-time matcher. Morning/Night does not auto-pick a chauffeur for a morning pickup.

## Validation Architecture

| Layer | What | Command |
|-------|------|---------|
| Wave 0 source-read | DC: no status select as duty; Morning/Night not `chauffeurIds` multi; overlay verbs; `ops.dc.html` imports the file we edit; no sample `VT-` on empty | `vitest run lib/ops/ops-chauffeur-desk.test.ts` (readFileSync) |
| Unit | `dutyStatus` Zurich DST, overnight wrap, leave wins, empty weekdays | `vitest run lib/ops/chauffeurs-duty.test.ts` |
| Unit | `assertVehicleSeats` third / double-morning / double-night exact keys | `vitest run lib/ops/vehicle-seats.test.ts` |
| Unit | duplicate email 409 + idempotent insert id | `vitest run lib/ops/chauffeurs.test.ts` (extend) |
| Source-read | `insertChauffeur` ON CONFLICT; client status ignored | same |
| Typecheck | After each wave | `pnpm run typecheck` |
| Owner | SQL apply | numbered gate, `autonomous: false` |
| UAT | Live dashboard.vamostaxi.site | 17-UAT.md after execute |

Do **not** `vitest run tests/integration/*.spec.ts`.

Nyquist: no three consecutive tasks without automated verify. Owner SQL apply is the only blocking manual task.

## Risks

| ID | Risk | Mitigation |
|----|------|------------|
| T-17-01 | Edit `OpsFleet.dc.html` but live loads `OpsFleetBoard.dc.html` | Plan 1 source-read asserts `ops.dc.html` import name matches the file we ship; delete or overwrite public Board |
| T-17-02 | Client `status` still writable → dispatcher toggles duty | Ignore body.status; tests |
| T-17-03 | Double POST without client UUID → two rows | Server email unique + require/generate id; DC pins id on overlay open |
| T-17-04 | Existing 3+ chauffeurs on one plate | Backfill 1 morning, 2 night, rest unpaired; document on owner apply |
| T-17-05 | Browser TZ vs Zurich | All duty in Worker using `Europe/Zurich` |
| T-17-06 | `GET /api/staff/roster` mistaken for shifts | Do not touch staff roster |
| T-17-07 | Sample bookings on empty desk | Tests forbid `VT-` placeholders in detail empty states |

## RESEARCH COMPLETE

Planner: CONTEXT D-01…D-14 wins over ROADMAP wording. UI-SPEC before DC tasks. SQL owner-apply last. Point verify at `lib/**/*.test.ts`.
