# P6 — place and time changes on a paid trip: the owner's decisions (question form, 2026-10-01)

Started from his answer of 2026-09-30: "Yes, its own job after this one" (same treatment as the class
in P1). P1's decisions apply too (today's price book, extras and coupon as paid, 24 h to pay, the
confirmation again, allowed until pickup, cheaper = "Refund due" pressed by him, refunds by hand).

| # | Question (example) | His answer |
|---|---|---|
| D1 | Date or time only, same places (Anna 08:00 → 10:00) | Keep the price she paid. Saved, recorded, confirmation again. |
| D2 | A place the site cannot book (Ben's pickup moved to Istanbul) | Refuse with a message; nothing changes. |
| D3 | Cheaper change close to pickup (Zermatt → airport, 6 h before) | "Refund due" shows the full difference; he decides and presses Refund. |
| D4 | More passengers or bags than the class takes (3 → 6, Economy takes 4) | Offer a larger class in the same Edit, one price for the whole change. |
| D5 | Passengers or bags within the class (2 → 3 in Business) | Saved at once, recorded, confirmation again. |
| D6 | Name, e-mail, phone, note (typo in Ben's phone) | Instant, logged, no e-mail. |
| D7 | Driver assigned when time or places change (Marco) | Keep him and send him the update; if the new time clashes with another of his trips, the dashboard says so and he chooses. |
| D8 | Flight number (LX 318 → LX 320) | Instant, logged, the assigned driver gets the existing flight-number e-mail; no price change. |
| D9 | Customer "Change your booking" page shows five fields that do nothing | Remove the five fields for now; the time change stays; picture before it ships. |

## Design sign-off and texts (question form, 2026-10-01, on the pictures in `.planning/quick/261001-p6-paid-trip-edit/screens/`)

| # | Question (example) | His answer |
|---|---|---|
| D10 | The P6 design: Edit split into Trip (priced again, confirm step) and Contact and note (saved at once); address search; dearer, cheaper, time only, Istanbul refused, classes that fit, driver clash; customer page keeps only the time | "Signed" |
| D11 | Marco has VT-26-0807 at 10:30; Anna's trip moves to 10:00 and both overlap. Keep him on both? | "Yes, I decide": the dashboard warns; he can keep the driver on both trips and sorts the timing out with him |
| D12 | Cancel page, "Move it instead": "Keep the booking and the fare where they are, and pick another day, another route or a different vehicle." | "Remove it": the box keeps its title and button |
| D13 | Signed-in customer's booking page: "Request these changes" sends nothing | "Fix it in P6": it sends the time change exactly like the manage-booking page |
| D14 | Pay-the-difference e-mail for a place or time change | "Approve as written" — texts below, word for word |
| D15 | Line on the customer's booking page after a cheaper place change, until the refund is sent | "Approve as written" — texts below, word for word; it disappears once the refund is sent |
| D16 | E-mail to a kept driver when the pickup or destination changes | "The 'trip assigned' e-mail again": the existing e-mail, no new text (a new time alone keeps the existing time-change e-mail) |
| D17 | D11 needs the database's own overlap rule changed (it refuses every overlap today). Change it? | "Change the rule": a trip he keeps on purpose is left out of the overlap check; an ordinary Assign still refuses overlaps |
| D18 | The site books any two places in its Europe map area (Zurich → Istanbul bookable; Dubai, New York refused); the Edit follows it. Keep it or make it smaller? | "Keep the site's rule": the Edit accepts what the public form accepts; a smaller area would be its own job |
| D19 | Signed-in booking view: flight-number "Save" and "Resend email" say saved/sent and do nothing | "Fix them in P6": both do the real thing, as on the manage-booking link page |
| D20 | On a cancelled trip, Resend on the booking page sent the "Booked — VT-…" confirmation again (in this chat, 2026-10-02) | "Resend the cancellation mail instead on a cancelled trip": the existing cancellation e-mail, to the customer only, with the refund line its cancellation recorded; no new text |

### D14 — "pay the difference" e-mail for a place or time change

Used for a priced change that is not a class change alone (a class-only change keeps the approved
e-mail in `2026-10-01-class-change-pay-mail.md`). `VT-26-0801` = the booking reference; the
`New pickup: …` sentence is one sentence per changed field, in this order: New pickup, New
destination, New pickup time, New class; each `CHF 000` = the real amount at send time (new total,
paid so far, difference). Subject and button are the approved ones, unchanged. No lawyer has read it.

**English**
- Subject: Your Vamos Taxi booking VT-26-0801: pay the difference
- Heading: Your trip changes
- Text: You asked to change booking VT-26-0801. New pickup: Zug station, Bahnhofplatz, 6300 Zug. The new total is CHF 000; you have paid CHF 000. Pay the difference of CHF 000 to confirm the change. The link works for 24 hours. If it is not paid by then, your booking stays as it is.
- Lines: New pickup: … / New destination: … / New pickup time: … / New class: …
- Button: Pay the difference

**German**
- Subject: Ihre Vamos Taxi-Buchung VT-26-0801: Differenz bezahlen
- Heading: Ihre Fahrt ändert sich
- Text: Sie haben gebeten, die Buchung VT-26-0801 zu ändern. Neuer Abholort: Zug station, Bahnhofplatz, 6300 Zug. Der neue Gesamtbetrag ist CHF 000; bezahlt haben Sie CHF 000. Bezahlen Sie die Differenz von CHF 000, um die Änderung zu bestätigen. Der Link gilt 24 Stunden. Ist er bis dann nicht bezahlt, bleibt Ihre Buchung, wie sie ist.
- Lines: Neuer Abholort: … / Neues Ziel: … / Neue Abholzeit: … / Neue Klasse: …
- Button: Differenz bezahlen

**French**
- Subject: Votre réservation Vamos Taxi VT-26-0801 : payer la différence
- Heading: Votre trajet change
- Text: Vous avez demandé de modifier la réservation VT-26-0801. Nouveau lieu de prise en charge : Zug station, Bahnhofplatz, 6300 Zug. Le nouveau total est de CHF 000 ; vous avez payé CHF 000. Payez la différence de CHF 000 pour confirmer le changement. Le lien est valable 24 heures. S’il n’est pas payé d’ici là, votre réservation reste inchangée.
- Lines: Nouveau lieu de prise en charge : … / Nouvelle destination : … / Nouvelle heure de prise en charge : … / Nouvelle catégorie : …
- Button: Payer la différence

**Arabic**
- Subject: حجزك في Vamos Taxi رقم VT-26-0801: ادفع الفرق
- Heading: تتغير رحلتك
- Text: طلبت تغيير الحجز VT-26-0801. مكان الانطلاق الجديد: Zug station, Bahnhofplatz, 6300 Zug. الإجمالي الجديد CHF 000، ودفعت CHF 000. ادفع الفرق البالغ CHF 000 لتأكيد التغيير. الرابط صالح لمدة 24 ساعة. إذا لم يُدفع حتى ذلك الحين، يبقى حجزك كما هو.
- Lines: مكان الانطلاق الجديد: … / الوجهة الجديدة: … / وقت الانطلاق الجديد: … / الفئة الجديدة: …
- Button: ادفع الفرق

### D15 — refund line after a cheaper place change

Shown where the approved class refund line shows (manage-booking and the account booking view,
next to the trip status) until the refund is sent. `CHF 000` = the real difference.

- English: Your trip has changed. The difference of CHF 000 comes back to the payment method you used; our team sends it.
- German: Ihre Fahrt wurde geändert. Die Differenz von CHF 000 geht auf das Zahlungsmittel zurück, mit dem Sie bezahlt haben; unser Team veranlasst sie.
- French: Votre trajet a été modifié. La différence de CHF 000 vous est remboursée sur le moyen de paiement utilisé ; notre équipe l’envoie.
- Arabic: تم تعديل رحلتك. يُردّ إليك الفرق البالغ CHF 000 إلى وسيلة الدفع التي استخدمتها؛ يرسله فريقنا.
