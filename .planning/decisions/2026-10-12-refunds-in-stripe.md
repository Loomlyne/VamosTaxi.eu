# Refunds are made in Stripe, not on the site (decided 2026-10-12)

**Decision (owner, question form, 2026-10-12 ~18:00 +04):** money goes back to customers from the Stripe Dashboard. The site stops sending refunds itself, except the duplicate-charge refund.

1. **Dashboard REFUND button stays, but opens Stripe.** On booking detail, REFUND opens a new tab on that exact booking's payment in the Stripe Dashboard, where he refunds or checks anything. The site no longer sends a refund from this button. The refund-decision box goes. The site keeps recording what Stripe did, via the existing webhook, so the booking and the customer's account show the refunded amount.
2. **Duplicate charge stays automatic.** When the same booking is paid twice, the second charge is still refunded at once, and he gets an email.
3. **Customer cancel text: a policy line, no amount, no Stripe.** A paid trip that is cancelled shows that the refund follows the cancellation policy. No calculated amount and no mention of Stripe. The exact wording is drafted for his signature in en, de, fr and ar.
4. **The single-leg refund branch is parked.** It is not shipped: tag `archive/fix-single-leg-refund-a46ac2ca` on GitHub (clean clone: gate, web build and OpenNext build all exit 0, migration md5 `7d91b79b`). Migration number `20261013100000` is freed. It supersedes `2026-10-11-single-leg-refund-own-subtotal.md` for anything about sending money.

**Why:** he wants money management in one place, Stripe, not split between the site and Stripe.

**Open, for the phase:**
- Which Stripe page the button opens: PaymentIntent, Charge or Customer; test or live mode path. With several payments on one booking (extras, class change), there are one or more targets.
- What happens to the stored "owed" amount and the ops refund queue.
- Customer emails that state a refund amount today.

**Signed 2026-10-12 ~19:05 (+04), question form:** sheets 1–3 (branch `phase-31-refunds-in-stripe`, `25b65671`) as drawn; the customer wording as written in en/de/fr/ar (cancel sheet: "This trip will be cancelled. Any refund follows the cancellation policy."; Refund row: "Refund follows the cancellation policy"; cancellation email line); Q1 A: when he refunds in Stripe, the customer gets a Vamos email in their language with the amount Stripe sent back (wording still to sign); Q2 A: the dashboard shows "Refund to check" until Stripe records a refund or the pickup time has passed, with no NO REFUND button.
