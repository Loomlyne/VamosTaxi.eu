# Owner decisions: refunds by hand (2026-09-30)

Given by the owner through the question form in the Phase 20 session. Drafted by that session at
his request from what the site will do. **Approved by him as written.** No lawyer has read it.
No time promise is added. The amount stays 100 % for a cancel more than 24 hours before pickup
(decision 2 of `2026-09-30-legal-pages.md`); only who sends the refund changes.

## Decisions

| # | Decision |
|---|---|
| 1 | Refunds are made by hand. The customer's cancel goes through; the booking shows "Refund due"; the admin presses Refund on the dashboard. Nothing goes to Stripe without his click. |
| 2 | The five texts below are his, in en, de, fr, ar, used verbatim. They go live together with the code change (plan 20-10), not before. |
| 3 | A booking with more than one payment: the admin chooses which payment to refund and how much. |
| 4 | If one of two Stripe refunds fails, the dashboard shows what went and what is still due, with Retry. |
| 5 | The second amount check when a payment is recorded (Phase 20 F14) is not built: accepted as is. |

## Texts

### T1 — vamostaxi.site/cancellation, section 01, "more than 24 hours before pickup" (`app/pages/cancellation.dc.html:198`, dict line 1748, and the Next copy)

Today: "Refunded automatically, in full, to the payment method you used. We send the refund when you cancel; your bank may take a few days to show it."

| Language | New text |
|---|---|
| en | Refunded in full to the payment method you used. Our team sends the refund after you cancel; your bank may take a few days to show it. |
| de | Vollständig auf das Zahlungsmittel zurückerstattet, mit dem Sie bezahlt haben. Unser Team veranlasst die Rückerstattung nach Ihrer Stornierung; Ihre Bank braucht vielleicht ein paar Tage, bis sie sichtbar ist. |
| fr | Remboursé intégralement sur le moyen de paiement utilisé. Notre équipe envoie le remboursement après votre annulation ; votre banque peut mettre quelques jours à l’afficher. |
| ar | يُردّ المبلغ كاملًا إلى وسيلة الدفع التي استخدمتها. يرسل فريقنا المبلغ المسترد بعد إلغائك؛ قد يحتاج مصرفك بضعة أيام لإظهاره. |

### T2 — vamostaxi.site/manage-booking, the cancel sheet (`cancelSheetFull`, `app/pages/manage-booking.dc.html:554`)

Today: "This trip will be cancelled. Refunded in full, automatically."

| Language | New text |
|---|---|
| en | This trip will be cancelled. You get a full refund; our team sends it. |
| de | Diese Fahrt wird storniert. Sie erhalten eine volle Rückerstattung; unser Team veranlasst sie. |
| fr | Ce trajet sera annulé. Vous êtes remboursé intégralement ; notre équipe envoie le remboursement. |
| ar | ستُلغى هذه الرحلة. يُردّ إليك المبلغ كاملًا؛ يرسله فريقنا. |

### T3 — cancellation tiers line (`automatic-full-refund-of-the-amount-we`)

Today: "Automatic full refund of the amount we captured."

| Language | New text |
|---|---|
| en | Full refund of the amount we captured, sent by our team. |
| de | Volle Erstattung des erfassten Betrags, von unserem Team veranlasst. |
| fr | Remboursement intégral du montant capturé, envoyé par notre équipe. |
| ar | استرداد كامل للمبلغ المحصّل، يرسله فريقنا. |

### T4 — the cancellation e-mail, refund line for a cancel more than 24 hours before pickup (`packages/emails/src/messages/*.json` `cancellation.refundFullCaptured`)

Today: "A full refund of the captured amount is on the way. Timing follows your card issuer's timing."

| Language | New text |
|---|---|
| en | You will get a full refund of the amount you paid. Our team sends it; your bank may take a few days to show it. |
| de | Sie erhalten eine volle Rückerstattung des bezahlten Betrags. Unser Team veranlasst sie; Ihre Bank braucht vielleicht ein paar Tage, bis sie sichtbar ist. |
| fr | Vous recevrez un remboursement intégral du montant payé. Notre équipe l’envoie ; votre banque peut mettre quelques jours à l’afficher. |
| ar | ستستردّ كامل المبلغ الذي دفعته. يرسله فريقنا؛ قد يحتاج مصرفك بضعة أيام لإظهاره. |

### T5 — the same e-mail, refund line for a cancel inside 24 hours (`cancellation.refundPendingOps`)

Today the customer reads the internal words "Pending Ops." in every language. Replace with the
sentence the site already uses on the cancel sheet (`cancelSheetOps`, already live in four languages):
"Our team decides the refund and tells you by email."
