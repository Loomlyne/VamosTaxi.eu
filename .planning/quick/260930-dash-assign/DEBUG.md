---
status: investigating
trigger: "Dashboard booking detail of a paid booking: Assign, pick a driver, confirm -> generic 'Could not assign VT-...' (assignFailed)."
created: 2026-09-30
updated: 2026-09-30
branch: gsd/26.2-dash-assign (cut from origin/main 316606ee)
---

## Current Focus

hypothesis: CONFIRMED (see Evidence). postgres.js `sql.begin` rethrows a query error the callback caught; assignBooking maps SQL errors inside asSystem, so 'no-vehicle' escapes as a throw -> 500 -> generic toast.
next_action: fix apps/web/lib/ops/assign.ts — run the RPC inside asSystem without try/catch and map the error around asSystem (assign + unassign); rerun both new tests green.

reasoning_checkpoint:
  hypothesis: "The owner saw the generic toast because ops_assign_leg raised P0001 'no-vehicle' (chauffeur default_vehicle_id NULL) and assignBooking's in-transaction catch cannot stop postgres.js begin() from rethrowing it, so the route threw and answered a non-JSON 500."
  confirming_evidence:
    - "psql as vamos_system on the staged live shape: ERROR P0001 no-vehicle (ops_assign_leg line 73)."
    - "Real assignBooking on the same shape through postgres.js rejects with PostgresError: no-vehicle at assign.ts:243 instead of returning {ok:false, code:'no-vehicle'}."
    - "postgres@3.4.9 cf/src/index.js:266-267,293: q.catch records uncaughtError; `if (uncaughtError) throw uncaughtError` after the callback."
  falsification_test: "If mapping the error around asSystem still leaves assignBooking rejecting, or the page still gets a non-listed code, the hypothesis is wrong."
  fix_rationale: "Catching outside asSystem sees both the rethrown query error and a COMMIT-time 23P01, so the named code reaches the route (409 no-vehicle) and the page's existing noVehicle message."
  blind_spots: "Worker logs unavailable, so the owner's exact HTTP answer is inferred, not observed. Lead saw no Postgres ERROR line in 24 h, which a RAISE normally produces; a pre-SQL refusal (csrf 403, not-found) would also give the generic toast. The fix does not make assignment succeed for the owner: the dashboard has had no control to give a chauffeur a vehicle since a1393c93 (owner decision)."

## Symptoms

expected: Assign either succeeds or the dashboard says in plain words what is missing (specific message).
actual: toast "Could not assign VT-..." (assignFailed, app/ops/OpsDetail.dc.html:1374).
errors: none visible; no Postgres ERROR lines in Supabase logs for 24 h; Worker logs unavailable.
reproduction: dashboard.vamostaxi.site -> booking detail (paid) -> Assign -> pick the only chauffeur -> Assign.
started: reported 2026-09-30.
live shape (lead, read-only): one chauffeur (active, status off, default_vehicle_id NULL, vehicle_class_id 34ac8983-..., languages ar/en/fr, user_id null, no shift); one vehicle 87a4578f-... (class 87b8ede8-..., other class), status service, capacity NULL, no chauffeur link.

## Eliminated

## Evidence

- timestamp: 2026-09-30
  checked: packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql (only definition of ops_assign_leg)
  found: line 96-98 raises 'no-vehicle' P0001 when chauffeur.default_vehicle_id is null (after the email check at 92-94). With the live chauffeur this is the first failing check.
  implication: the SQL gives a named code; the generic toast means the code was lost between SQL and page.
- timestamp: 2026-09-30
  checked: app/ops/OpsDetail.dc.html:1352-1375, app/vamos-ops-api.js:16-37
  found: page maps overlap/no-email/no-vehicle/not-paid/frozen/capacity; everything else (incl. 'not-found', 'unknown', 'http' for a non-JSON 500, 'network') -> assignFailed.
  implication: owner got a code outside that list.
- timestamp: 2026-09-30
  checked: apps/web/lib/ops/assign.ts:239-262, packages/db/src/identity.ts withIdentity (sql.begin), postgres@3.4.9 src/index.js:255-292
  found: assignBooking wraps the RPC in try/catch INSIDE asSystem's sql.begin callback. postgres.js registers q.catch(e => uncaughtError = e) on every query in the transaction and after the callback resolves does `if (uncaughtError) throw uncaughtError`.
  implication: the catch is dead; the raw PostgresError escapes assignBooking and the route (no try/catch) -> 500.
