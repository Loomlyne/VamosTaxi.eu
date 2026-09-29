# Quick 260929-nts: dashboard New trip Save

## Objective
Dashboard "New trip" Save creates the booking again. Since the 26.3 ship every phone booking is refused ("Save failed"). Live hotfix, owner decisions 2026-09-29.

## Root cause (confirmed by checker)
1. `app/ops/OpsNewTrip.dc.html` posts `extras: this.extras()` (old three-code object) and no `trip` to `/api/checkout/intent`. The strict schema (`apps/web/lib/checkout/intent-schema.ts` webIntentObject) refuses both; `route.ts` returns `invalid_request`; the form shows "Save failed".
2. Same body sends `display_currency: window.VamosLocale.cur` (a function, dropped by JSON) so the required field is also missing.
3. Class options are hard-coded slugs (`saden`, `mercedes-benz-v-class`, `van-luxury`) and the quote is asked for `preferred_class: 'saden'`.

## Fix (only the New trip parts of the 26.4-08 reference plan)
- Save body mirrors `buildIntentBody` (CheckoutForm): `quote_id, lock, vehicle_class, extra_codes, coupon:null, flight_no, contact, locale, display_currency, trip{from,fid,to,tid,gs,when,pax,bags,flight}, idempotency_key`. No `extras`. Staff session handling unchanged.
- Extras: `GET /api/checkout/extras` (live price book, names by locale, en fallback), DS Checkbox rows, all unticked, amount from the server (`fromChf`). No "Extra stop", no hard-coded extras. States: loading, empty, error.
- Total shown = `POST /api/checkout/price` `charged_rappen` for lock + class + ticked codes (server priced, same as customer).
- Flight: required when the pickup is an airport (`/api/geo/retrieve` `place.isAirport`), optional otherwise. Flight change never re-quotes on typing. On Save, if the flight key differs from the one in the lock, re-sign through `POST /api/quote/reprice` (`legs:[{leg_seq:1, flight_no}]`), re-price, and if the total differs from the total staff saw, refuse Save, show the new total and require another Save. D-08 (airport fee from pickup only) is NOT touched.
- Classes: options come from `classes[]` of the quote response (eligible only; `name` else slug, as customers see it). Default: the first eligible class.
- After Save: booking pending, page goes to `/bookings/<ref>`, existing Take card / Send pay link work (unchanged).
- Strings in en/de/fr/ar in `app/vamos-i18n-dict.js`.

## Files
- app/ops/OpsNewTrip.dc.html
- app/vamos-i18n-dict.js
- apps/web/lib/ops/new-trip-intent.test.ts (new), ops-dc-finalize.test.ts (class pin), phone-booking.test.ts (if a pin names a removed toggle)
- apps/web/tests/integration/ops-new-trip-260929.spec.ts (new Playwright spec)

## Acceptance
- The exact body the form builds passes `checkoutIntentSchema` (vitest runs the form's body builder against the schema).
- Playwright: fill New trip (fixture quote with Economy/Business classes + a child-seat extra), tick the extra, Save: intent body valid, redirect to `/bookings/<ref>`. Flight change on Save keeps the total; a differing total refuses Save.
- de and ar at 390 and 768: no sideways scroll, ar is rtl, no untranslated strings.
- No glow, no tinted yellow, controls 44 px.

## Threat model
| Threat | Disposition |
|---|---|
| Staff client sets a price | mitigate: body carries codes and class slug only; server prices with checkoutCharge; total shown comes from `/api/checkout/price` |
| Booking at a total staff did not see after a flight re-sign | mitigate: Save refuses when the re-priced total differs; needs a second Save |
| Unknown extra code | mitigate: codes come only from the live catalog; schema and charge refuse unknown codes |
| XSS through extra or class names from the database | mitigate: text bindings only, no innerHTML |
| New endpoint or auth path | none: same endpoints and session as before |

## Blockers
No SQL, no deploy, no live writes, no push.
