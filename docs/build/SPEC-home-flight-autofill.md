# 06 — Home · flight number autofill (AeroDataBox)

**Surface:** `home.dc.html` (booking website, home) · **Component:** the hero quote widget's `Flight (optional)` field + flight panel
**Source of truth:** client spec "Flight Auto-Fill Logic using AeroDataBox" (chat, 4 Aug 2026)
**Status:** logic built 4 Aug 2026 · running on fixtures — one API key away from live

---

## 1. What the field does

One flight number resolves to one of two bookings, decided by the feed's own status:

| Flight phase | Booking direction | Filled |
|---|---|---|
| Not departed, departure airport is ZRH / GVA / BSL | ride **to** the airport | destination = departure airport (+ terminal → saved place). Pickup = the traveller's location when it is already known. **Date and time are never overwritten** |
| Not departed, only the arrival airport is ours | airport **pickup** | pickup = arrival airport, date + time = scheduled arrival |
| Airborne | airport **pickup** | pickup = arrival airport, date + time = estimated arrival |
| Landed | airport **pickup** | pickup = arrival airport, date + time = actual arrival |
| Cancelled | none | nothing is filled; the panel says so |
| Neither airport is ours | none | nothing is filled; the panel says which airports we drive |

Time precedence is **actual › estimated › scheduled** everywhere a time is read, and the panel
names which one it is showing ("lands 13:34 estimated · 14 min late").

## 2. Rules that hold in every branch

- **Nothing is invented.** A null terminal, gate or baggage belt renders no chip at all.
- **A field the traveller typed is never overwritten.** Manual edits set a `touched` flag per
  field; the panel reports what it kept instead ("Kept your own Pickup").
- **A field a *previous* flight filled is fair game** — provenance is tracked in `autofill`, so
  swapping EK 87 for LX 318 clears the old flight's pickup/date rather than leaving a ZRH → ZRH trip.
- **Autocomplete over typing.** Two characters open a suggestion list of real flights
  (`EK 87 · Dubai (DXB) → Zurich (ZRH)` / `lands 13:20 · T2 · Scheduled`), ranked by the airport
  nearest the traveller when location is known. Invalid numbers can't be submitted.
- **The booking follows the flight.** While a flight is attached the widget re-reads the feed
  (`flightRefreshMs`, default 45 s) and moves the pickup time on a revised arrival. It stops once
  a vehicle is chosen.
- **No status panel.** Client direction, 4 Aug: the flight fills the right fields at the right
  time and otherwise says nothing. The only visible feedback is the field's own error line —
  "No flight on that number today", or the reason a cancelled/off-route flight filled nothing.
- **Location is asked for, not demanded.** Position is read silently only when permission is
  already granted; otherwise the traveller taps "Use my current location". Reverse geocoding is
  Photon, the same geocoder the address fields use.

## 3. The one seam to wire

`FLIGHT_API` in `home.dc.html` is the whole integration surface:

```js
localStorage.setItem('vamosAdbKey', '…');   // RapidAPI key, read at call time
FLIGHT_API.search(term, here)   // GET /flights/search/term?q=      → autocomplete (numbers only)
FLIGHT_API.status(num, date)    // GET /flights/number/{num}/{date} → full status, one day
```

The key is read from `localStorage` so it never sits in the source. With no key both calls answer
from the `FLIGHTS` fixtures; with a key they hit AeroDataBox. Live term search returns flight
numbers without times, so those rows read "Tap to look up this flight" and resolve to a full status
call on tap — nothing is displayed or filled before the real payload arrives.
`adbNormalize()` maps the real payload onto the shape the UI consumes — `scheduledTime`,
`revisedTime`/`predictedTime`, `runwayTime`/`actualTime`, `terminal`, `gate`, `baggageBelt`,
`airport.iata`, `aircraft.model`, `status`. Nothing else in the widget touches the API.

Fixture progression (`simulateLiveUpdates` tweak, on by default) stands in for the feed moving
while someone books: a revised time lands, then a gate, then the belt. Turn it off to demo a
static flight.

## 4. Pending

- **API key + server proxy** — a browser-side key is readable by anyone who opens the page, so
  production needs a thin server route. For the prototype, `localStorage.vamosAdbKey` is enough.
  Without it the schedule is fixture data.
- **Departure lead time** — for rides *to* the airport the spec leaves the pickup time to the
  traveller. If Vamos wants a suggested departure (check-in lead + drive time), that is a pricing
  and ops rule we don't have yet.
- Airports served are hardcoded to ZRH (T1/T2), GVA and BSL, matching the saved-places list.

## 5. Revision, 4 Aug 2026 — confirm-gated, not silent

A motion-and-correctness review changed the trust model: a resolved flight no longer writes to
any field on its own. It opens a **card** under the input instead.

- **Card, not silent fill.** Airline, flight number, both airports, a status chip, terminal/
  gate/belt when the feed has them, the date being assumed, and the direction stated as a plain
  sentence ("Arriving at Zurich Airport (ZRH) at 13:20 — we'll meet you there"). Two buttons:
  **Use this flight** (charcoal, applies the existing two-wave staggered fill + yellow badges
  unchanged) and **Not my flight** (dismisses, keeps whatever the traveller typed).
- **Date lives in the card.** Flight numbers repeat daily, so a Today / Tomorrow pair replaces
  guessing; picking one re-runs the status lookup for that day. A further "pick a date" beyond
  tomorrow is deferred — nobody looks up a flight number three weeks out for an airport transfer.
- **Confirmed collapses to a chip.** Code + status, live poll updates land here, and "Remove
  flight" clears exactly what that flight filled (provenance-tracked, same as before).
- **One end only.** The old fallback that also filled the pickup from geolocation when a flight
  only determined the destination is removed — a flight number now determines the one end its
  direction implies; the other end is always left for the traveller.
- **Reversible, not just overridable.** An autofilled field's badge hides while the field has
  focus and disappears for good the moment the value changes; a manual edit also arms a
  6-second "Revert to …" ghost next to pickup, destination and the date/time field.
- **Poll never fights an open field.** If the when-field is open when a revised time lands, the
  update queues as a chip message ("Flight time changed to 15:10 — update?") with an explicit
  Update button instead of moving the value out from under the traveller.
- **Scope flag.** `flightTrackingEnabled` (default on) is the A14 kill switch — off, the field
  is a plain optional text input with no lookup, no card, no polling. See
  `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` §H.
