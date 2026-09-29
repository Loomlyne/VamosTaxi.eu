# Quick 260929-mbp: manage-booking shows price, payment method, extras and driver

## Objective
The page the confirmation e-mail's "manage booking" button opens shows what was paid, how, the extras, and the driver. Owner comment 3 after the 26.3 ship.

## Which page
`packages/emails/src/ConfirmationEmail.tsx` links `booking.manageUrl`, built in `apps/web/lib/checkout/notify.ts:218` as `${PUBLIC_ORIGIN}/${locale}/manage-booking?token=<raw>`. That path is served from the Design Component mock `app/pages/manage-booking.dc.html` (mapped in `apps/web/lib/dc-mock-urls.ts`), which loads the booking through `app/vamos-manage-ticket.js` -> `GET /api/manage/booking` (token) or, signed in, `GET /api/account/bookings`. So this is a DC page: i18n is checked with `VamosLocale.coverage`, not `openInLocale`.

## Files
- packages/db/supabase/migrations/20260930190000_manage_booking_money_driver.sql (new; no live migration edited)
- packages/db/supabase/tests/manage_booking_money_driver.test.sql
- packages/db/database.types.ts (regenerated)
- apps/web/app/api/manage/booking/route.ts (+ new account route `apps/web/app/api/account/bookings/details/route.ts`)
- apps/web/lib/checkout/manage-money.ts (+ vitest): lines -> rows, method label key, driver shape
- apps/web/lib/checkout/stripe.ts, settle.ts: record the payment method type after a successful settle
- app/pages/manage-booking.dc.html, app/vamos-manage-ticket.js, app/vamos-i18n-dict.js (+ synced copies as the repo does)
- Playwright spec for the page

## Design
- New column `booking_payments.payment_method_type` (text, `^[a-z0-9_]{1,40}$`, write-once, terminal-row exempt like `stripe_fee_rappen`). Stripe type is read from the PaymentIntent's latest charge after settle (`card`, `twint`, wallets as `apple_pay` / `google_pay`, `link`, else the Stripe type) and written by `checkout_payment_method_record` (vamos_system). Old payments have null: the page says "Paid online" (TWINT was offered, so "card" would be a guess). No backfill.
- Money read: definer `manage_booking_extras(token_hash)` (vamos_guest) and `customer_booking_extras(reference)` (authenticated; ownership = the JWT e-mail owns the booking, the same rule as the account list). Both call revoked helpers keyed by booking id. Money = saved snapshot lines (kind, code, four locale names, VAT bps, amount), vehicle class name, charged_rappen, method type, presentment amount and currency. Lines are shown only when they sum to `charged_rappen`; otherwise the total alone.
- Driver read: same wrappers return `driver` = `{first_name, phone, vehicle_model, plate}` and nothing else, from leg 1's assigned chauffeur and vehicle. Null when either is unassigned. No table grants to chauffeurs or vehicles change.
- Labels: names[locale] -> names.en -> humanised code, through `extra-label.ts`. Amounts through `VamosLocale.money`; never a hard-coded price. The old `asSystem` chauffeur/vehicle/plate join in `/api/manage/booking` is removed (it leaked the surname).

## Acceptance
- Valid token: money block (total paid, fare with class name, each extra by name, voucher negative, VAT, method, EUR presentment amount when paid in EUR); driver block.
- Unassigned: "No driver assigned yet. We will show your driver here once assigned." Assigned: first name, tap-to-call `tel:` phone, model and plate. No photo, surname or other data.
- Lines that do not add up: total only.
- pgTAP: valid token returns fields; other booking or bad token returns nothing; unassigned null; function result keys exactly the four driver keys; grants narrow (no anon/authenticated on helpers or token function; chauffeurs and vehicles ungranted).
- de/fr/ar strings present (`VamosLocale.coverage` empty), RTL logical CSS, 1440/1024/768/390 without sideways scroll, 44px targets, no glow, no tinted yellow.

## Threat model
| Threat | Disposition |
|---|---|
| Token holder reads another booking's money or driver | mitigate: wrappers resolve the booking only from the token hash (unexpired, unrevoked) or the caller's JWT e-mail; miss returns null, no error detail |
| Driver PII beyond the four fields (surname, photo, e-mail, licence) | mitigate: definer projects `split_part(full_name,' ',1)`, phone, model, plate only; pgTAP asserts the key set; old broad join removed |
| Widened grants on chauffeurs / vehicles | mitigate: none added; helpers revoked from every role; pgTAP asserts |
| Payment method write by a client | mitigate: write-once column, only `vamos_system` definer, format check |
| Invented price or false total | mitigate: amounts only from the saved snapshot; sum check against charged_rappen; else total alone |
| Stripe lookup failing breaks settlement | mitigate: method record is best-effort after the settle commits, errors swallowed and logged |
