# Refunds — Refund in Stripe

English, internal. "You" is the owner. Refunds are made in Stripe only; the dashboard shows what Stripe recorded and
never sends a refund itself. Do not invent amounts: the amount is what you choose in Stripe and what Stripe reports.

Support if the customer needs a person: **info@vamostaxi.site** and **+41 79 626 70 82**.

## Must nots

1. Never refund outside Stripe (no bank transfer, no cash, no second card charge reversed by hand). The dashboard,
   the customer mail and the nightly check all read Stripe's refund; money sent any other way is invisible to them.
2. Never edit refund rows in the database (`booking_refunds`, `bookings.refund_status`, `bookings.refunded_rappen`).
   They are written only from Stripe's webhook. A hand edit breaks the customer mail and the nightly check.
3. Never type an amount into the dashboard to "record" a refund. There is no such control, by design.

## 1. Refund a booking

1. Open https://dashboard.vamostaxi.site and sign in.
2. Left rail: **Bookings**. Click the booking's row. Expected: the booking detail.
3. Top bar: **Actions** > **Refund in Stripe**. The item is greyed out for a moment while the page reads the
   booking's Stripe payments; it turns active once they are in.
   - **One payment:** a new browser tab opens on that payment in Stripe.
   - **Several payments** (for example the trip and a later extra fare): the page shows **Which payment?** with one
     row per payment (trip or extra fare, date, amount) and an **OPEN IN STRIPE** button on each. Each opens in a new
     tab. The line under the list says Stripe opens in a new tab and this page shows the refund once Stripe records it.
   - **No payment to open:** the page shows **This booking has no Stripe payment to open.** The booking has no card
     payment in Stripe (nothing to refund there). Stop; there is no next step on the page.
4. In the Stripe tab: **Refund**, choose the amount (full or partial) the cancellation policy gives, confirm.
5. Come back to the booking. Once Stripe records the refund (usually seconds), the page shows it: **Refunded**, and the
   refund in **History**. Reload if the page was open the whole time.

## 2. What each dashboard note means

| Note on the booking | What it means | What you do |
|---|---|---|
| **Refund to check** | A paid booking was cancelled and no refund is recorded yet. It goes away by itself once Stripe records a refund, or once the pickup time has passed. | Nothing to press. If the policy gives money back, refund it in Stripe (section 1). If it gives nothing back, leave it; it clears after pickup. |
| **Refunded** | Stripe recorded a refund on this booking. | Nothing. |
| **Refund failed** | Stripe reported that a refund could not be sent (for example the card was closed). | Open the payment in Stripe (the note's **OPEN IN STRIPE** button, or Actions > **Refund in Stripe**) and try again there or contact the customer. |
| **This booking has no Stripe payment to open.** | No card payment in Stripe belongs to this booking. | Nothing to refund in Stripe. |

## 3. What happens on its own

- **Second charge on one booking:** if a customer was charged twice for the same booking, the extra charge is refunded
  automatically and you get a mail. Nothing to do.
- **Customer mail:** when you refund in Stripe, the customer gets a Vamos mail in their language with the amount
  Stripe sent back. One mail per Stripe refund, also for a partial one.
- **Nightly check (03:00 UTC):** it compares Stripe's refunds of the last 48 hours with the bookings and mails
  info@vamostaxi.site only when one does not match. No mail means everything matched. If a mail names a refund the
  dashboard does not show, Stripe's webhook delivery probably failed: in Stripe, **Developers** > **Webhooks** > the
  Vamos endpoint > the failed event > **Resend**. The booking updates once the event arrives.

## Done when

- The booking shows **Refunded**, and **Refund to check** is gone.
- You did not type an amount anywhere outside Stripe.
