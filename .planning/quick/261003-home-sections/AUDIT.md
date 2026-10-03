# Home page audit — 2026-10-03

Read from live https://vamostaxi.site (read-only, GET only) and the mocks in `app/home/`.
Compared with Mobbin: Klook, Expedia airport transport, Uber Reserve, Tripadvisor, Airtasker, Wise.
Pictures: `screens/before-*` (live today), `screens/home-*` and `screens/classes-*` (proposed).
Sketch sources: `sketch-home.html` + `sketch-home.js` (`?s=<section>&lang=`), `sketch-classes.html` (`?v=a|b`).
Dashed "NEEDS YOUR TEXT" pills are sketch notes for the owner, not product copy.

## Urgent, live today

1. **Fake rating on the hero and in Reviews.** `/api/reviews` returns 5 rows marked published
   that are layout samples (`authorName "1"`, "First L.", "One verbatim sentence from a real
   review sits here…"). The hero shows "Excellent · Trustpilot · 5.0/5 · 5 reviews" from them.
   Owner step: unpublish those rows on the dashboard Reviews screen. Code: hide the hero rating
   and the section under 3 real reviews.
2. **How it works, card 02:** the "Vamos taxi / LX 54" name-board overlay sits over the arrivals
   board text (`before-00-how-it-works-1440.png`).
3. **"Executive sedan"** is the booking card subline for Business; live Business is the 7-seat V-Class.

## Section by section

| # | Section | Verdict | Picture |
|---|---|---|---|
| 1 | Hero + booking card | Keep. Replace the Trustpilot row with four facts until real reviews exist | `home-hero-*` |
| 2 | How it works | Keep. Fix the overlay; move destinations out of this section | before only |
| 3 | Vehicle classes | **New.** Live seats/bags/photos from `/api/quote` | `classes-a-*` (rec.), `classes-b-*` |
| 4 | Where we drive → Popular routes | **Redo.** The two live fixed routes as cards, other routes as rows that fill the booking card | `home-routes-*` |
| 5 | At the airport | **New.** Flight tracked, name board, 60 min free, phone/WhatsApp; meeting point per airport needs owner text | `home-meet-*` |
| 6 | Services | **Redo.** "Professional drivers" and "Any route" are not services → Airport, City to city, Mountain and ski, Business travel | `home-services-*` |
| 7 | Reviews | **Redo.** Hidden under 3 real reviews; score from real rows only; source link per review | `home-reviews-*` |
| 8 | Why book with us (trust) | **New.** UID, Stripe + TWINT, price in writing, 24 h free cancel; licence/insurance needs owner text | `home-trust-*` |
| 9 | Business travel | **New.** Contact strip, no invoicing; "receipt by email" needs owner confirmation | `home-business-*` |
| 10 | FAQ | **Redo.** Grouped in four tabs; airport questions added | `home-faq-*` |
| 11 | Closing call to action | **New.** Charcoal band before the footer | `home-cta-*` |
| 12 | Footer | Keep. Services links all go to `/#book` | before only |

Proposed order on the page: Hero → How it works → Classes → Popular routes → At the airport →
Services → Reviews → Why book with us → Business travel → FAQ → Closing CTA → Footer.

Facts used in the pictures: live `/api/quote` idle board (classes, fixed routes), How it works copy
(60 minutes), `/cancellation` (24 hours), `/imprint` (Dietikon ZH, CHE-296.035.710),
`apps/web/wrangler.jsonc` (`STRIPE_CHECKOUT_TWINT: on`), footer contacts. No price is shown anywhere.
French is not in the pictures; it ships with the build.
