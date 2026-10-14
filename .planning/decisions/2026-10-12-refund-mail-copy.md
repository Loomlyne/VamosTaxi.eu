# Customer refund mail copy (signed 2026-10-13 ~16:20 +04, owner, via the controller)

Source: Phase 31 S-03 (Q1 = A: when the owner refunds in Stripe, the customer gets a Vamos email in the booking's
language with the amount Stripe sent back), D-10 (one mail per Stripe refund, claimed first), D-11 (the amount is
that Stripe refund's own amount, never computed). Signed as drafted in
`.planning/phases/31-refunds-in-stripe/31-CONTEXT.md` "Customer refund mail" (S-06, question form, relayed by the
controller). Used verbatim by `packages/emails/src/refund.ts` (kind "issued"); `packages/emails/src/refund.test.ts`
pins every row below byte for byte.

Placeholders: `{name}` the booking's contact name, `{amount}` the Stripe refund amount as `CHF 40.00` (from the
Stripe refund, never computed or invented), `{reference}` the booking reference, e.g. `VT-26-0753`. In Arabic the
amount and the reference are isolated left to right (U+2066 … U+2069 in text, an LTR span in HTML).

M2 and M4 are derived from the signed text, as the owner said (S-06): the heading inside the mail repeats the
subject words, and the greeting without a name drops the name. Both are listed in the 31-13 hand-over.

Swiss German: "ss", never the sharp s. The German greeting has no comma, as signed.

### M1 — subject

| Language | Text |
|---|---|
| en | Your refund for {reference} |
| de | Ihre Rückerstattung für {reference} |
| fr | Votre remboursement pour {reference} |
| ar | استرداد مبلغ حجزك {reference} |

### M2 — heading

| Language | Text |
|---|---|
| en | Your refund for {reference} |
| de | Ihre Rückerstattung für {reference} |
| fr | Votre remboursement pour {reference} |
| ar | استرداد مبلغ حجزك {reference} |

### M3 — greeting with name

| Language | Text |
|---|---|
| en | Hello {name}, |
| de | Guten Tag {name} |
| fr | Bonjour {name}, |
| ar | مرحبًا {name}، |

### M4 — greeting without name

| Language | Text |
|---|---|
| en | Hello, |
| de | Guten Tag |
| fr | Bonjour, |
| ar | مرحبًا، |

### M5 — body

| Language | Text |
|---|---|
| en | We have sent {amount} back to the payment method you used for {reference}. Your bank may take a few days to show it. |
| de | Wir haben {amount} an das Zahlungsmittel zurückerstattet, mit dem Sie {reference} bezahlt haben. Ihre Bank braucht vielleicht ein paar Tage, bis die Rückerstattung sichtbar ist. |
| fr | Nous avons remboursé {amount} sur le moyen de paiement utilisé pour {reference}. Votre banque peut mettre quelques jours à l’afficher. |
| ar | أعدنا {amount} إلى وسيلة الدفع التي استخدمتها في الحجز {reference}. قد يحتاج مصرفك بضعة أيام لإظهاره. |

### M6 — questions line

| Language | Text |
|---|---|
| en | Questions? Write to us at info@vamostaxi.site. |
| de | Fragen? Schreiben Sie uns an info@vamostaxi.site. |
| fr | Une question ? Écrivez-nous à info@vamostaxi.site. |
| ar | لديك سؤال؟ راسلنا على info@vamostaxi.site. |
