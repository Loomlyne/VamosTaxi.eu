# Phase 17: Ops chauffeur profile, shift roster, two-driver vehicles - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Ops fleet becomes a real chauffeur desk. Dispatcher adds chauffeurs from Fleet → Chauffeurs. A row opens a **dedicated full page** (not the Add dialog): details, photo, shift days/times, leave ranges, live trips, past assigned bookings. Saved shift days + one start/end in Europe/Zurich drive On shift vs Off duty. Dispatcher leave ranges override the clock. Each vehicle plate has at most two chauffeurs — named Morning and Night — never two mornings, never two nights. Double Add is one row. Duplicate email warns and Confirm opens the existing chauffeur.

This phase does not ship a driver app, auto-dispatch, Staff tab, live `vamostaxi.eu` DNS, `env.production`, or live Stripe keys. Phase 16 MX stays parked this sitting. Funnel Phases 7–11 are not this work.

</domain>

<decisions>
## Implementation Decisions

### Dedicated chauffeur page
- **D-01:** Fleet → Chauffeurs → click a row opens a **dedicated full page**. Not the Add/Edit dialog. Not a read-only stub. Navigation: `https://dashboard.vamostaxi.site/fleet/chauffeurs` then `/fleet/chauffeurs/{id}`. Keep that path (already routed in `app/ops/ops.dc.html`). Grow `OpsFleetBoard.dc.html` / `OpsFleet.dc.html` into that full page — do not invent a second dashboard. UI-SPEC + DC mock first, then port. Four languages same sitting.
- **D-02:** The page shows: details (name, phone, email, licence, languages, vehicle seats), photo, shift days + times, leave ranges, live trips, **and** past assigned bookings. A booking row click opens `/bookings/{ref}`. Empty live / empty history copy is real empty, not sample `VT-` rows.
- **D-03:** Photo uses the existing chauffeur photo control (`/api/photos/upload`, R2 key, never a data-URI). No invented photographs.

### Add chauffeur
- **D-04:** Dispatcher adds chauffeurs in Ops. One Add click, including a fast double click on the same new form, creates **one** row. No extra dialog for the double-click. Idempotent create.
- **D-05:** If the email is already on another chauffeur: inform, then Confirm does **not** create a second row — it **opens the existing chauffeur page**. Two chauffeurs must not share an email.
- **D-06:** Phone and licence are required on Add (existing `assertChauffeurInput`). Email is required before the chauffeur can be assigned (existing “Cannot assign until an email is saved”). Duplicate check is on normalised email when present.

### Vehicle seats (Morning / Night)
- **D-07:** A plate accepts **at most two** chauffeurs. Seats are named **Morning** and **Night**. One morning and one night. Not both morning. Not both night. A third assign, or a second chauffeur on an occupied seat, is refused with the **exact reason** (which seat is taken / vehicle already has morning and night).
- **D-08:** Morning/Night is a **vehicle seat**, independent of the chauffeur’s clock. Pairing is owned from the chauffeur side (existing fleet rule) and shown on the vehicle. Planner may add a junction / seat columns; do not keep unlimited `chauffeurIds` multi-select.

### Shift clock
- **D-09:** On the chauffeur page the dispatcher ticks weekdays and sets **one start time and one end time** that apply to every selected day. Europe/Zurich. Not different hours per weekday. Not two named time windows on the person.
- **D-10:** During that window on a selected day → **On shift**. Outside it → **Off duty**. No manual On shift / Off duty toggle. Remove the status `<select>` as the way to flip duty. Stored `chauffeurs.status` is derived (or equivalent computed field the board already reads).
- **D-11:** If end is before start, the window wraps midnight (night seat). Planner owns the exact comparison; product is overnight duty is allowed.

### Leave
- **D-12:** Leave is a **list of ranges** (from date → until date, inclusive, Zurich civil dates). The range that contains today overrides the clock → **On leave** until it ends. Multiple future/past ranges stay on the list. Dispatcher adds/removes ranges on the profile. No “leave with no dates”.

### Board / assign
- **D-13:** Board On shift count and assign lists follow the computed duty (D-10/D-12), not a leftover manual status. A chauffeur with no vehicle still cannot take a transfer (existing fleet rule). Assignment overlap (OPS-03) stays.
- **D-14:** Copy: On shift / Off duty / On leave (existing `CSTATUS` labels). Exact refuse strings for D-07 in en/de/fr/ar same sitting.

### Dedicated page — owner UAT 2026-09-18 (D-15…D-18)
- **D-15:** On `/fleet/chauffeurs/{id}` do **not** show the Vehicles / Chauffeurs header Tags. Those Tags stay on `/fleet` and `/fleet/chauffeurs` only. Sidebar still lists both. The desk is one chauffeur, not a second fleet switcher.
- **D-16:** Desk header has a real **Button** **All chauffeurs** that goes to `/fleet/chauffeurs`. Not a muted text link. Not `history.back`. Not `/api/staff/chauffeurs`.
- **D-17:** The desk **is** the working page. Weekday ticks, one Start, one End, **Save shift** persist. Leave list, **Add leave** / **Save leave** persist. Empty `saveShift` / `saveLeave` lambdas are a bug. Profile identity stays **Edit chauffeur** overlay → **Save chauffeur**.
- **D-18:** **Keep editing** only closes Dialogs. Do not put Keep editing on the desk page as a third dummy control.

