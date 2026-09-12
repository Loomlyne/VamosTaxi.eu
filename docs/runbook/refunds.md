# Refunds — live Ops

English numbered clicks on https://dashboard.vamostaxi.site. No screenshots. Do not invent amounts. Do not rebuild the Refund product.

Support if the customer needs a person: **info@vamostaxi.site** and **+41 79 626 70 82**.

**Refund** is on the booking detail bar. It appears only when that booking’s status is **Cancelled**. Paid trips that are still live do not show it.

## Must nots

1. Do not invent a fare or a refund amount. Use the fare already on that booking.
2. Do not type a sample reference. Open the real cancelled booking on the board.
3. Do not click **Refund** on live Zurich from a copy-restore sitting.

## 1. Open the cancelled booking

1. Open https://dashboard.vamostaxi.site
2. Sign in (heading **Dispatch sign in**).
3. Left rail: **Bookings**.
4. Expected screen text: the bookings table, filters including **All** and **Cancelled**.
5. Click **Cancelled** if you need to find the trip.
6. Click the row. Expected: booking detail. Status badge **Cancelled**. Alert title **Refund due**. Alert body starts **Cancelled inside the free window.**
7. Top bar shows **Refund** (primary). If **Refund** is missing, this booking is not cancelled — stop. Do not invent a cancel just to practise.

## 2. Issue the refund

1. Click **Refund**.
2. Expected: the page reloads that booking. Status badge **Refunded**. Alert title **Refund issued**. Alert body: **The customer has been emailed that the refund was issued to their bank account.**
3. Open **History** if it is collapsed. Expected a row titled **Refund issued**.
4. If it fails, a toast starts **Could not refund** plus this booking’s own reference. Stop. Call support at the contacts above. Do not retry blindly.

## 3. Related screens (do not mix them up)

- After a customer edit that lowers the fare, a toast may say **Use Refund for the difference.** That still means this same **Refund** button on a cancelled or refund-due booking — not a second product.
- **Refunds to issue** on the dashboard money card is a count, not the click path. Issue from the booking.

## Done when

- That booking shows **Refunded** and **Refund issued**.
- You did not type an amount.
