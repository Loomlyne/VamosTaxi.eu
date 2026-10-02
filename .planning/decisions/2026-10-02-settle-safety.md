# Settle safety (difference payments): the owner's answers (question form, 2026-10-02 14:45 +04)

Job `261002-settle-safety`, branch `fix/settle-safety`. Plan: `.planning/quick/261002-settle-safety/PLAN.md`.

| # | Question (example) | His answer |
|---|---|---|
| S1 | The plan: one lock order, retry instead of drop, a cancel ends a waiting change, a difference paid but not applied is recorded as Refund due with a mail, the two R4 fixes (Anna cancels VT-26-0801 while a dearer class waits; her link closes; a payment in the same second is Refund due, the class is not changed) | "Signed" |
| S2 | Internal alert mail to info@ when a difference is paid but the change is not applied (T1) | "Approve as written" — texts below, word for word |
| S3 | Dashboard message on a second Accept of a customer request when the amount to pay moved (T2) | "Approve as written" — texts below, word for word |

## S2 — T1, mail kind `difference-not-applied` (same layout as the other "Needs attention" mails)

- en headline: Difference paid, change not applied
- en body: The customer paid the difference for this booking, but the change was not applied: the trip was cancelled, a newer change replaced it, or it no longer fits. The payment is recorded and shows as Refund due. Send it back from the dashboard, or make the change again.
- de headline: Differenz bezahlt, Änderung nicht übernommen
- de body: Der Kunde hat die Differenz für diese Buchung bezahlt, aber die Änderung wurde nicht übernommen: Die Fahrt wurde storniert, eine neuere Änderung hat sie ersetzt, oder sie passt nicht mehr. Die Zahlung ist verbucht und erscheint als fällige Rückerstattung. Senden Sie sie im Dashboard zurück oder nehmen Sie die Änderung erneut vor.
- fr headline: Différence payée, modification non appliquée
- fr body: Le client a payé la différence pour cette réservation, mais la modification n’a pas été appliquée : le trajet a été annulé, une modification plus récente l’a remplacée, ou elle ne convient plus. Le paiement est enregistré et apparaît comme remboursement dû. Renvoyez-le depuis le tableau de bord ou refaites la modification.
- ar headline: دُفع الفرق ولم يُطبَّق التغيير
- ar body: دفع العميل الفرق لهذا الحجز، لكن التغيير لم يُطبَّق: أُلغيت الرحلة، أو حلّ محله تغيير أحدث، أو لم يعد مناسبًا. الدفعة مسجّلة وتظهر كاسترداد مستحق. أعِدها من لوحة التحكم، أو أجرِ التغيير مرة أخرى.

## S3 — T2, dashboard Accept refusal `price-changed`

- en: The amount to pay changed since you first accepted, so no new link was made. Refuse this request; the customer can ask again.
- de: Der zu zahlende Betrag hat sich seit Ihrer ersten Annahme geändert, daher wurde kein neuer Link erstellt. Lehnen Sie diese Anfrage ab; der Kunde kann erneut fragen.
- fr: Le montant à payer a changé depuis votre première acceptation, aucun nouveau lien n’a donc été créé. Refusez cette demande ; le client peut redemander.
- ar: تغيّر المبلغ المطلوب منذ قبولك الأول، لذلك لم يُنشأ رابط جديد. ارفض هذا الطلب؛ ويمكن للعميل أن يطلب مرة أخرى.
