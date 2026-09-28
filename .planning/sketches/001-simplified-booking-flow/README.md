---
sketch: 001
name: simplified-booking-flow
question: "How few screens and inputs can the booking flow (home card → pay) take, while staying adaptive at 390 / 768 / 1024 / 1440?"
winner: null
tags: [booking, checkout, home, responsive, funnel]
---

# Sketch 001: Simplified booking flow

## Design Question
Today the flow is home card → `/checkout/trip` → `/checkout/details` → `/checkout/payment`:
4 screens, the trip typed twice, the flight number asked up to three times, prices hidden on
the checkout class cards, and on phone the Continue button sits above the form. Can it be
shorter and feel native on every size, using only the Vamos design system?

## How to View
open .planning/sketches/001-simplified-booking-flow/index.html

Top bar: switch variant, viewport width (390 / 768 / 1024 / 1440 / Fit), "Fill sample trip",
"Reset". Every variant runs end to end: home → pick class → details → pay → confirmation.
Layout uses container queries, so the width buttons show the real phone / tablet / desktop
layouts.

## Variants
- **A: Two screens** — home card (From, To, When, Travellers) → one checkout page with three
  numbered sections (class with prices, who is travelling, payment). Sticky summary rail on
  desktop, sticky total + Pay bar on phone/tablet. Merges the three checkout routes into one.
  Closest to the current code.
- **B: One question at a time** — home is a single "Where are you going?" pill plus quick
  chips (From Zurich Airport…). Then 6 short steps: route, when (+ flight if airport),
  travellers, class (tap = next), details, pay. Same shape at every size; desktop adds a live
  summary beside the question.
- **C: Never leave home** — the home card shows fixed prices for all classes as soon as From
  and To are set. Select opens checkout in place: bottom sheet on phone, side drawer on
  tablet/desktop. No page load until paid.

## Simplifications shared by all three
- No trip-type tabs: an airport pickup is detected from the From address.
- Flight number asked once, only when pickup is an airport.
- Passengers + bags in one control; native date/time inputs.
- Extras, driver note and company receipt collapsed as optional disclosures.
- Voucher behind "Have a voucher?"; one primary Pay button, wallets on top.
- Legal/cancellation line once, next to the Pay button.

## What to Look For
- Phone at 390: can you reach Pay with your thumb without scrolling back up?
- Tablet at 768: does the layout look designed, or like a stretched phone?
- Desktop at 1440: does the home card read in one glance?
- Which one would you trust with a CHF payment?

## Not in this sketch (production must add)
- DE / FR / AR strings and RTL check — this is an internal review scaffold, English only.
- Real quotes: every amount stays `CHF 000`; the cancel window is a `data-tok` TBC pill.
- Stripe Elements, Turnstile, sign-in path, return-trip.
- Qurova is loaded from the local brand pack only; the web licence (ADR-009) is still open,
  so this sketch is not published to any hosted page.
