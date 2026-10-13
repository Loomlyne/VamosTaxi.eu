# Signed refund wording, Phase 31 refunds in Stripe (2026-10-12)

Signed 2026-10-12 ~19:05 (+04), owner, question form via the controller; source 31-UI-SPEC.md Copywriting Contract
(Phase 31 S-02). Used verbatim. The site never sends a refund itself any more (D-01): a customer line states the
policy, never an amount, never the word Stripe (D-04). Pin tests read the rows below byte for byte:
`apps/web/lib/legal/refund-texts-20-10.test.ts` and `packages/emails/src/CancellationEmail.test.tsx`.

Row format: each section is a "### Wn — where it lives" heading followed by exactly four rows `| en | … |`,
`| de | … |`, `| fr | … |`, `| ar | … |`. Swiss German, "ss" never the sharp s.

Not retired: "Our team decides the refund and tells you by email." stays on `app/pages/cancellation.dc.html` (the
signed policy page, T1/T3 of `2026-09-30-refunds-by-hand.md`); it is the policy the new lines point to.

## Customer

### W1 — cancel sheet line, both windows (manage-booking and booking-detail cancel sheet, dict, Next copy)

| Language | Text |
|---|---|
| en | This trip will be cancelled. Any refund follows the cancellation policy. |
| de | Diese Fahrt wird storniert. Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen. |
| fr | Ce trajet sera annulé. Tout remboursement suit la politique d’annulation. |
| ar | ستُلغى هذه الرحلة. يخضع أي استرداد لسياسة الإلغاء. |

### W2 — account Refund row value (`refundLine`, `app/vamos-manage-ticket.js`, dict)

| Language | Text |
|---|---|
| en | Refund follows the cancellation policy |
| de | Rückerstattung gemäss Stornierungsbedingungen |
| fr | Remboursement selon la politique d’annulation |
| ar | الاسترداد وفق سياسة الإلغاء |

### W3 — dead-card paragraph and cancellation e-mail refund line (the same text; `packages/emails/src/messages/*.json` `cancellation.refundPolicy`)

| Language | Text |
|---|---|
| en | Any refund follows the cancellation policy and goes back to the payment method you used. Your bank may take a few days to show it. |
| de | Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen und geht an das Zahlungsmittel zurück, mit dem Sie bezahlt haben. Ihre Bank braucht vielleicht ein paar Tage, bis sie sichtbar ist. |
| fr | Tout remboursement suit la politique d’annulation et revient sur le moyen de paiement utilisé. Votre banque peut mettre quelques jours à l’afficher. |
| ar | يخضع أي استرداد لسياسة الإلغاء ويعود إلى وسيلة الدفع التي استخدمتها. قد يحتاج مصرفك بضعة أيام لإظهاره. |

## O-1

Answered: A, signed 2026-10-13 ~16:20 (+04), owner, question form via the controller (Phase 31 S-07). One line
under "Cancel this transfer" for both windows, replacing the two lines that still spoke of a refund amount. Plan
31-12 adds it here as W6 and applies it to the pages.

## Owner answers, 2026-10-13 ~16:20 (+04)

- S-08: KEEP both extra customer lines: the "See what comes back" button and "— keep it, because that is what your
  refund is calculated from." They are not retired by this phase.
- S-09: the internal ops mails that say Stripe (W4, W5 below) are ACCEPTED. They replace the action sentence of the
  signed 2026-10-02 T1 wording.
