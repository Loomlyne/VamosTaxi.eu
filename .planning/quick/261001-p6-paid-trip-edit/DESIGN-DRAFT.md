# P6 — design draft for the owner's signature (pictures first)

Branch `gsd/26.2-p6-build`, folder `/Users/koss/Developer/vamos-wt/phase-26.2`, cut from origin/main
`3f0ba6b2`. Plan signed 2026-10-01 (`PLAN.md`), decisions D1–D9 (`DECISIONS.md`).

**Status:** design built and photographed; waiting for your signature (2026-10-01). No server code, no migration,
nothing pushed or deployed, hosted database untouched.

**Must not ship alone:** the Edit form on this branch asks the server for a preview of the trip as
edited (new places, time, party). The server does not answer that yet — that is the next step,
after you sign (section "What the screens expect from the server").

## What you will see (in plain words)

1. **Dashboard → booking → Actions → Edit booking** now has two parts.
   - **Trip** — pickup, destination, date, time, passengers, bags, class. Pickup and destination are
     the address search (pick from the list; typed text alone is never priced). For an airport
     pickup the flight number comes first, as on the booking form.
   - **Contact and note** — name, e-mail, mobile, and a note only you see. Saved at once, no new
     price, kept in the history.
2. The yellow button at the top reads **SAVE CHANGES** when only the contact, note or flight changed,
   and **CONTINUE** when the trip changed.
3. Under the trip fields, P1's price box now lists **every change old → new** (struck-through old
   value, arrow, new value), then **Paid so far / New total / Difference to pay** or **Refund due**.
   A time or party change inside the class shows **"No new price: the customer keeps the price
   paid."** (D1, D5).
