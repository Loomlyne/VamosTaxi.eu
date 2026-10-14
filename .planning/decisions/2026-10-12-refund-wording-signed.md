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

### W6 — Cancel this transfer sub-line (both pages, both windows; `cancelSub` in booking-detail and manage-booking, dict)

Replaces "See what comes back at this notice before you decide." and "See the refund you are due before anything is
confirmed." The "See what comes back" button and "— keep it, because that is what your refund is calculated from."
stay (S-08).

| Language | Text |
|---|---|
| en | Read the cancellation policy before anything is confirmed. |
| de | Lesen Sie die Stornierungsbedingungen, bevor etwas bestätigt wird. |
| fr | Consultez la politique d’annulation avant toute confirmation. |
| ar | اطّلع على سياسة الإلغاء قبل تأكيد أي شيء. |

## Owner answers, 2026-10-13 ~16:20 (+04)

- S-08: KEEP both extra customer lines: the "See what comes back" button and "— keep it, because that is what your
  refund is calculated from." They are not retired by this phase.
- S-09: the internal ops mails that say Stripe (W4, W5 below) are ACCEPTED. They replace the action sentence of the
  signed 2026-10-02 T1 wording.

## Internal (ops must-fix mails)

W4 and W5 below, en/de/fr/ar: SIGNED as written, owner, question form 2026-10-13 ~23:35 (+04), `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 3 (origin/main aa85e5ec). Used verbatim.

### W4 — `opsMustFix.differenceNotAppliedBody` (`packages/emails/src/messages/*.json`)

Internal (to info@, not a customer surface); first sentence signed 2026-10-02, action sentence from the 2026-10-12 signed dashboard strings (D-08). Accepted by the owner 2026-10-13 ~16:20 (+04), S-09.

| Language | Text |
|---|---|
| en | The customer paid the difference for this booking, but the change was not applied: the trip was cancelled, a newer change replaced it, or it no longer fits. The payment is recorded. Refund it in Stripe, or make the change again. |
| de | Der Kunde hat die Differenz für diese Buchung bezahlt, aber die Änderung wurde nicht übernommen: Die Fahrt wurde storniert, eine neuere Änderung hat sie ersetzt, oder sie passt nicht mehr. Die Zahlung ist verbucht. Erstatten Sie sie in Stripe oder nehmen Sie die Änderung erneut vor. |
| fr | Le client a payé la différence pour cette réservation, mais la modification n’a pas été appliquée : le trajet a été annulé, une modification plus récente l’a remplacée, ou elle ne convient plus. Le paiement est enregistré. Remboursez-le dans Stripe ou refaites la modification. |
| ar | دفع العميل الفرق لهذا الحجز، لكن التغيير لم يُطبَّق: أُلغيت الرحلة، أو حلّ محله تغيير أحدث، أو لم يعد مناسبًا. الدفعة مسجّلة. نفّذ الاسترداد في Stripe، أو أجرِ التغيير مرة أخرى. |

### W5 — `opsMustFix.refundFailedBody` (`packages/emails/src/messages/*.json`)

Internal (to info@, not a customer surface); first sentence signed 2026-10-02, action sentence from the 2026-10-12 signed dashboard strings (D-08). Accepted by the owner 2026-10-13 ~16:20 (+04), S-09.

| Language | Text |
|---|---|
| en | Stripe reported a refund as failed after it was recorded. Open the payment in Stripe to try again. |
| de | Stripe hat eine bereits verbuchte Rückerstattung als fehlgeschlagen gemeldet. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen. |
| fr | Stripe a signalé comme échoué un remboursement déjà enregistré. Ouvrez le paiement dans Stripe pour réessayer. |
| ar | أبلغت Stripe عن فشل استرداد سبق تسجيله. افتح الدفعة في Stripe لإعادة المحاولة. |
