---
status: partial
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
source:
  - 17-01-SUMMARY.md
  - 17-02-SUMMARY.md
  - 17-03-SUMMARY.md
  - 17-04-SUMMARY.md
  - 17-05-SUMMARY.md
started: 2026-09-18T14:42:35Z
updated: 2026-09-18T15:19:13Z
---

# Phase 17 UAT — chauffeur desk on dashboard.vamostaxi.site

Agent drives live host. No `#support` typed. No Staff. No `.eu`. Agent does not Publish. Agent does not `db push`.

## Current Test

number: 4
name: One Add click = one row
expected: |
  One chauffeur row from a double Add. Dedicated page at `/fleet/chauffeurs/{id}`.

## Tests

### 1. Dispatch login chrome
who: agent
action: GET `https://dashboard.vamostaxi.site/login` (Chrome-UA)
expected: 200, heading Dispatch sign in, ops-login, not Staff, not plain Not Found
result: pass
reported: "200 text/html; Dispatch sign in; ops-login; Staff false; Not Found false"

### 2. Live Worker serves OpsFleet (not Board)
who: agent
action: GET live `/app/ops/ops.dc.html` and `/app/ops/OpsFleet.dc.html`
expected: `dc-import name="OpsFleet"`. Copy includes Save chauffeur, Morning, Keep editing. No product `OpsFleetBoard` import.
result: pass
reported: "Worker vamos 105b5b1b. ops.dc.html OpsFleet import 1, OpsFleetBoard 0. OpsFleet.dc.html Save chauffeur / Morning / Keep editing true."

### 3. Hosted chauffeur-desk SQL
who: agent
action: MCP execute_sql on yaumjzvylngfjhtuffqs — columns + to_regclass
expected: `chauffeurs.shift_weekdays` / `shift_start` / `shift_end` exist. `chauffeur_leave_ranges` and `vehicle_seats` exist.
result: pass
reported: "stamp ops_chauffeur_desk_v2 20260918150707. shift_weekdays/start/end/tz. leave_ranges + vehicle_seats. 2 then 1 seat after live list. vamos_staff SELECT."

### 4. One Add click = one row
who: agent after deploy + SQL
action: Sign in. Fleet → Chauffeurs → Add a chauffeur. Double-click Add. Count rows.
expected: One chauffeur row. Dedicated page at `/fleet/chauffeurs/{id}`.
result: issue
severity: blocker
reported: "Session already on /fleet/chauffeurs as koussayy admin. List shows 1 Koussay Off duty. Native <a> Dashboard click navigates. drive_preview click Add a chauffeur and Edit report success but Dialog never opens (editorOpen stays false; no Save chauffeur form). Direct URL /fleet/chauffeurs/017bc319-36d4-4cae-a6d2-198a4a53087b loads the dedicated page. GET /api/staff/chauffeurs 200. DB still 1 row. Double-Add not exercised."

### 5. Duplicate email opens existing
who: agent after deploy + SQL
action: Add with an email already on file.
expected: This email is already on file. Open existing chauffeur. No second row.
result: blocked
blocked_by: prior-test
reason: "Test 4 overlay did not open. Hosted Koussay email is null (unique-index apply nulled the later double-Add). Detail copy: Cannot assign until an email is saved."

### 6. Morning / Night seats refuse third
who: agent after deploy + SQL
action: Assign Morning, Night, then a third chauffeur on the same plate.
expected: Exact refuse: already has Morning and Night chauffeurs. Not both morning. Not both night.
result: blocked
blocked_by: prior-test
reason: "Need Add overlay or vehicle editor. vehicle_seats has night only for 2098890 / Koussay. Morning empty. Third chauffeur not created."

### 7. Shift clock On shift / Off duty
who: agent after deploy + SQL
action: Tick today, set a Zurich window that contains now, Save shift. Then a window that does not.
expected: Badge On shift inside window. Off duty outside. No status select as the duty switch.
result: issue
severity: blocker
reported: "Dedicated page shows Save shift / Save leave / Keep editing. OpsFleet.dc.html wires saveShift, saveLeave, keepEditing to empty functions. No weekday ticks, no start/end fields on the detail page. Those fields exist only on the list Dialog. Status on page is Off duty (derived). Cannot complete clock UAT."

### 8. Leave overrides clock
who: agent after deploy + SQL
action: Add a leave range that contains today. Save leave.
expected: On leave until the range ends. Empty live / past copy has a next step. No sample VT- rows.
result: issue
severity: blocker
reported: "Save leave is a no-op on the dedicated page. chauffeur_leave_ranges count 0. Live trips / past bookings empty copy matches (No live trips / No past bookings). No sample VT- rows."

## Summary

total: 8
passed: 3
issues: 3
pending: 0
skipped: 0
blocked: 2

## Gaps

- truth: "Add a chauffeur Dialog opens from the list and one save creates one row"
  status: failed
  reason: "In-app pointer click on DC Button Add/Edit does not set editorOpen. Native <a> clicks work. Double-Add not run."
  severity: blocker
  test: 4
  root_cause: "OpsTable startAdd is bound to VamosTaxiDesignSystem Button onClick; drive_preview click does not fire it. Product still may work with a hardware mouse — unproven this sitting."
  artifacts:
    - https://dashboard.vamostaxi.site/fleet/chauffeurs
    - app/ops/OpsTable.dc.html
  missing:
    - hardware click on Add a chauffeur, or a native button/a that the in-app driver can fire
  debug_session: ""
- truth: "Dedicated chauffeur page saves Zurich shift and leave"
  status: failed
  reason: "saveShift/saveLeave/keepEditing are empty lambdas; no clock/leave editors on /fleet/chauffeurs/{id}"
  severity: blocker
  test: 7
  root_cause: "OpsFleet detail compute() stubs save handlers; shift fields only on list overlay"
  artifacts:
    - app/ops/OpsFleet.dc.html
    - https://dashboard.vamostaxi.site/fleet/chauffeurs/017bc319-36d4-4cae-a6d2-198a4a53087b
  missing:
    - weekday + start/end + leave range editors that POST persistChauffeurDesk
  debug_session: ""
- truth: "Duplicate email opens existing chauffeur"
  status: failed
  reason: "Blocked on Add overlay. Live Koussay has email null."
  severity: major
  test: 5
  root_cause: "ops_chauffeur_desk_v2 nulled later duplicate email so unique index could land"
  artifacts:
    - packages/db/supabase/migrations/20260918140000_ops_chauffeur_desk.sql
  missing:
    - an email on the live chauffeur, then Add with the same address
  debug_session: ""