4. **CONTINUE** opens the confirm step (P1's dialog, wider): the same list, the money, what happens
   next, what happens to the driver, and "Saved at the same time: Mobile" when you also changed a
   contact field. Nothing is written before **CHANGE THE TRIP**.
5. **A place the site cannot book** (Istanbul): red message under the pickup — "The site cannot book
   this place. Nothing has changed." (D2).
6. **More passengers than the class takes** (3 → 6 in Economy): "Economy cannot take this party."
   under Passengers; the class list keeps only the classes that fit, and the hint names them. Pick
   Business: one price for the whole change (D4). The driver is taken off, as for any class change (P1).
7. **Assigned driver** (Marco Rossi · ZH 123 456): "Marco Rossi stays on the trip and gets the new
   details by e-mail." If the new time clashes with another of his trips: a red notice
   ("Marco Rossi has another trip at that time — VT-26-0807, pickup at 10:30") and two choices,
   **Keep Marco Rossi on this trip** / **Take Marco Rossi off this trip**. CONTINUE asks you to choose
   first (D7).
8. After the pickup time the trip part is locked (grey fields, a line saying why); the contact part
   stays open (D8).
9. **vamostaxi.site → your booking → Change this booking**: only the date and time are left. The
   pickup, destination, class, passengers and bags are gone, with the sentences that promised them
   (D9). Same on the account booking view.

## Pictures

All in `screens/`. Real dashboard shell (`app/ops/ops.dc.html` as the Worker serves it, base href +
sign-in flag), offline, every `/api/*` answered by the picture script; the booking row comes from the
real board mapper (`mapBoardBooking`, same on main and this branch). Before = `git archive 3f0ba6b2`
(origin/main), after = this branch. Every amount shows `CHF 000` (the money formatter is stubbed: no
invented price). Made-up people and places: Anna Keller VT-26-0801, Economy, Zurich Oerlikon station →
Zurich Airport, 08:00, 3 passengers, driver Marco Rossi · ZH 123 456; Ben Meier VT-26-0802, Business,
Zurich Airport → Zug, LX 318, driver Luca Bianchi · ZH 654 321.

Widths 1440, 1024, 768, 390; English and Arabic. 176 pictures + 12 sheets; **0 px sideways at every
width and language**; no console error except the `route.svg` 404 that main has too.

**Best ten for the phone** (Arabic: the same name with `-ar-`):

1. `place-search-states-en-390.png` — the address search, all nine states
2. `edit-open-after-en-390.png` — Edit: Trip, then Contact and note (before: `edit-open-before-en-390.png`)
3. `dear-after-en-390.png` — new pickup Zug: the change, paid so far, new total, difference to pay
4. `dear-confirm-after-en-390.png` — the confirm step ("Change the trip?")
5. `cheap-after-en-390.png` — new pickup Glattbrugg: Refund due
6. `time-only-after-en-390.png` — 08:00 → 10:00: no new price
7. `refusal-after-en-390.png` — Istanbul refused under the field
8. `class-small-after-en-390.png` — 6 passengers: "Economy cannot take this party", classes that fit
9. `clash-after-en-390.png` — Marco Rossi has another trip at that time: keep / take off
10. `customer-change-after-en-390.png` — vamostaxi.site "Change your booking", time only (before: `customer-change-before-en-390.png`)

**Sheets** (1440 English + 390 English + 390 Arabic per row; each under 600 KB):

| Sheet | Shows |
|---|---|
| `sheet-1-edit-open.png` | Edit before (11 free-text fields) / after (Trip, Contact and note) |
| `sheet-2-place-search.png` | PlaceSearch gallery, and the list open in the Edit form |
| `sheet-3-dearer.png` | Dearer place change: the box, the confirm step |
| `sheet-4-cheaper.png` | Cheaper place change: Refund due |
| `sheet-5-time-only.png` | Time only: no new price, the confirm step |
| `sheet-6-refusal.png` | Istanbul refused |
| `sheet-7-party-too-big.png` | 3 → 6 passengers: classes that fit; Business picked, one price |
| `sheet-8-driver-clash.png` | Driver clash notice and choice |
| `sheet-9-flight-instant.png` | Airport pickup: flight first (before / after / after Save) |
| `sheet-10-waiting.png` | A dearer trip change waiting for payment: before (Accept / Refuse) / after |
| `sheet-11-after-pickup.png` | After the pickup time: trip locked, contact open |
| `sheet-12-customer.png` | Customer "Change your booking": before / after / after a new time |

**Single pictures:** `{edit-open,dear,dear-confirm,cheap,time-only,time-confirm,refusal,class-small,
class-picked,clash,flight,flight-saved,wait,search,locked}-after-{en,ar}-{1440,1024,768,390}.png`;
`{edit-open,flight,wait}-before-…`; `customer-change-{before,after}-…`, `customer-change-time-after-…`;
`place-search-states-{en,ar}-{1440,1024,768,390}.png`.

## Design choices (say if one is wrong)

| # | Choice | Why |
|---|---|---|
| C1 | Two groups with their own lead line, one button whose label says what it does (SAVE CHANGES / CONTINUE). | You asked to see which save does what. Two separate buttons would let a trip change be lost when you press only the contact one. |
| C2 | The flight sits first in the Trip group, only for an airport pickup, with the hint "Saved at once, with no new price. The driver gets the new flight number by e-mail." | Booking field order (Flight → From → To → When → Travellers) and D8 (flight is instant). A new airport pickup asks for the flight. |
| C3 | P1's box is extended, not copied: the class is now one "What changes" row like the others; "Class now / New class" rows are gone; the money rows are P1's. | One box for every change; long addresses read better old → new than in two price rows. |
| C4 | No disabled yellow button: when the change cannot go on (place not picked, refusal, clash not chosen, still pricing), CONTINUE says why in a notice. | P1 rule: a disabled yellow reads as a cream pill (law 02). |
| C5 | Party too big: the class list shows the current class marked "too small" plus only the classes that fit. | D4 "offer the classes that fit". |
| C6 | A dearer trip change waits like P1's class change: "Waiting for payment of the difference — Trip change · CHF 000 to pay · the link works until …", Open / Copy the Stripe page, Withdraw change ("Withdraw the trip change?"). | Before, main would show this as a customer request with Accept / Refuse (picture `wait-before-*`). |
| C7 | Trip fields lock at the pickup time; the contact and note stay editable after it. | D8 / plan P6-9. Today Edit also opens on completed trips. |
| C8 | The note: shown in the booking detail when there is one; "Only you see the note." | The save already accepted a note; no screen showed it. Nothing customer- or driver-facing reads it. |
| C9 | Date and time stay two text fields (YYYY-MM-DD, HH:MM) with a format message. | Brief: "date and time stay two inputs", as New trip. |
| C10 | The customer change is removed on both customer views: the manage link (`manage-booking`) and the account booking view (`booking-detail`). | Same view twice; D9 covers the page. |
| C11 | PlaceSearch is its own Design Component with its own four-language copy; the states gallery is `app/ops/PlaceSearchStates.dc.html`. | Third copy of the address search → component (project rule). |

## What the screens expect from the server (input to the server step)

`POST /api/staff/bookings/:id/change/preview` (P1's route), body = only what changed:
`{}` (P1, the trip as booked), or any of `pickup` / `dropoff` (`{ kind: "retrieve", mapbox_id,
session_token, text }` from the address search), `dateIso` + `time` (both), `pax`, `bags`.
The screens read from the answer:

| Field | Used for |
|---|---|
| `classes[]` (P1: `slug, name, current, ok, code, newTotalRappen, differenceRappen`), priced for the trip as edited | Class list, money rows, "too small" (`code: "class-too-small"`), classes that fit |
| `paidRappen`, `currentClass` (P1) | Paid so far, the class list |
| `lock` (new, optional) | Sent back at confirm; the signed trip facts (no second Mapbox call) |
| `pickupIsAirport` (new, optional) | Shows the flight field first for an airport pickup |
| `driverClash: { reference, time }` (new, optional) | The clash notice and choice |
| `ok: false, code, field` (new) | A refusal under its field: `field` `pickup` / `dropoff` with `place-not-served`, `same-place`, `no-route`; `field` `when` with `past-time` |

`POST /api/staff/bookings/:id/change` body: a class-only change is exactly P1's
(`klass, expectTotalRappen, expectPaidRappen`); a trip change adds the changed fields as above, `lock`,
and `driver: "keep" | "unassign"` when there was a clash. The answer is P1's plus `driverUpdated`
(the kept driver was e-mailed). The board row must mark a staff trip change waiting for payment
(today it carries the class name only; with no class the dashboard writes "Trip change").

`PATCH /api/staff/bookings/:id` now gets `customer, email, phone, note, flight` only (plan P6-7: refuse
trip fields on a paid booking).

## New strings (four languages)

Dashboard booking page — `app/ops/OpsDetail.dc.html`, the page's own table (new keys):

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| `editTripHead` | Trip | Fahrt | Course | الرحلة |
| `editTripLead` | Priced again before anything changes. You confirm on the next step. | Wird neu berechnet, bevor sich etwas ändert. Sie bestätigen im nächsten Schritt. | Recalculée avant tout changement. Vous confirmez à l’étape suivante. | يُعاد حساب السعر قبل أي تغيير. تؤكّد في الخطوة التالية. |
| `editContactHead` | Contact and note | Kontakt und Notiz | Contact et note | التواصل والملاحظة |
| `editContactLead` | Saved at once, with no new price. Each change is kept in the history. | Wird sofort gespeichert, ohne neuen Preis. Jede Änderung bleibt im Verlauf. | Enregistré tout de suite, sans nouveau prix. Chaque changement reste dans l’historique. | يُحفظ فورًا، دون سعر جديد. يبقى كل تغيير في السجل. |
| `note` | Note | Notiz | Note | ملاحظة |
| `noteHint` | Only you see the note. | Nur Sie sehen die Notiz. | Vous seul voyez la note. | أنت وحدك ترى الملاحظة. |
| `flightHintDriver` | Saved at once, with no new price. The driver gets the new flight number by e-mail. | Wird sofort gespeichert, ohne neuen Preis. Der Fahrer erhält die neue Flugnummer per E-Mail. | Enregistré tout de suite, sans nouveau prix. Le chauffeur reçoit le nouveau numéro de vol par e-mail. | يُحفظ فورًا، دون سعر جديد. يتلقى السائق رقم الرحلة الجوية الجديد بالبريد الإلكتروني. |
| `flightHintNoDriver` | Saved at once, with no new price. | Wird sofort gespeichert, ohne neuen Preis. | Enregistré tout de suite, sans nouveau prix. | يُحفظ فورًا، دون سعر جديد. |
| `flightNeeded` | Enter the flight number: the new pickup is an airport. | Geben Sie die Flugnummer ein: Die neue Abholung ist ein Flughafen. | Saisissez le numéro de vol : la nouvelle prise en charge est un aéroport. | أدخل رقم الرحلة الجوية: مكان الانطلاق الجديد مطار. |
| `whatChanges` | What changes | Was sich ändert | Ce qui change | ما الذي يتغيّر |
| `noNewPrice` | No new price: the customer keeps the price paid. | Kein neuer Preis: Der Kunde behält den bezahlten Preis. | Pas de nouveau prix : le client garde le prix payé. | لا سعر جديد: يحتفظ العميل بالسعر المدفوع. |
| `tripNoteDearer` | The trip stays as booked until the customer pays the difference. The site e-mails the payment link; it works for 24 hours. | Die Fahrt bleibt wie gebucht, bis der Kunde die Differenz bezahlt hat. Die Website sendet ihm den Zahlungslink per E-Mail; er gilt 24 Stunden. | La course reste telle que réservée jusqu’à ce que le client paie la différence. Le site lui envoie le lien de paiement par e-mail ; il est valable 24 heures. | تبقى الرحلة كما حُجزت حتى يدفع العميل الفرق. يرسل الموقع رابط الدفع بالبريد الإلكتروني؛ وهو صالح لمدة 24 ساعة. |
| `tripNoteCheaper` | The trip changes when you confirm. The difference shows as Refund due; nothing is sent until you press Confirm refund. | Die Fahrt ändert sich, wenn Sie bestätigen. Die Differenz erscheint als «Rückerstattung fällig»; es wird nichts gesendet, bis Sie «Rückerstattung bestätigen» drücken. | La course change à votre confirmation. La différence apparaît comme « Remboursement dû » ; rien n’est envoyé avant que vous appuyiez sur « Confirmer le remboursement ». | تتغيّر الرحلة عند تأكيدك. يظهر الفرق كاسترداد مستحق؛ لا يُرسَل شيء حتى تضغط «تأكيد الاسترداد». |
| `tripNoteSame` | The trip changes when you confirm. The customer gets the confirmation again. | Die Fahrt ändert sich, wenn Sie bestätigen. Der Kunde erhält die Bestätigung erneut. | La course change à votre confirmation. Le client reçoit de nouveau la confirmation. | تتغيّر الرحلة عند تأكيدك. يتلقى العميل التأكيد مرة أخرى. |
| `driverKeepNote` | {name} stays on the trip and gets the new details by e-mail. | {name} bleibt auf der Fahrt und erhält die neuen Angaben per E-Mail. | {name} reste sur la course et reçoit les nouveaux détails par e-mail. | يبقى {name} على الرحلة ويتلقى التفاصيل الجديدة بالبريد الإلكتروني. |
| `clashTitle` | {name} has another trip at that time | {name} hat zu dieser Zeit eine andere Fahrt | {name} a une autre course à cette heure-là | لدى {name} رحلة أخرى في ذلك الوقت |
| `clashBody` | {ref}, pickup at {time}. | {ref}, Abholung um {time}. | {ref}, prise en charge à {time}. | {ref}، الانطلاق الساعة {time}. |
| `clashKeep` | Keep {name} on this trip | {name} auf dieser Fahrt lassen | Garder {name} sur cette course | إبقاء {name} على هذه الرحلة |
| `clashKeepSub` | Both trips stay with the driver, who gets the new details by e-mail. | Beide Fahrten bleiben beim Fahrer; er erhält die neuen Angaben per E-Mail. | Les deux courses restent au chauffeur, qui reçoit les nouveaux détails par e-mail. | تبقى الرحلتان مع السائق، ويتلقى التفاصيل الجديدة بالبريد الإلكتروني. |
| `clashOff` | Take {name} off this trip | {name} von dieser Fahrt nehmen | Retirer {name} de cette course | إزالة {name} من هذه الرحلة |
| `clashOffSub` | The trip goes back to unassigned and the driver is told by e-mail. | Die Fahrt ist wieder ohne Fahrer; der Fahrer wird per E-Mail informiert. | La course redevient sans chauffeur et le chauffeur est prévenu par e-mail. | تعود الرحلة دون سائق ويُبلَّغ السائق بالبريد الإلكتروني. |
| `clashChoose` | Choose whether {name} keeps this trip. | Wählen Sie, ob {name} diese Fahrt behält. | Choisissez si {name} garde cette course. | اختر ما إذا كان {name} سيبقى على هذه الرحلة. |
| `tripConfirmTitle` | Change the trip? | Fahrt ändern? | Changer la course ? | تغيير الرحلة؟ |
| `tripKeep` | Go back | Zurück | Retour | رجوع |
| `tripConfirm` | Change the trip | Fahrt ändern | Changer la course | تغيير الرحلة |
| `alsoSaved` | Saved at the same time: {fields}. | Gleichzeitig gespeichert: {fields}. | Enregistré en même temps : {fields}. | حُفظ في الوقت نفسه: {fields}. |
| `savedInstant` | Saved. The change is in the history. | Gespeichert. Die Änderung steht im Verlauf. | Enregistré. Le changement figure dans l’historique. | تم الحفظ. التغيير موجود في السجل. |
| `savedFlight` | Saved. The driver gets the new flight number by e-mail. | Gespeichert. Der Fahrer erhält die neue Flugnummer per E-Mail. | Enregistré. Le chauffeur reçoit le nouveau numéro de vol par e-mail. | تم الحفظ. يتلقى السائق رقم الرحلة الجوية الجديد بالبريد الإلكتروني. |
| `pickFromList` | Pick the new place from the list. | Wählen Sie den neuen Ort aus der Liste. | Choisissez le nouveau lieu dans la liste. | اختر المكان الجديد من القائمة. |
| `errPlaceNotServed` | The site cannot book this place. Nothing has changed. | Dieser Ort kann auf der Website nicht gebucht werden. Es hat sich nichts geändert. | Ce lieu ne peut pas être réservé sur le site. Rien n’a changé. | لا يمكن حجز هذا المكان على الموقع. لم يتغيّر شيء. |
| `errSamePlace` | Pickup and destination are the same place. | Abholung und Ziel sind derselbe Ort. | La prise en charge et la destination sont au même endroit. | مكان الانطلاق والوجهة هما المكان نفسه. |
| `errNoRoute` | No road route was found to this place. Nothing has changed. | Zu diesem Ort wurde keine Strassenroute gefunden. Es hat sich nichts geändert. | Aucun itinéraire routier n’a été trouvé vers ce lieu. Rien n’a changé. | لم يُعثر على طريق بري إلى هذا المكان. لم يتغيّر شيء. |
| `errPastTime` | That time has passed. Choose a time ahead. | Diese Zeit ist vorbei. Wählen Sie eine spätere Zeit. | Cette heure est passée. Choisissez une heure à venir. | هذا الوقت قد مضى. اختر وقتًا لاحقًا. |
| `errDateForm` | Write the date as YYYY-MM-DD. | Schreiben Sie das Datum als JJJJ-MM-TT. | Écrivez la date sous la forme AAAA-MM-JJ. | اكتب التاريخ بالشكل YYYY-MM-DD. |
| `errTimeForm` | Write the time as HH:MM. | Schreiben Sie die Uhrzeit als HH:MM. | Écrivez l’heure sous la forme HH:MM. | اكتب الوقت بالشكل HH:MM. |
| `errPaxRange` | Enter 1 to 16 passengers. | Geben Sie 1 bis 16 Passagiere ein. | Saisissez de 1 à 16 passagers. | أدخل من 1 إلى 16 راكبًا. |
| `errBagsRange` | Enter 0 to 16 bags. | Geben Sie 0 bis 16 Gepäckstücke ein. | Saisissez de 0 à 16 bagages. | أدخل من 0 إلى 16 حقيبة. |
| `errPartyTooBig` | {class} cannot take this party. | {class} bietet nicht genug Platz für diese Gruppe. | {class} ne peut pas prendre ce groupe. | لا تتسع فئة {class} لهذه المجموعة. |
| `classesThatFit` | Classes that fit: {list}. | Passende Klassen: {list}. | Classes qui conviennent : {list}. | الفئات المناسبة: {list}. |
| `noClassFits` | No class takes this party. | Keine Klasse bietet genug Platz für diese Gruppe. | Aucune classe ne peut prendre ce groupe. | لا توجد فئة تتسع لهذه المجموعة. |
| `tooSmallTag` | too small | zu klein | trop petite | صغيرة جدًا |
| `tripTooLate` | The pickup time has passed. Places, time, party and class can no longer change. | Die Abholzeit ist vorbei. Orte, Zeit, Gruppe und Klasse können nicht mehr geändert werden. | L’heure de prise en charge est passée. Lieux, heure, groupe et classe ne peuvent plus changer. | انقضى موعد الانطلاق. لم يعد بالإمكان تغيير الأماكن أو الوقت أو المجموعة أو الفئة. |
| `tripWaiting` | Trip change | Fahrtänderung | Changement de course | تغيير الرحلة |
| `withdrawTripTitle` | Withdraw the trip change? | Fahrtänderung zurückziehen? | Retirer le changement de course ? | سحب تغيير الرحلة؟ |
| `withdrawTripBody` | The payment link stops working and nothing is charged. The trip stays as booked. | Der Zahlungslink funktioniert nicht mehr und es wird nichts belastet. Die Fahrt bleibt wie gebucht. | Le lien de paiement ne fonctionne plus et rien n’est débité. La course reste telle que réservée. | يتوقف رابط الدفع عن العمل ولا يُخصم أي مبلغ. تبقى الرحلة كما حُجزت. |
| `tripDoneApplied` | Trip changed. The customer got the confirmation again. | Fahrt geändert. Der Kunde hat die Bestätigung erneut erhalten. | Course changée. Le client a reçu de nouveau la confirmation. | غُيّرت الرحلة. تلقّى العميل التأكيد مرة أخرى. |
| `tripDoneRefund` | Trip changed. Refund due: {a}. Press Confirm refund to send it. | Fahrt geändert. Rückerstattung fällig: {a}. Drücken Sie «Rückerstattung bestätigen», um sie zu senden. | Course changée. Remboursement dû : {a}. Appuyez sur « Confirmer le remboursement » pour l’envoyer. | غُيّرت الرحلة. استرداد مستحق: {a}. اضغط «تأكيد الاسترداد» لإرساله. |
| `tripDoneWaiting` | The customer was e-mailed the link to pay {a}. The trip changes when it is paid. | Der Kunde hat den Link erhalten, um {a} zu bezahlen. Die Fahrt ändert sich, sobald bezahlt ist. | Le client a reçu par e-mail le lien pour payer {a}. La course change une fois le paiement reçu. | أُرسل إلى العميل رابط لدفع {a}. تتغيّر الرحلة عند الدفع. |
| `tripDoneNoConfirm` | Trip changed. The confirmation e-mail did not go out: use Resend voucher. | Fahrt geändert. Die Bestätigung wurde nicht gesendet: Verwenden Sie «Gutschein erneut senden». | Course changée. L’e-mail de confirmation n’est pas parti : utilisez « Renvoyer le bon ». | غُيّرت الرحلة. لم يُرسَل بريد التأكيد: استخدم «إعادة إرسال القسيمة». |
| `tripDoneDriverKept` | {name} got the new details by e-mail. | {name} hat die neuen Angaben per E-Mail erhalten. | {name} a reçu les nouveaux détails par e-mail. | تلقّى {name} التفاصيل الجديدة بالبريد الإلكتروني. |
| `errTripFailed` | Could not change the trip of  | Fahrt konnte nicht geändert werden:  | Impossible de changer la course de  | تعذّر تغيير رحلة  |


Address search — `app/ops/PlaceSearch.dc.html`, the component's own table:

| Key | English | German | French | Arabic |
|---|---|---|---|---|
| `placeholder` | Street, town or airport | Strasse, Ort oder Flughafen | Rue, localité ou aéroport | شارع أو مدينة أو مطار |
| `typing` | Type 2 letters or more. | Geben Sie mindestens 2 Zeichen ein. | Saisissez au moins 2 lettres. | اكتب حرفين على الأقل. |
| `loading` | Searching… | Suche läuft… | Recherche… | جارٍ البحث… |
| `none` | No place found. Try a street and a town. | Kein Ort gefunden. Versuchen Sie Strasse und Ort. | Aucun lieu trouvé. Essayez une rue et une localité. | لم يُعثر على أي مكان. جرّب اسم شارع ومدينة. |
| `error` | The address search did not answer. | Die Adresssuche hat nicht geantwortet. | La recherche d’adresse n’a pas répondu. | لم تستجب خدمة البحث عن العناوين. |
| `retry` | Try again | Erneut versuchen | Réessayer | أعد المحاولة |
| `pick` | Pick the place from the list. | Wählen Sie den Ort aus der Liste. | Choisissez le lieu dans la liste. | اختر المكان من القائمة. |


Customer views — `app/vamos-i18n-dict.js`. No new customer sentence: three existing two-sentence
lines lost the sentence that promised the five fields; what is left is the old second sentence with
its existing translation (Arabic: the joining word dropped so it stands alone). Two existing labels of
the same view had no translation and got one:

| English | German | French | Arabic |
|---|---|---|---|
| Nothing is applied until we confirm it in writing. | Nichts wird übernommen, bevor wir es schriftlich bestätigen. | Rien n’est appliqué avant notre confirmation écrite. | لا يُطبَّق شيء قبل أن نؤكده كتابةً. |
| We never charge for the change itself. | Für die Änderung selbst berechnen wir nie etwas. | La modification elle-même n’est jamais facturée. | لا نتقاضى أبدًا أي مبلغ عن التعديل نفسه. |
| We confirm every change by email before it counts. | Jede Änderung bestätigen wir per E-Mail, bevor sie gilt. | Nous confirmons chaque modification par e-mail avant qu’elle ne compte. | نؤكّد كل تعديل بالبريد قبل أن يصبح نافذًا. |
| Back to your booking *(existing label, translation added)* | Zurück zu Ihrer Buchung | Retour à votre réservation | العودة إلى حجزك |
| New pickup date & time *(existing label, translation added)* | Neues Abholdatum und neue Abholzeit | Nouvelle date et heure de prise en charge | تاريخ ووقت الانطلاق الجديدان |

Removed from both customer views and from the dictionary: "Move the pickup, change where you are
going, or travel with a different party." · "Where you are going" · "A new route is priced again. If
it comes to more you pay the difference, if it comes to less we refund it — never more than the
difference." · "Vehicle class" choice and "A larger class costs more and a smaller one costs less. We
quote the difference before anything is charged." · "Passengers and bags", the four +/− labels,
"That is more people than this class seats. Pick a larger class above." · "Count a cabin bag as a bag.
Skis, a cot or a bike are worth a word to dispatch before you travel." · "You pay any difference in
the fare, or we refund it." · "Time, route, vehicle or passengers."

## Owner answers (2026-10-01)

All five open questions and F1 answered, and the design signed: decisions D10–D16 in
`.planning/decisions/2026-10-01-p6-paid-trip-edit.md` (texts word for word there).

## Open questions for the owner (one decision each) — answered, see above

1. **Which e-mail asks the customer to pay the difference after a place change?** Your approved
   "pay the difference" e-mail speaks of a class ("Your trip changes to Business"). Example: Anna's
   pickup moves from Oerlikon to Zug and the trip costs more — today there is no approved text for
   that e-mail. Options: I draft one text for a place or time change and you approve it · I draft one
   general text for every change (class too) and you approve it.
2. **What does the customer's booking page say after a cheaper place change, until the refund is
   sent?** Your approved line says "Your trip now runs in Economy…". Example: Anna's pickup moves
   closer (Glattbrugg); she is owed money; her page says nothing about it until you press Refund.
   Options: nothing, as now · I draft a line and you approve it.
3. **Which e-mail tells a kept driver about a new pickup or destination?** For a new time the
   existing "time change confirmed" e-mail goes to him. Example: Marco keeps Anna's trip, the pickup
   moves to Zug. Options: send him the existing "trip assigned" e-mail again (it lists the new
   places) · I draft a short "trip changed" e-mail and you approve it.
4. **Keep a driver on two trips that overlap?** The database today refuses one driver on two
   overlapping trips. Example: Marco has VT-26-0807 at 10:30; you move Anna to 10:00 and choose "Keep
   Marco Rossi". Options: allow it — you sort out the timing with him · offer only "Take him off" when
   the trips really overlap.
5. **The cancel view's "Move it instead" still promises another route or vehicle.** Its line reads
   "Keep the booking and the fare where they are, and pick another day, another route or a different
   vehicle." Only the day and time can change now. Options: remove the sentence (the button keeps its
   title) · keep it.

## Follow-ups (not in this step)

| # | What | Why not now |
|---|---|---|
| F1 | **The account booking view's "Request these changes" sends nothing** (`app/pages/booking-detail.dc.html` `confirmModify` only shows "Change requested"; the manage-link view sends the time). A signed-in customer's time change never reaches you. Recommended: same call as the manage link, in the server step. | Found here; a behaviour change on a live customer page, not part of D9. |
| F2 | New trip and the route editor use PlaceSearch (`OpsNewTrip.dc.html` keeps its own list; `OpsTable.dc.html` route From/To too). | Not trivial: `ops-dc-bp.test.ts` drives New trip's own search methods; New trip creates live bookings. |
| F3 | The customer view's disabled yellow "REQUEST THESE CHANGES" (before anything changed) reads as a cream pill (law 02). | Existing, on every customer page with a disabled primary. |
| F4 | `apps/web/i18n/messages/*.json` (`account.*`) still carry the retired customer strings for the React twin; `seed.sql` is generated from them. | No customer is served the React account view as far as read; changing them means a seed regeneration. |
| F5 | Remove `app/ops/PlaceSearchStates.dc.html` after your signature, or keep it as the component's gallery. | Review scaffold. |
| F6 | Page-level coverage gaps that exist on main too: dashboard "Unassign", "Transfer, Economy", "Actions", "Assign", "Flight number updated", "No chauffeur has the class … yet"; manage-booking 15 lines (header note, "What you paid", the dispatch block). | Not P6's surfaces. |
| F7 | `assets/icons/route.svg` is missing (404 on the booking page, also on main). | Existing. |

## Checks (final tree, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass — 0 errors, 6 warnings, all in files this step did not touch |
| `pnpm lint:css` | pass |
| `pnpm i18n:check` | pass (2676 keys) |
| `pnpm check:numbers` | pass |
| Unit tests pinning the touched files (39 files, 529 tests) | pass — `phase-26-3-laws`, `ops-class-change-dc`, `ops-dc-p4`, `refund`, `ops-dc-dash-design`, `edit-request`, `phone-booking`, `ops-dc-chauffeur-class`, `ops-dc-bp`, `ops-live-data`, `customers-board`, `ops-dc-u08`, `voucher`, `ops-detail-i18n`, `ops-refund-review-dc`, `account/bookings`, `assign`, `manage-token`, `guest-account`, `class-lineup-mocks`, `no-car-surfaces`, `class-change-customer-line`, `refund-texts-20-10`, `legal-text-hygiene`, `signup-notice-mock`, `phase-26-4-laws`, `owner-texts`, `legal-pages-27`, `ops-signin-stepup-dc`, `privacy-account-paragraph`, `auth-ui-dc`, `new-trip-intent`, `mock-mounts`, `no-photo-remove-link`, `ops-assets`, `ops-assets-gateway`, and the three new ones below |
| New tests | `apps/web/lib/ops/place-search-dc.test.ts` (14: every state reached by typing, waiting, picking; props, gallery, four languages, laws) · `apps/web/lib/ops/ops-p6-edit-dc.test.ts` (17: trip vs instant fields, PATCH body, field order, refusal, party too big, clash, lock) · `apps/web/lib/checkout/customer-change-time-only.test.ts` (10: both customer views, dictionary) |
| Tests changed | `ops-class-change-dc.test.ts` (P1's box now one class row + money rows; confirm on any trip change; class-only body unchanged; waiting state for any staff change) · `class-lineup-mocks.test.ts` (the customer views carry no class list any more) |
| `VamosLocale.coverage(root)` | New surfaces: nothing untranslated (Edit form, change box, confirm step, waiting line, toast and PlaceSearch translate themselves; the customer view's new and remaining strings are in the dictionary). Left on the page, also on main: data (references, names) and F6 |
| Pictures | 176 + 12 sheets, 0 px sideways at 1440 / 1024 / 768 / 390 in English and Arabic |
| Full `pnpm test:unit` | not run (the lead runs it once) |

Not verified: no server answers the new preview fields (they are stubbed on the pictures); no live
click; Arabic, German and French texts not read by a native speaker.
