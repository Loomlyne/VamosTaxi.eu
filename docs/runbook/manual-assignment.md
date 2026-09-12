# Manual assignment — live Ops

English numbered clicks on https://dashboard.vamostaxi.site. No screenshots. Do not invent chauffeur names. Do not rebuild assign. V1 has no driver app.

Support if dispatch is stuck: **info@vamostaxi.site** and **+41 79 626 70 82**.

Live buttons on booking detail:

- **Assign driver** when nobody is on the trip (primary).
- **Reassign** when a chauffeur is already on the trip (ghost).
- **Unassign** when a chauffeur is on the trip and the trip is not frozen.

The vehicle on the trip is the vehicle already stored on that chauffeur. There is no separate “assign vehicle” button. History may still show **Vehicle assigned** after a successful assign.

## Must nots

1. Do not type a fake chauffeur. Pick from **Driver** — names already in Fleet.
2. Do not assign an unpaid trip. Expected toast: **Unpaid trips cannot be assigned.**
3. Do not assign a frozen trip (**Completed**, **Cancelled**, **Refunded**, **No-show**). Expected: **This trip is frozen.**

## 1. Open a paid, unassigned booking

1. Open https://dashboard.vamostaxi.site
2. Sign in (heading **Dispatch sign in**).
3. Left rail: **Bookings**.
4. Optional filter: **Unassigned**. Expected: paid trips with no chauffeur.
5. Click the row. Expected: heading **ASSIGNMENT**, list row **No driver assigned**, subtitle **Assign before the pickup reminder goes out**.
6. Top bar shows **Assign driver**.

## 2. Assign chauffeur (and their vehicle)

1. Click **Assign driver**.
2. Expected dialog title **Assign driver**. Field label **Driver**. Note: **Assignment is manual in V1 — there is no driver app and no automatic dispatch.**
3. Open **Driver**. Pick the chauffeur already on file for this trip. Do not type a new name here.
4. Click **Assign driver** in the dialog (or **Cancel** to abort).
5. Expected toast starting **Driver assigned to** plus this booking’s own reference. Dialog closes. **ASSIGNMENT** shows that chauffeur. **Reassign** and **Unassign** appear. History may list **Driver assigned** and **Vehicle assigned**.

## 3. If assign refuses

Toasts are the live product. Stop and fix Fleet — do not invent a workaround:

- **Pick a chauffeur first.** — nothing selected in **Driver**.
- **Cannot assign until this chauffeur has an email on file.** — open Fleet → Chauffeurs and put the real email on that chauffeur.
- **Cannot assign until this chauffeur has a vehicle.** — that chauffeur needs a vehicle on file first.
- **This vehicle cannot take this trip’s passengers and bags.** — pick another chauffeur whose vehicle fits.
- **Overlaps** plus another booking’s reference and time — that chauffeur is already on another trip then.
- Toast starting **Could not assign** — stop. Use the support contacts above.

## 4. Reassign or unassign

1. On an assigned trip, click **Reassign**. Same dialog as step 2. Pick a different chauffeur already on file. Click **Assign driver**.
2. Or click **Unassign**. Expected toast starting **Assignment cleared for** plus this booking’s own reference. History: **Assignment cleared**. **ASSIGNMENT** returns to **No driver assigned**.

## Done when

- **ASSIGNMENT** shows the chauffeur you picked from Fleet, or **No driver assigned** after **Unassign**.
- You did not invent a name.
