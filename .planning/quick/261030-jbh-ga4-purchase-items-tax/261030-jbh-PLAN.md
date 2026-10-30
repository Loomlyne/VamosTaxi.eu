# Quick 261030-jbh: GA4 purchase with tax and items

Owner pasted the GA4 `purchase` snippet (2026-10-30). The event already fires from `sendBookingConversion` with `transaction_id`, `value`, `currency`.

- Add `tax` from the receipt's VAT row, only on a real charge.
- Add `items`: one item, the booked class, at the full charged price, quantity 1.
- No `shipping`: a transfer has none. Currency stays CHF (the charge is always CHF).
- Google Ads conversion and Meta Purchase unchanged.

Files: `apps/web/lib/tracking/booking-conversion.ts`, its test, `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx`.
