# Resend voucher — live Ops

English numbered clicks on https://dashboard.vamostaxi.site. No screenshots. The live button is **Resend voucher** (mail icon). It re-sends the confirmation voucher through Resend. Do not rebuild mail.

Support if the customer still has nothing: **info@vamostaxi.site** and **+41 79 626 70 82**.

**Resend voucher** is on the booking detail bar. It appears when the trip is paid and not **Cancelled** / **Refunded**.

## Must nots

1. Do not invent a chauffeur name or a sample reference.
2. Do not paste card data. The voucher is trip confirmation, not a card receipt rewrite.
3. Unpaid trips do not get this button. For those, the unpaid alert offers **Send pay link** — that is a different product. Do not use it as a voucher resend.

## 1. Open the paid booking

1. Open https://dashboard.vamostaxi.site
2. Sign in (heading **Dispatch sign in**).
3. Left rail: **Bookings**.
4. Expected screen text: the bookings table.
5. Click the paid booking the customer asked about. Expected: booking detail with that booking’s own reference as the heading.
6. Top bar shows **Resend voucher**. If it is missing, the trip is unpaid or already cancelled/refunded — stop.

## 2. Resend

1. Click **Resend voucher**.
2. Expected toast starting **Voucher re-sent to** plus the contact email already on that booking.
3. Open **History** if it is collapsed. Expected a row titled **Voucher sent**. Source text on history can read **Resend**.
4. If it fails, a toast starts **Could not resend voucher**. Stop. Mail the customer from **info@vamostaxi.site** or call **+41 79 626 70 82**. Do not invent a second send path.

## Done when

- Toast **Voucher re-sent to** the email on that booking.
- History shows **Voucher sent**.
