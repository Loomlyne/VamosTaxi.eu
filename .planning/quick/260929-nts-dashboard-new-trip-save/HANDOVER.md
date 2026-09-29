# Hand-over — dashboard New trip Save (quick task 260929-nts)

**Branch:** `fix/26.3-new-trip-save` in `/Users/koss/Developer/vamos-wt/fix-26.3-newtrip`, cut from `fix/26.3-manage-booking` c81fda96. Final commit: the commit adding this file (`git log -1`). Folder clean. No push, no PR, no deploy, no live writes, no SQL.

## Root cause
New trip posted the old three-code `extras` object and no `trip` to /api/checkout/intent; the strict schema refused it (invalid_request, "Save failed"). It also passed `VamosLocale.cur` (a function) as `display_currency`, and hard-coded class slugs.

## Fix
`app/ops/OpsNewTrip.dc.html` sends the customer checkout body shape. Extras are the live price book (checkbox rows, unticked, server-priced total). Classes come from the quote answer. Flight is required at airport pickups; a flight typed after the quote re-signs the lock via /api/quote/reprice and Save is refused if the total would move. Strings in en/de/fr/ar. Pricing calculation untouched (D-08 stays in 26.4 plan 01).

## Checks
vitest lib/ops 653 pass; test:unit 2288 pass; typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, db:seed:check, `pnpm --filter web build` all pass. Playwright new spec plus ops-26-3-widths and ops-detail-extras, 64 pass at 1440/1024/768/390 (`--workers=1`). Details in SUMMARY.md.

## Not verified
- No real staff session or real Stripe: the specs mock every API, so the intent's own price_changed and lock checks against real data ran only in the intent's existing tests.
- Take card / Send pay link on the new booking: unchanged code, not re-run here.

## Owner UAT (after deploy)
1. Sign in to the dashboard, open Bookings, New trip.
2. Type a Zurich Airport pickup and pick it from the list, pick a drop-off, set a date and time, enter name, email, mobile. Expected: Vehicle class lists Economy, Business, Van luxury as on the site, and a fare appears.
3. Tick Child seat. Expected: the fare goes up by the price-book amount; nothing else is ticked by default; there is no Extra stop.
4. Leave Flight number empty and press Save trip. Expected: "Enter the flight number", nothing saved.
5. Type a flight number (for example LX 318) and press Save trip. Expected: the booking opens as awaiting payment. If the total changed you see "Price changed" with the new total; press Save trip again.
6. On that booking use Take card or Send pay link. Expected: both work as before.
7. Repeat step 2 with a non-airport pickup. Expected: Flight number is optional and Save works without it.