- timestamp: 2026-10-01
  checked: isolated stack vamos-taxi-262 (port 62322), live shape staged in a rolled-back tx (scratchpad repro-live-shape.sql), `set local role vamos_system; select * from public.ops_assign_leg(booking, chauffeur, actor)`
  found: |
    current_user = vamos_system
    ERROR:  P0001: no-vehicle
    CONTEXT:  PL/pgSQL function public.ops_assign_leg(uuid,uuid,uuid) line 73 at RAISE
  implication: SQL is correct for this data and names the missing piece; grant is fine (no 42501).
- timestamp: 2026-10-01
  checked: app/ops/OpsFleet.dc.html:398-411 (chauffeur form) and apps/web/lib/ops/chauffeur-desk.ts:192-255 (persistVehicleSeats)
  found: the chauffeur form has no vehicle field (class + languages only). The only dashboard control that sets chauffeurs.default_vehicle_id is the VEHICLE form's Morning / Night chauffeur seat (vehicle_seats insert + update chauffeurs set default_vehicle_id). No class check anywhere (seats, ops_assign_leg).
  implication: (superseded by the next entry) the vehicle form with Morning / Night is not reachable.
- timestamp: 2026-10-01
  checked: app/ops/OpsFleet.dc.html:390-411 + 564-567, app/ops/OpsTable.dc.html:300,1256,1278, app/ops/ops.dc.html:269,310, git show a1393c93
  found: vehicleFields (with Morning / Night) are only used as the nested "Add a vehicle" form, opened from a chauffeur field that has addLabel. Commit a1393c93 (2026-09-25, "fix: chauffeur class select and drop the fare formula") replaced the chauffeur form's `vehicle` select (which had addLabel "Add a vehicle") with a `vehicleClassId` class select. No chauffeur field has addLabel now; /fleet/vehicles does not exist (ops.dc.html maps vehicles to /fleet/chauffeurs). OpsFleet header: "The vehicle list is not an admin screen."
  implication: since 2026-09-25 the dashboard has NO control that sets chauffeurs.default_vehicle_id, while ops_assign_leg still requires it. With the owner's data, assign can only ever answer no-vehicle until the owner decides how a trip gets its vehicle (rule choice, see Owner decisions).
- timestamp: 2026-10-01
  checked: apps/web/lib/ops/assign.local.test.ts (new) on the isolated stack, VAMOS_LOCAL_DB_PORT=62322, real assignBooking -> asStaff + asSystem -> postgres.js (Worker client options) -> ops_assign_leg
  found: |
    × answers no-vehicle while the chauffeur has no vehicle, assigns once a vehicle is linked, answers overlap on a clash
    PostgresError: no-vehicle
     ❯ lib/ops/assign.ts:243:8
  implication: CONFIRMED. assignBooking rejects with the raw PostgresError although its own try/catch caught it inside the callback. route.ts:55 does not catch -> the Worker answers 500 with no JSON -> vamos-ops-api.js:32 gives {ok:false, code:'http', status:500} -> OpsDetail.dc.html:1374 "Could not assign VT-...".
- timestamp: 2026-10-01
  checked: apps/web/lib/ops/assign-rpc-errors.test.ts (new, always runs; asSystem stand-in with postgres.js begin() rule)
  found: |
    × chauffeur without a vehicle (the owner's live shape, 2026-09-30) → no-vehicle
      AssertionError: promise rejected "PostgresError: no-vehicle { code: 'P…' }" instead of resolving
    × every other named refusal reaches the page too   (rejected "PostgresError: no-email")
    × an overlap that fails at COMMIT → overlap with the other trip   (rejected 23P01)
    × frozen trip → frozen   (unassignBooking, rejected "PostgresError: frozen")
    Tests  4 failed | 1 passed (5)
  implication: every specific assign/unassign message on OpsDetail has been unreachable since 08-04; any refusal showed the generic text. The deferred overlap (23P01 at COMMIT) was never catchable inside the callback either.

## Resolution

root_cause:
fix:
verification:
files_changed: []
