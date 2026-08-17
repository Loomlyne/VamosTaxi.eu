# 08 — Checkout & confirmation: vehicle vocabulary, step model, morph targets

**Surfaces:** `checkout.dc.html`, `confirmation.dc.html`
**Source:** motion-and-correctness review, chat, 4 Aug 2026

## 1. Step model — already three, now the only one

`quote.dc.html` (4 steps: Route/Vehicle/Details/Payment) is deleted. Checkout's `StepIndicator`
was already the intended three-step model (Trip → Details → Payment); with the orphaned page
gone there is exactly one `StepIndicator` definition left in the funnel, and confirmation
correctly renders no step indicator at all — it's a terminal state, not step 4.

## 2. Vehicle vocabulary now matches home

`VEHICLE_NAME` on both pages is `{ economy:'Economy', van:'Van' }`, matching home's
`VEHICLE_CLASSES` ids (see `docs/SPEC-home-booking-widget.md` §1 and
`docs/LEGAL-PLACEHOLDER-CHECKLIST.md` §H). `DEFAULT_TRIP.vehicle` on both pages falls back to
`'economy'` instead of `'business'` — a class that no longer exists anywhere in the fleet.
Every selection now survives the handoff into the price line and the voucher; previously
everything landed on checkout labelled "Business" regardless of what was picked.

## 3. "Change vehicle" contract

Checkout's back link is `home.dc.html#fleet` (was `#book`). Home reads that hash on mount and
hydrates the widget — including the previously selected vehicle — from the same `vamosTrip`
record checkout wrote; see `docs/SPEC-home-booking-widget.md` §5 for the home-side half of this.

## 4. View Transition names

Both pages declare `@view-transition { navigation: auto }` plus a `prefers-reduced-motion`
override. Checkout tags its summary `Card` `vehicle-card` (matches home's picked fleet card),
its `RouteSummary` `route-block` (matches confirmation's), and its `PriceSummary` `price-block`
(matches both neighbours) — so picking a vehicle morphs into checkout's sticky rail, and paying
morphs that same rail into the voucher on confirmation. No JS fallback; unsupported browsers
(Firefox) get today's plain navigation.
