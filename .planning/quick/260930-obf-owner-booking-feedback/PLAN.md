---
quick: 260930-obf
branch: fix/26.4.2-booking-feedback
base: gsd/phase-26.4.1-laptop-bar ccf74454
---
# Quick 260930-obf: owner booking feedback after 26.4 / 26.4.1

Owner verbatim (2026-09-30): "1. on phone the booking flow is shit 2. from, to, flight number same page 3. when {date, and time} needs to be below each other and using the brand system picker similar to desktop design always 4. or put all where, when, who all same page when it opens not 4 step only one step 5. on desktop the flight number appears behind the from field and without any dropdown below it 6. on desktop get back choose your class on home screen and on mobile redesign the card for choose your class". Item 6 mobile = class cards in checkout section 1 on the phone.

## Items

### A. One-page booking sheet, phone and tablet (owner items 1, 2, 3, 4)
Files: app/home/BookingSheet.dc.html, app/home/WhenPicker.dc.html (new `part`, `size`, `error` props; home default unchanged), app/home/home.dc.html (wiring), app/home/BookingSheetStates.dc.html, app/vamos-i18n-dict.js, apps/web/tests/visual/booking-sheet-states.spec.ts, apps/web/tests/visual/home-booking-sheet.spec.ts, apps/web/tests/unit/home-one-form-264.test.ts (if it pins steps).
Acceptance:
- Sheet opens with WHERE (From, flight number directly under From, To), WHEN (Date field, Time field below it, stacked), WHO (passengers, bags) on one scrolling page. No progress mark, no Back, no steps. Close kept.
- Flight: required when From is an airport; other pickups show "Add a flight number" (optional).
- Date and Time triggers open the same brand-system WhenPicker popup the laptop box uses (calendar for Date, hour/minute stepper for Time); no native OS picker.
- One SEE PRICES button, 54 px, never disabled; a warning names what is missing and focuses the first field.
- Kept: trip in URL to /checkout, reload empty, no storage, Lenis data-lenis-prevent, scroll lock, focus trap, visualViewport handling.
- Checked at 390 (en, ar), 768; coverage empty in de/fr/ar.

### B. Desktop flight field behind From, no dropdown (owner item 5)
Files: app/home/home.dc.html (CSS), apps/web/tests/visual/home-laptop-bar.spec.ts (new assertions).
Acceptance: at 1440/1360/1280/1081 with an airport pickup, the flight field bounding box does not intersect From; the From and To suggestion lists render below their field and above other content.

### C. Desktop home "Choose your class" (owner item 6, desktop)
Files: app/home/home.dc.html, app/vamos-i18n-dict.js, new spec apps/web/tests/visual/home-class-cards.spec.ts.
Acceptance: at >=1081, once From, To, When are valid the home calls /api/quote (as 2c8c4592 did); shows Economy, Business, Van luxury with server prices and seats; empty, loading, error and too-small states; picking a class opens /checkout with the trip and `class=`. Phone and tablet keep no prices on home. Reverses 26.4 / 26.3 D-06 for desktop only (owner decision now).

### D. Phone checkout class cards (owner item 6, mobile)
Files: apps/web checkout section 1 class cards (CheckoutForm.tsx and its CSS), apps/web/i18n/messages/*.json if new strings, spec apps/web/tests/visual/checkout-sections.spec.ts.
Acceptance: at <=680 px a compact card per class: name, seats and bags icons, prominent price, selected = charcoal border + check, too small = greyed "Seats up to N"; 54 px tap target; checked at 390 and 768.

## Rules
Design system only, no glow, no tinted yellow, four languages same pass, RTL logical CSS, 54 px controls, no invented price. No push, merge, deploy or live write.
