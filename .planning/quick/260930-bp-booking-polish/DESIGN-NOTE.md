# Booking polish, hand-over 1: the trip distance

Design note for the owner's signature. Branch `fix/booking-polish`. Nothing is shipped.
The pictures are real renders of a working prototype on the branch; it can still change.

## What the customer will see

Anna books Zurich Airport to Davos Platz.

1. **On `/checkout`, top of the page, every width.** Under the route line she reads
   **148.2 km** first, then the date, passengers and bags:
   `148.2 km · Tue 15 Dec, 08:15 · 2 passengers · 3 bags`.
   The figure is in Qurova, charcoal. No pill, no new colour.
2. **On `/checkout`, in the order summary** (right-hand card on a laptop, inside
   "Payment" on tablet and phone). The first fact under the two stops is **148.2 km**
   with the arrow icon the booking voucher already uses for distance.
3. **On the home page, laptop only (1081 px and wider).** Once the prices have loaded,
   the line under "Choose your class" starts with the distance:
   `148.2 km · Fixed price, all inclusive. Pick a class to continue.`

The number is the server's quote distance, the same metres the fare is built on. The
browser only writes it as kilometres with one decimal. While the quote is loading, or if
it fails, no distance is shown. Arabic reads `148.2 كم`; the digits stay left-to-right.

### Why the distance is not inside the home class cards

All three cards are the same trip, so the same number would appear three times, and card
layout E (signed 2026-09-30) has no free line: name, price, seats and bags, SELECT. Adding
a line changes the signed card. One distance on the section line says it once and leaves
the cards untouched.

## Pictures

Folder `.planning/quick/260930-bp-booking-polish/screens/`. Trip and distance are a
fixture (148 230 m). Amounts are `CHF 000` / "Price at checkout": no price is invented.

Checkout, top of the page (trip strip and class cards):
`checkout-{390,768,1024,1440}-{en,de,ar}-top.png` (12 files)

Checkout, order summary card:
`checkout-{390,768,1024,1440}-{en,de,ar}-summary.png` (12 files)

Home proposal, laptop widths only:
`home-{1180,1440}-{en,de,ar}-page.png` and
`home-{1180,1440}-{en,de,ar}-class-section.png` (12 files)

There are no home pictures at 390, 768 and 1024: the home page shows class cards and
asks the server for a quote only from 1081 px up. See decision 1.

## Facts

### 1. Where the server's distance reaches the browser today

- `POST /api/quote` and `POST /api/quote/reprice` already answer with
  `route.legs[].distance_m` (contract `.planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md:205-214`;
  built in `apps/web/lib/quote/pipeline.ts:131-139`, `:350-367`, `:990-1000`).
  No server change is needed.
- `/checkout` received it and threw it away: `parseQuoteJson` kept only id, lock, expiry
  and classes (`apps/web/lib/checkout/checkout-quote.ts`). The prototype keeps
  `distanceM` (`checkout-quote.ts:69`, `:151-167`, `:184`).
- Home (`app/home/home.dc.html`) calls the same `POST /api/quote` for the laptop class
  cards (`ccFire`) and also ignored `route`. The prototype reads it (`ccRouteKm`, line 959).
- The signed lock also carries `distance_m` per leg (`apps/web/lib/quote/lock.ts:67`),
  base64 inside the token. The prototype does not read the lock.
- The "FORBIDDEN" lists are about what the browser may **send**, not what it may
  receive: `apps/web/lib/quote/schema.ts:40-62`, `apps/web/lib/checkout/price-route.ts:15`,
  `apps/web/lib/checkout/intent-schema.ts:10-16`. A request body that contains
  `distance_m` is refused (`untrusted_input`) so a customer cannot set the distance the
  fare uses (contract lines 68-76, 558). No recorded decision forbids **showing** it;
  nothing in `.planning/decisions/` mentions distance.
- `POST /api/checkout/price` answers lines and totals only, no distance
  (`price-route.ts:58`). Not needed: the quote on the same page has it.
- A leg the server could not route on a road (car-free towns) is measured as a straight
  line and flagged `road: false` (`apps/web/lib/geo/mapbox.ts:531-548`). The prototype
  shows no distance for such a trip. See decision 3.

### 2. Every place a customer sees a trip

| Place | Surface | Shows distance |
|---|---|---|
| Home, laptop class cards | mock `app/home/home.dc.html` | no today; yes in the prototype (section line) |
| Home, phone and tablet booking page | mock `app/home/BookingSheet.dc.html` | no (no quote is asked there) |
| `/checkout` trip strip | `apps/web/app/[locale]/checkout/sections/TripStrip.tsx` | no today; yes in the prototype |
| `/checkout` order summary | `sections/SummaryRail.tsx` | no today; yes in the prototype |
| `/confirmation/<ref>` voucher | `apps/web/components/booking/BookingVoucher.tsx:391-395` | yes, once the booking is read (`booking-read.ts:337`); not on the "pending" ticket (`confirmation/[ref]/page.tsx:57`) |
| Manage booking | mock `app/pages/manage-booking.dc.html` | no |
| Account, booking list | mocks `app/pages/account.dc.html`, `bookings.dc.html` | no |
| Account, booking detail | mock `app/pages/booking-detail.dc.html` | no |
| E-mails: confirmation, pay link, reminder 24 h, time change, flight number, driver assigned, cancellation, review request | `packages/emails/src/*.tsx` | no, none of them |

Nothing in this table was changed except the three prototype rows.

## Decisions for the owner

1. Phone and tablet home page: no distance there, because no price is asked there. The
   first place the phone customer sees km is the top of `/checkout`. Keep it so, or ask
   the server for a quote on the phone booking page as well (one more quote per visitor)?
2. Home: distance on the section line (pictures `home-*`), or not on the home page at all?
3. Trips with no road line (for example to a car-free town): show no distance (prototype),
   or show the straight-line figure the fare uses?
4. Order summary: distance as the first fact with the arrow icon (prototype), or on the
   line between pickup and destination (the design system has a slot there, a small grey
   chip)?
5. Phone, German: the facts line under the route grows from two lines to three
   (`checkout-390-de-top.png`). Accept, or move passengers and bags off that line on the phone?
6. Confirmation voucher writes "148.2 km" with the visitor's number format (French
   "148,2 km", a round trip "18 km"). Checkout writes "148.2 km" and "18.0 km" always.
   Make the voucher match, in a later job?
7. Add the distance to manage booking, the account pages and the e-mails? Not in this job.

## Not built yet

- Nothing is merged, pushed or deployed. The prototype is five small commits.
- No French pictures (French strings exist: the checkout reuses the existing key
  `checkout.distanceKm`; the home dictionary has one new pattern with de, fr, ar).
- No new visual gate test; the two capture specs only run with `BP_CAPTURE=1`.
- Full gates (lint, i18n:check, full unit set, build, twin tests) were not run; only
  `checkout-quote.test.ts` (11 pass) and `tsc --noEmit` (clean).
- Not tried against the real server or a real Mapbox route; the distance in the pictures
  is a fixture. The owner's 4242 payment is UAT step 1 after code is signed.
