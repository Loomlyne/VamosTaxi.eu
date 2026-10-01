# Plan: Van luxury takes up to 12 travellers (vamostaxi.site home booking form, /checkout, dashboard New trip)

Owner decision 2026-10-01 16:03 +04: "Raise to 12". Job session, branch `feat/van-luxury-12` from
`origin/main` `d9074011`, folder `.claude/worktrees/van-luxury-12`. No migration, no setting, no price.

## What the live data already says (read-only, 2026-10-01 23:45 +04)

- `vehicle_classes` `van-luxury`: 12 passengers, 9 cases, active. Economy (`saden`) 3/3, Business
  (`mercedes-benz-v-class`) 7/6.
- Price book row 18 (live): `distance_rates.max_pax` 12 for Van luxury. The quote takes the lower of the two.
- Database checks allow 1 to 16 travellers on a leg (`booking_legs_pax_check`).
- `GET https://vamostaxi.site/api/quote` already returns each class with its seats: Van luxury 12.

So the quote already knows 12. Three hard-coded 8s stop a customer before the quote is asked.

## Where 8 blocks today

1. Home booking form (laptop box and phone sheet): `app/home/home.dc.html` (5 places) and
   `app/home/BookingSheet.dc.html` (2 places). The + button stops at 8.
2. `/checkout` and paying: `apps/web/lib/checkout/trip-url.ts` `PAX_MAX = 8`. A link with `pax=10` is
   refused, and `POST /api/checkout/intent` refuses 10 travellers ("travellers").
3. Dashboard New trip: `app/ops/OpsNewTrip.dc.html` quietly turns 10 into 8 before the quote.

## Change (the cap comes from the class rows)

| File | Change |
|---|---|
| `app/home/home.dc.html` | On load, read the class list from `GET /api/quote` (one request, shared with How it works). Party maximum = the most seats among the classes a customer can book now (today 12, from Van luxury). Replace the five 8s with it. Pass it to the phone sheet. Until the list arrives, or if it fails, the limit is the database's 16; the quote then shows which classes fit. |
| `app/home/BookingSheet.dc.html` | New prop `paxMax` (declared in `data-props`); its + button stops there instead of 8. |
| `app/home/HowItWorks.dc.html` | Uses the same one `GET /api/quote` answer as the form, so home still makes one request, not two. No visible change. |
| `apps/web/lib/checkout/trip-url.ts` | `PAX_MAX` 8 → 16, the database limit, same as the quote API already accepts. Which class fits stays with the class row: the quote marks Economy and Business "Not available for 10 passengers", and the payment step already refuses a class that does not fit (`lib/quote/intent.ts:231`). |
| `apps/web/lib/checkout/party-cap.ts` (new) | `partyCap(classes)`: the most seats among the classes on the current quote that are bookable apart from party size. |
| `apps/web/app/[locale]/checkout/CheckoutPage.tsx`, `sections/TripEditor.tsx` | The Edit trip counter on /checkout stops at `partyCap` of the quote shown (12 today), not 8. |
| `app/ops/OpsNewTrip.dc.html` | Remove the silent 8. The number you type goes to the quote; the class list then shows only classes that fit (10 → Van luxury only). |
| Tests | `trip-url.test.ts`: 10 and 12 accepted, 17 refused (was: 9 refused). New `party-cap.test.ts`. New mock test: no traveller 8 left in the three mocks; home reads the board and passes `paxMax`. New pricing test: 10 travellers on these class rows → only Van luxury fits; 13 → none. |

No new visible words, so no new keys in the translation files. The stepper shows "10", "11", "12" with
the existing labels in all four languages.

## Left alone, on purpose

- `app/pages/manage-booking.dc.html` and `app/pages/booking-detail.dc.html`: their travellers counters
  also stop at 8, but they save nothing today and both files belong to the P6 job. Told to the controller
  for after P6.
- `app/pages/about.dc.html`: still says "Van, 8 passengers, 8 medium cases". The B7 content branch
  (`claude/project-thread-6r5gz9`) changes this file. Told to the controller for B7.
- React copies of the home form (`components/home/BookingCard.tsx`, `BookingDraftFields.tsx`,
  `forms/Counter.tsx` default): no customer sees them.
- Luggage stays as today (home stops at 16; the quote checks each class's cases). Not asked.
- Local seed (`van` 8/8) and emails: no traveller cap there; unchanged.

## Checks before the hand-over

1. Chromium against the local Worker build (`node scripts/sync-dc-mock-to-public.mjs` first), own
   port-shifted local database: home + goes to 12 and stops; 10 travellers → /checkout shows Van luxury
   bookable, Economy and Business "Not available for 10 passengers"; Edit trip stops at 12; dashboard New trip with 10
   offers Van luxury only.
2. 1440, 1024, 768, 390; phone and tablet keep the desktop field order; Arabic right to left; "12" fits
   the stepper at 390, nothing scrolls sideways; de, fr, ar show no English.
3. Gates: typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env,
   check:db-fences, db:seed:check, test:unit, build. Merge `origin/main`, push the branch, write
   `HANDOVER.md` here, message the controller, stop.

## Owner UAT (after the ship)

1. vamostaxi.site home: press + on Travellers until it stops. Expected: it stops at 12.
2. Book Zurich Airport → Zurich for 10 travellers, choose Van luxury, pay with 4242 4242 4242 4242.
   Expected: the confirmation page; Economy and Business read "Not available for 10 passengers".
3. Dashboard → New trip, 10 travellers. Expected: only Van luxury in the class list.
4. Home on a phone, Deutsch and العربية. Expected: the stepper reads 12 at most, nothing overflows.

Signed by the owner in this session, 2026-10-01 23:59 +0400, answer "Sign, build it".
