# Quick 260930-obf — owner booking feedback (26.4.2) — Summary

Branch `fix/26.4.2-booking-feedback`, cut from ccf74454, main merged (a8411a40, origin/main 520176c0). Owner decisions: `OWNER-DECISIONS-2026-09-30.md`.

## What changed
- **A. Phone and tablet (<1081 px):** the 4-step sheet is now ONE page. Order: Where (Flight only after a Swiss-airport From, then From, then To) → When (date, then time below it; both open the Vamos WhenPicker, never the native picker) → Who (passengers, bags) → one SEE PRICES.
- **B. Laptop bar:**
  - Order is Flight → From → To → When → Travellers.
  - The flight field is hidden until From is an airport, then it slides in before From. From's top moves 0 px, and focus moves into the flight field.
  - For a non-airport From, an optional "Add a flight number" button takes its place (26.4 D-09).
  - The address list opens upward when there is no room below.
  - The Tab order equals the visual order in en and ar.
- **C. Laptop home "Choose your class"** (≥1081 px) is back under the bar, with prices from the server quote.
- **D. Checkout section 1 class cards** are redesigned for phone and tablet (`checkout.css`). `TripEditor.tsx` follows the new field order.
- **Bug fixed:** `[data-block=""]` made every class price grey (6c6f6f4a).

## Quote trigger and states (home class cards)
- Laptop only (≥1081 px). Phone and tablet never quote on home.
- Fires only when From, To and When are valid and both places carry a Mapbox id.
  - The trip signature is pickup id, drop-off id, when, pax, bags and flight.
  - POST `/api/quote` goes 900 ms after the signature settles, never per keystroke, never twice for one signature.
  - A client cap of 4 per rolling 60 s matches the server limit; a 5th shows the limit state without calling the server.
- States:
  - idle: hidden
  - loading: 3 skeletons, `aria-busy`
  - ok: server prices
  - none: "No class fits this trip"
  - limit or error: cards without a price, "Price at checkout"
- A class the party does not fit is greyed out with "Seats up to N" or "Bags up to N".
- A card opens `/checkout?…&class=<slug>`.
- No amount in page source (test-pinned). Test and screenshot amounts are fixtures.

## Checks (executor, after the main merge)
typecheck pass · unit 247 files / 2465 tests pass · lint 0 errors · lint:css pass · seed gen/check no drift · visual specs, one file at a time, all pass:
- booking-sheet-states 39
- home-booking-sheet 55
- home-booking-box 14
- home-laptop-bar 78
- home-desktop-fixes 14
- home-class-cards 12
- checkout-sections 21

de/fr/ar coverage is empty.

## Cross-browser
Chromium, Firefox and WebKit, each at 1081/1280/1360/1440 (12 runs):
- The flight field never overlaps From; From moves 0 px.
- Focus lands in the flight field.
- The From suggestion is hit-testable at its centre.
- Engines differ by 1 px or less.

The new bar order does not use `:has()`. The older booking-slots grid does; support starts at Safari 15.4, Firefox 121 and Chrome 105 (from browser tables, not measured).

## Open
- In progress: the When field date is English in de/fr/ar ("Mon 5 Oct"); this existed before this task.
- The mock's built-in demo places have no Mapbox id, so they get no class prices.
- Owner signature on the screenshots is pending. Real card payment after deploy is the control session's job.
