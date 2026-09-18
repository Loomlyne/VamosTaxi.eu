# Phase 17: Ops chauffeur desk - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** fleet/chauffeur kernel + dual-DC ops + assign
**Analogs found:** exact for CRUD/photo/assign; none for duty clock / seats / leave ranges (new)

Canonical: `17-CONTEXT.md` D-01…D-14. RESEARCH T-17-01 (OpsFleet vs OpsFleetBoard) is binding.

## Binding caveats (do not reopen)

- CONTEXT D-01…D-14 wins. No driver app. No auto-dispatch. No Staff tab. No `.eu`. No `sk_live_`. Agent does not `supabase db push`.
- DC ops is the product. Analog is `app/ops/OpsFleet.dc.html` + `OpsTable.dc.html`. **No React `/ops` analog.** Dual-DC: edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`.
- Live `ops.dc.html` currently `dc-import name="OpsFleetBoard"` → sibling fetch `OpsFleetBoard.dc.html`. Source file is `OpsFleet.dc.html`. **CHANGE the import** (or promote Board into `app/ops`). Do not analog the stale public Board as the place to edit.
- Dual-mount staff APIs: locale route is the implementation; `app/api/staff/*` re-exports.
- `asStaff` on `HYPERDRIVE_NOCACHE`. Never log chauffeur PII.
- Photo analog: existing chauffeur R2 prefix. Do not invent photographs.
- Assign analog: `assign.ts` + `ops_assign_leg`. Keep overlap. Do not auto-dispatch.
- `GET /api/staff/roster` is **staff users**. Do not analog as chauffeur shifts.
- Zurich clock analog: `licenceState` in `chauffeurs-model.ts`. Overnight wrap analog: `pricing/predicates.ts` (do not import pricing into ops if that pulls fare code — copy the wrap boolean).
- Worker name `vamos`. Never restore onto `yaumjzvylngfjhtuffqs`.

### Dead (do not analog as product behavior)

| Dead pattern | Where it lives today | Why dead |
|--------------|----------------------|----------|
| Manual `status` `<select>` | `OpsFleet.dc.html` `cStatusOptions` / chauffeurFields | D-10 |
| Unlimited `chauffeurIds` multi-select | vehicleFields `editor:'select', multi:true` | D-07 |
| Client-supplied `status` on POST/PATCH | `parseChauffeurBody` / `assertChauffeurInput` | D-10 |
| `OpsFleetBoard.dc.html` only in public | `apps/web/public/app/ops/` | T-17-01 — stale live sibling |
| Staff roster as shift roster | `api/staff/roster` | Different product |
| Sample empty `VT-` rows | must not add | D-02 |

### KEEP as analogs

dual-DC sync · `asStaff` nocache · `withStaff` chauffeur routes · `insertChauffeur` client UUID already parsed · `assertChauffeurInput` name/phone/licence · photo upload · `CSTATUS` labels · `licenceState` Zurich civil · OpsTable nested overlay · path `/fleet/chauffeurs/{id}` · assign overlap RPC · OpsDash `status === 'shift'` **after** kernel writes derived status.

---

## File Classification

| New/Modified File | Role | Closest Analog | Match Quality |
|-------------------|------|----------------|---------------|
| `apps/web/lib/ops/chauffeurs-duty.test.ts` | test | `chauffeurs.test.ts` `licenceState` | role-match |
| `apps/web/lib/ops/chauffeurs-model.ts` | utility | **this file** `licenceState` | exact — add `dutyStatus` |
| `apps/web/lib/ops/vehicle-seats.ts` | utility | `assertChauffeurInput` | role-match — new |
| `apps/web/lib/ops/vehicle-seats.test.ts` | test | `chauffeurs.test.ts` | role-match |
| `apps/web/lib/ops/ops-chauffeur-desk.test.ts` | test | `ops-pricing-tabs.test.ts` `readFileSync` | role-match |
| `apps/web/lib/ops/chauffeurs.ts` | service | **this file** | exact — load shift/leave/seats; recompute status |
| `apps/web/lib/ops/chauffeurs-write.ts` | service | **this file** | exact — ON CONFLICT id; no client status |
| `apps/web/lib/ops/fleet-http.ts` | transform | **this file** `chauffeurErrorCopy` | exact — duplicate-email + seat copy |
| `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts` | route | **this file** | exact — 409 existingId |
| `apps/web/app/api/staff/chauffeurs/route.ts` | route | re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts` | route | **this file** | exact — PATCH shift/leave |
| `packages/db/supabase/migrations/20260918*_ops_chauffeur_desk.sql` | migration | `20260823000005_fleet.sql` | role-match — git only |
| `app/ops/OpsFleet.dc.html` | component | **this file** | exact — grow desk; kill status select + chauffeurIds multi |
| `app/ops/ops.dc.html` | component | **this file** | exact — CHANGE import to `OpsFleet` |
| `app/ops/OpsTable.dc.html` | component | overlay save label | FLAG — persist verbs per overlay, never bare Save |
| `app/ops/OpsDash.dc.html` | component | `status === 'shift'` | exact — KEEP if kernel derives status |
| `app/vamos-i18n-dict.js` | store | en/de/fr/ar | exact |
| `apps/web/public/app/ops/*` | file-I/O | dual-DC copy | exact after sync |

---

## Implementation notes

- New leave/seats writers may live in `chauffeurs-write.ts` or `vehicle-seats.ts` — keep SQL in write modules, never in the route.
- Dual-mount: change locale route; re-export file stays `export { GET, POST } from "…"`.
- `OpsTable` nested save label already uses `Add a chauffeur`. Main persist must become `Save chauffeur` / `Save shift` / `Save leave` via existing `nestedSaveLabel` / add a `saveLabel` prop if missing — do not restyle the table.
