# Owner decision: no Cars page, no fleet (2026-10-01)

His words, through the 26.2 session: "No cars tab. No fleet. Only chauffeurs, and their data needs
to be there, that's it."

| # | Decision |
|---|---|
| 1 | The dashboard has no Cars tab and no "fleet" entry in the menu. |
| 2 | The chauffeur form carries the car's own fields: plate, model, class, seats, bags. One car per driver, saved with the chauffeur. |
| 3 | Deleting a driver deletes his car; refused while an unfinished trip uses it. |
| 4 | The Cars page branch `gsd/26.2-cars-page` is withdrawn: archived on GitHub, never merged. |

| 5 | Simplified again the same day: "each chauffeur will be chosen by a class, that's it, without anything extra, so I can assign him easily on bookings." No car at all: the chauffeur form has Class only; Assign lists only drivers of the booking's class; no vehicle is chosen (`assigned_vehicle_id` stays empty, capacity from the class). Migration `20261007160000`. |

Replaces the earlier "Cars page" reading of the 26.2 session. Job: branch `gsd/26.2-chauffeur-car`.
