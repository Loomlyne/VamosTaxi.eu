# Phase 17: Ops chauffeur profile, shift roster, two-driver vehicles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
**Areas discussed:** shift pattern, vehicle seats, duplicate identity, leave, dedicated page, duplicate-email confirm, double Add, page contents

---

## Shift days and times

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly hours per weekday | Mon 06:00–14:00, Tue … in Europe/Zurich | |
| Two named windows | Morning and night windows on the person | |
| One start/end for selected days | One start and one end applied to every ticked weekday | ✓ |
| You decide from OpsFleet | Leave the existing status select | |

**User's choice:** One start/end time for every selected day
**Notes:** Not different hours per weekday. Not two named time windows on the person. Overnight wrap (end before start) allowed as planner discretion.

---

## Vehicle seats

| Option | Description | Selected |
|--------|-------------|----------|
| Named Morning and Night | Third assign refused with the exact reason | ✓ |
| Any two, no labels | Cap of 2, no morning/night names | |
| Unlimited multi-select | Keep today’s chauffeurIds; cap later | |

**User's choice:** Named seats: Morning and Night. Third assign refused with that reason.
**Notes:** Owner: “only the plate can be putted for 2 chauffeurs and one morning and one night not both morning not both nights.”

---

## Duplicate identity

| Option | Description | Selected |
|--------|-------------|----------|
| Same phone | Normalised +41… | |
| Same licence number | | |
| Same phone or licence | Either match | |
| Same email when present | Else phone | |

**User's choice:** Free text — owner adds chauffeurs; if a duplicate email exists, inform and confirm the save.
**Notes:** Follow-up locked Confirm = open existing, do not insert. Duplicate check is normalised email.

---

## Dispatcher leave

| Option | Description | Selected |
|--------|-------------|----------|
| List of leave ranges | from → until; current range overrides the clock | ✓ |
| One leave at a time | New leave replaces it | |
| Status only | On leave with no dates | |

**User's choice:** List of leave ranges (recommended; CONTEXT D-12)
**Notes:** No “leave with no dates.”

---

## Chauffeur full page location

| Option | Description | Selected |
|--------|-------------|----------|
| Grow existing `/fleet/chauffeurs/:id` | UI-SPEC first, then port. No new dashboard | ✓ |
| New dedicated .dc.html mock | Then replace the thin page | |
| Keep Add/Edit dialog as editor | Page stays read-only | |

**User's choice:** Grow that existing page. Signed UI-SPEC first, then port. No new dashboard.
**Notes:** Owner: “fleet → Chauffeur → Chauffeur full page.” Path already routed.

---

## Duplicate email Confirm

| Option | Description | Selected |
|--------|-------------|----------|
| Do not create a second row. Open the existing chauffeur | | ✓ |
| Save anyway (two may share an email) | | |
| Overwrite the existing chauffeur with this form | | |

**User's choice:** Do not create a second row. Open the existing chauffeur.

---

## Double-click Add

| Option | Description | Selected |
|--------|-------------|----------|
| Always one row. No extra dialog | | ✓ |
| One row only if the email already exists | | |
| Two rows is fine; only the email warning matters | | |

**User's choice:** Always one row. No extra dialog.

---

## Dedicated page extras

| Option | Description | Selected |
|--------|-------------|----------|
| Photo, live trips, and past assigned bookings (click opens the booking) | | ✓ |
| Photo and live trips only | | |
| Photo only. Bookings stay on the board | | |

**User's choice:** Photo, live trips, and past assigned bookings (click opens the booking).

---

## Claude's Discretion

- SQL shape (junction vs columns) for Morning/Night seats
- Idempotency key for double Add (client UUID on overlay open + `ON CONFLICT (id)`)
- Overnight wrap comparison
- How leave ranges are stored
- Cron vs request-time recompute of `chauffeurs.status`
- Overlay verbs `Save chauffeur` / `Save leave` / `Save shift`; dialog dismiss `Keep editing`

## Deferred Ideas

- Phase 16 Staging MX + Reply-in-Gmail (parked this sitting; owner named 17)
- Driver app / chauffeur login
- Auto-dispatch
- Staff tab
- Live `vamostaxi.eu` DNS, `sk_live_`, owner Publish of public CHF
- Different hours per weekday (rejected)
