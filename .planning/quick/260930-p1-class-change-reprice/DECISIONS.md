# P1 — class change on a paid trip: the owner's decisions (question form, 2026-09-30)

| # | Question | His answer |
|---|---|---|
| D0 | Booking Edit, Vehicle class field (hand-over 2 round) | "Work as attended make the change work and fix the problem": a class change on a paid trip is saved and re-priced. |
| D1 | A dearer class: when does the booking change? | "After she paid the difference (Recommended)". The booking keeps its class until the difference is paid. |
| D2 | How does the customer pay the difference? | "E-mail her a pay link (Recommended)". The site e-mails a link to the Stripe page for the difference, in the customer's language. Staff can still copy the link or take the card by phone. New e-mail wording: drafted in four languages for his approval. |
| D3 | Which prices for the new class? | **"Today's price book"**. The fare of the new class is worked out with the price book that is live on the day of the change. |
| D4 | Difference not paid | "24 hours, then stays Economy (Recommended)". The request ends unpaid; the booking is untouched; staff can start again. |
| D5 | Extras and coupon on the booking | "Only the class is re-priced (Recommended)". Extras stay at the amount paid; the coupon applies as it did. |
| D6 | Driver and vehicle already assigned | "Unassign and tell the driver (Recommended)". The trip goes back to unassigned, the driver gets the existing "trip taken off" e-mail. |
| D7 | What the customer receives after the change | "The confirmation again, updated (Recommended)". |
| D8 | Until when | "Until the pickup time (Recommended)". The Settings modification deadline keeps applying to customers only. |

Already decided elsewhere, not asked again:

- A cheaper class means money back. Refunds are made by hand
  (`.planning/decisions/2026-09-30-refunds-by-hand.md`, decisions 1, 3, 4): the booking shows
  "Refund due" and the admin presses Refund. Nothing goes to Stripe without his click.
- Classes are Economy, Business, Van luxury. V1 is one-way. The charge is always CHF.
