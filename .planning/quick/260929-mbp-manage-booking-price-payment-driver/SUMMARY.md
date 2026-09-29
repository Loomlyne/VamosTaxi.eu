# Quick 260929-mbp: summary

The manage-booking page opened from the confirmation e-mail now shows the price lines, how it was paid, the extras and the driver.

## Page
The e-mail button links `/{locale}/manage-booking?token=...` (`notify.ts:218`). It is the DC mock `app/pages/manage-booking.dc.html`, loaded through `app/vamos-manage-ticket.js` and `GET /api/manage/booking`.

## What changed
- Migration `20260930190000_manage_booking_money_driver.sql`: `booking_payments.payment_method_type` (write-once, format-checked), `checkout_payment_method_record` (vamos_system), revoked helpers `manage_money_for` / `manage_driver_for`, wrappers `manage_booking_extras(token_hash)` (vamos_guest) and `customer_booking_extras(reference)` (authenticated, JWT e-mail owns the booking). Whitelist trigger recreated with the new column.
- Payment method: read from the PaymentIntent's latest charge after a successful settle (`paymentMethodTypeFor`), best-effort. **Old payments have no method: the page says "Paid online"** (TWINT was offered, so "card" would be a guess). New payments show Card, TWINT, Apple Pay, Google Pay or Link.
- `/api/manage/booking` returns `money` and `driver`; the old broad chauffeur/vehicle join (which exposed the full name) is gone. New `GET /api/account/bookings/details?ref=` for the signed-in path.
- Page: "What you paid" lists fare (class name), each extra by the owner's name in the page language, voucher (negative), VAT, total; "Paid with"; "Charged as EUR 11.00" when paid in another currency. Lines appear only when they add up to `charged_rappen`, else the total alone. Driver block: first name, tap-to-call phone, model and plate, or "No driver assigned yet. We will show your driver here once assigned."
- Strings in en/de/fr/ar (7 new dict entries).

## Commits
See `git log fix/26.3-manage-booking`: plan, migration+pgTAP, API and settle, page, types, docs.

## Checks
| Check | Result |
|---|---|
| From-zero replay (`db reset`, port-shifted stack vamos-taxi-mbp, 573xx) | exit 0 |
| Full pgTAP | 74 files / 1692 tests PASS (32 new) |
| pnpm test:unit | pass (web 2280 tests, db 9) |
| typecheck, lint, lint:css | pass |
| check:numbers, check:legal-claims, check:public-env, check:db-fences | pass |
| i18n:check, db:seed:check | pass |
| types | regenerated from the local stack; diff is only the new column and four functions, committed |
| `pnpm --filter web build` (with lint) | pass |
| Playwright new spec (10) + manage lookup spec (8), `--workers=1` | 18 passed |

## Not verified
- No real Stripe payment: the method lookup is unit-tested with a mocked Stripe client, not against a live PaymentIntent.
- The signed-in account path is proven in pgTAP; the browser spec covers the e-mail-link path only.
- Screenshots reviewed at 1440 and 390 (de); 1024 and 768 checked for sideways scroll only.

## Deviations
None from the plan. Note: `Alert`/`data-tok` tinted-yellow CSS already in the page was left alone (not part of this task).