`/api/staff/chauffeurs` is the Worker JSON. It is not a page. Do not open it in the Browser pane as the chauffeurs screen.

### Claude's Discretion
- SQL shape (junction vs columns), idempotency key for D-04, whether overnight wrap uses `<` on times, how leave ranges are stored, cron vs request-time recompute of status. Must match D-01…D-18.
- Overlay verbs stay `Save chauffeur` / `Save leave` / `Save shift` — never CTA `Save` / `Cancel` / `OK`. Dialog dismiss is `Keep editing`.
- Desk layout may restack (header → profile → shift → leave → trips) as long as tokens, copy table, and D-15…D-18 hold. Do not invent a second dashboard or a new route.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase lock
- `.planning/phases/17-ops-chauffeur-profile-shift-roster-two-driver-vehicles/17-CONTEXT.md` — this file; D-01…D-14 win on conflict
- `.planning/phases/17-ops-chauffeur-profile-shift-roster-two-driver-vehicles/17-NOTES.md` — 2026-09-11 owner lock (superseded where this file is more specific)
- `.planning/ROADMAP.md` — Phase 17 goal, success criteria, UI hint yes
- `.planning/REQUIREMENTS.md` — OPS-11, OPS-12, OPS-13, OPS-14

### Live fleet (do not reinvent)
- `app/ops/OpsFleet.dc.html` — list + thin `/fleet/chauffeurs/{id}` stub (profile + live trips)
- `app/ops/ops.dc.html` — path map `/fleet`, `/fleet/chauffeurs`, `/fleet/chauffeurs/{id}`
- `apps/web/lib/ops/chauffeurs-model.ts` — status enum, licence, languages
- `apps/web/lib/ops/chauffeurs.ts` — `assertChauffeurInput`, readers
- `apps/web/lib/ops/fleet-http.ts` — chauffeur error copy
- `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts` — GET/POST
- `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts` — PATCH/DELETE
- `apps/web/middleware.ts` — `OPS_CONSOLE_EXACT` includes `/fleet/chauffeurs` and `fleet/chauffeurs/{id}`

### Product laws
- `CLAUDE.md` — `--vt-*`, no glow, no tinted yellow, four languages, `CHF 000`
- `design-system/readme.md` — four platform laws
- `.planning/codebase/CONVENTIONS.md` — ops copy, Lucide `Icon`, logical CSS

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OpsFleet.dc.html` / `OpsFleetBoard.dc.html`: Vehicles | Chauffeurs tabs, OpsTable Add, photo editor, nested Add chauffeur/vehicle
- `OpsTable.dc.html`: branded date/time, nested overlay, `Save` must be renamed per overlay verb rule
- Photo: `apps/web/lib/ops/photos.ts` keys `chauffeurs/{id}/…`
- Assign: `POST /api/staff/bookings/:id/assign` with `chauffeurId`
- Path router already treats `detailId` as chauffeur id

### Established Patterns
- Ops is DC, not React. Same document, `history.pushState`, no `vt-ops-hash-switch`
- Staff APIs dual-mounted `app/api/staff/…` and `app/[locale]/(ops)/api/staff/…`
- New SQL is git migration + owner apply. Agent does not `supabase db push`
- `chauffeurs.status` today is a **manual** select (`shift` | `off` | `leave`). This phase makes it computed
- Vehicle ↔ chauffeur today is `default_vehicle_id` plus unlimited `chauffeurIds` multi-select — D-07 replaces that cap

### Integration Points
- List: `/fleet/chauffeurs` stays the table/kanban
- Desk: `/fleet/chauffeurs/{id}` becomes the full page (D-01)
- Board KPI “On shift” must read computed duty
- Assign picker must not offer a chauffeur whose morning/night seat is invalid for that vehicle, and must still refuse overlap

</code_context>

<specifics>
## Specific Ideas

- Owner: “I will add the chauffeurs but if there a duplicate email inform me about that and to confirm the save”
- Confirm on duplicate email = open existing, do not insert (D-05)
- “only the plate can be putted for 2 chauffeurs and one morning and one night not both morning not both nights”
- Dedicated page: “fleet → Chauffeur → Chauffeur full page”

</specifics>

<deferred>
## Deferred Ideas

- Phase 16 Staging MX + Reply-in-Gmail (parked this sitting; owner named 17)
- Driver app / chauffeur login (`chauffeurs.user_id`) — out of V1
- Auto-dispatch / nearest driver
- Staff tab (deleted)
- Live `vamostaxi.eu` DNS, `sk_live_`, owner Publish of public CHF
- Different hours per weekday (rejected; one start/end for selected days)

None — discussion stayed within phase scope except the parked Phase 16 sitting.

</deferred>

---

*Phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles*
*Context gathered: 2026-09-18*
