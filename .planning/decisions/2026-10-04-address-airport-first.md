# 2026-10-04 — address list: airports first, stations by name (owner)

**Decision (owner, in the controller's chat, 2026-10-04 14:38 +04, verbatim):**

> Airport first: when the typed text matches an airport, put airports at the top, then keep Mapbox's order for the rest. Also map Mapbox results named "… Station"/"HB" to the STATION kind with the train icon. Make it one small job in its own worktree, Sonnet 5.5 High.

**Why:** live check after the site-polish ship (2026-10-04 14:30): typing "zur" listed Zurich Airport fifth (Mapbox's order, item 8 of the site-polish hand-over) and "Zurich Main Station" as PLACE with a pin, while the hand-over's UAT 3 expected the airport first and a train for a station.

**Where it applies:** the From/To address suggestions (`/api/geo/suggest`, `kind` from `apps/web/lib/geo/mapbox.ts`) and every list that shows them (home mock and the React twins). Popular picks are unchanged.
