# Owner decision: wording for Google and the wider Meta events (2026-10-09)

**Status: ADOPTED by the owner on 2026-10-09**, through the question form: "I read it, adopt as written" (sections 1, 2b, 3a, 3b, 4 and 2a unchanged), and "Yes, ask everyone again" for the consent version. From this decision on these texts are his own, verbatim, never reworded. The gate for Google and the new Meta events still opens only in code, when all texts are live on the banner, the cookies page and the privacy page in four languages, and the consent version has moved to the ship day. Nothing is on the site yet.

Written by the agent as a draft at his request ("Yes, draft them", 2026-10-09), then read and adopted by him.

Written by the agent at his request ("Yes, draft them", 2026-10-09). No lawyer has read it. Statute articles and the legal route for processing abroad are left out on purpose, as before.

## What his answers of 2026-10-09 change

- Google (Google Ads, tag `AW-368142830`) is added next to Meta in the banner, the cookies page and the privacy page.
- Meta gets more events: page opened, price button, contact buttons (WhatsApp, phone, email), contact form, vehicle chosen, go to payment, paid booking. The booking reference now goes to Meta and to Google (D4). The old sentence "We do not send ... booking reference" is therefore replaced in the Meta privacy line.
- The Meta cookies row (`_fbp`, `_fbc`, 90 days) does not change.

## Facts the texts rely on (the build must make them true)

| Fact | Source | Build must |
|---|---|---|
| Google Ads cookies set on our domain: `_gcl_au` and `_gcl_aw`, 90 days each | Google's cookie list, https://business.safety.google/adscookies/, read 2026-10-09 | set nothing else of ours; the intercepted test run lists every cookie, and if another appears this text is changed before shipping |
| Google's script is loaded only after Marketing is accepted (D2) | owner, 2026-10-09 | `app/vamos-google.js` loads nothing before; withdraw deletes both cookies |
| Google receives the visitor's IP address and browser details when its script loads; Meta likewise | inherent to loading any third-party script | not hidden; both lines say it |
| Sent to Meta: event name, amount (when there is one), the two Meta cookie ids if they exist, the booking reference once a booking exists | plan jobs 3 and 4 | nothing else; no name, email, phone, route, flight, no typed text, no contact number or address |
| Sent to Google: the amount paid, the booking reference, the advert click code held in the Google cookies | plan job 6 | nothing else |
| Contact events carry only which button (WhatsApp, phone, email), never the number or address | plan job 2+3 | enforced by test |

Added to the Meta privacy line beyond what he asked, because it is true and was missing in the 2026-09-30 text: "Meta receives your IP address and browser details when its script loads." He may strike it; the build does not change either way.

## 1. Cookie banner (replaces the Meta-only banner line)

| Language | Text |
|---|---|
| en | We use necessary cookies to run your booking. If you accept, Meta (Facebook and Instagram) and Google (Google Ads) may also measure visits to this site, clicks on contact buttons, the contact form, the steps of a booking and completed bookings, so we can see which adverts work. You can refuse, and you can change your choice at any time in Cookie preferences. |
| de | Wir verwenden notwendige Cookies, damit Ihre Buchung funktioniert. Wenn Sie zustimmen, dürfen Meta (Facebook und Instagram) und Google (Google Ads) zusätzlich Besuche dieser Website, Klicks auf Kontaktschaltflächen, das Kontaktformular, die Schritte einer Buchung und abgeschlossene Buchungen messen, damit wir sehen, welche Anzeigen wirken. Sie können ablehnen und Ihre Wahl jederzeit in den Cookie-Einstellungen ändern. |
| fr | Nous utilisons des cookies nécessaires au fonctionnement de votre réservation. Si vous acceptez, Meta (Facebook et Instagram) et Google (Google Ads) peuvent aussi mesurer les visites de ce site, les clics sur les boutons de contact, le formulaire de contact, les étapes d'une réservation et les réservations terminées, afin que nous sachions quelles annonces fonctionnent. Vous pouvez refuser et modifier votre choix à tout moment dans les préférences de cookies. |
| ar | نستخدم ملفات تعريف الارتباط الضرورية لإتمام حجزك. إذا وافقت، يمكن لشركتي Meta (فيسبوك وإنستغرام) وGoogle (إعلانات Google) أيضًا قياس زيارات هذا الموقع والنقرات على أزرار التواصل ونموذج الاتصال ومراحل الحجز والحجوزات المكتملة، لنعرف أي الإعلانات تنجح. يمكنك الرفض، ويمكنك تغيير اختيارك في أي وقت من إعدادات ملفات تعريف الارتباط. |

## 2a. Cookies page, the Meta row (unchanged, listed so the set stays whole)

Exactly the text of section 2 in `2026-09-30-meta-wording.md`.

## 2b. Cookies page, the new Google row

| Language | Text |
|---|---|
| en | **Google** (Google Ireland Ltd). Cookies `_gcl_au` and `_gcl_aw`. Set only after you accept. They let Google Ads remember which advert click brought you here, to measure adverts. Kept for up to 90 days. |
| de | **Google** (Google Ireland Ltd). Cookies `_gcl_au` und `_gcl_aw`. Werden erst nach Ihrer Zustimmung gesetzt. Sie ermöglichen Google Ads, sich zu merken, welcher Anzeigenklick Sie hierher geführt hat, um Anzeigen zu messen. Speicherdauer bis zu 90 Tage. |
| fr | **Google** (Google Ireland Ltd). Cookies `_gcl_au` et `_gcl_aw`. Déposés uniquement après votre accord. Ils permettent à Google Ads de retenir quel clic sur une annonce vous a amené ici, pour mesurer les annonces. Conservés jusqu'à 90 jours. |
| ar | **Google** (Google Ireland Ltd). ملفا تعريف الارتباط `_gcl_au` و`_gcl_aw`. لا يُوضعان إلا بعد موافقتك. يسمحان لـ Google Ads بتذكّر أي نقرة على إعلان أوصلتك إلى هنا، لقياس الإعلانات. يُحفظان لمدة تصل إلى 90 يومًا. |

## 3a. Privacy page, the Meta line (replaces the 2026-09-30 line)

| Language | Text |
|---|---|
| en | **Meta Platforms Ireland Ltd. Advert measurement, only with your consent.** After you accept, Meta records that a page of this site was opened, that a price button, a contact button (WhatsApp, phone or email) or the contact form was used, but not what you type, and the steps of a booking (choosing a vehicle, going to payment). When you choose a vehicle, when you go to payment and after a paid booking, we send Meta one message each with the amount, the two Meta cookie identifiers, if they exist, and, once the booking exists, its booking reference. We do not send your name, email, phone number, route or flight. Meta receives your IP address and browser details when its script loads. Meta may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences. |
| de | **Meta Platforms Ireland Ltd. Anzeigenmessung, nur mit Ihrer Einwilligung.** Nach Ihrer Zustimmung erfasst Meta, dass eine Seite dieser Website geöffnet wurde, dass eine Preis-Schaltfläche, eine Kontakt-Schaltfläche (WhatsApp, Telefon oder E-Mail) oder das Kontaktformular benutzt wurde, nicht aber, was Sie eingeben, sowie die Schritte einer Buchung (Fahrzeug wählen, zur Zahlung gehen). Wenn Sie ein Fahrzeug wählen, wenn Sie zur Zahlung gehen und nach einer bezahlten Buchung, senden wir Meta jeweils eine Nachricht mit dem Betrag, den beiden Meta-Cookie-Kennungen, sofern vorhanden, und, sobald die Buchung besteht, ihrer Buchungsreferenz. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke oder Flug. Meta erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Meta kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen. |
| fr | **Meta Platforms Ireland Ltd. Mesure publicitaire, uniquement avec votre consentement.** Après votre accord, Meta enregistre qu'une page de ce site a été ouverte, qu'un bouton de prix, un bouton de contact (WhatsApp, téléphone ou e-mail) ou le formulaire de contact a été utilisé, mais pas ce que vous saisissez, ainsi que les étapes d'une réservation (choisir un véhicule, passer au paiement). Quand vous choisissez un véhicule, quand vous passez au paiement et après une réservation payée, nous envoyons à Meta un message pour chacun, contenant le montant, les deux identifiants de cookies Meta, s'ils existent, et, dès que la réservation existe, sa référence. Nous n'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet ou le vol. Meta reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Meta peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies. |
| ar | **Meta Platforms Ireland Ltd. قياس الإعلانات، بموافقتك فقط.** بعد موافقتك، تسجّل Meta أنّ صفحة من هذا الموقع قد فُتحت، وأنّ زرّ السعر أو زرّ تواصل (واتساب أو الهاتف أو البريد الإلكتروني) أو نموذج الاتصال قد استُخدم، دون ما تكتبه، ومراحل الحجز (اختيار مركبة، الانتقال إلى الدفع). عندما تختار مركبة، وعندما تنتقل إلى الدفع، وبعد حجز مدفوع، نرسل إلى Meta رسالة في كل مرة تتضمن المبلغ ومعرّفَي ملفات تعريف الارتباط الخاصين بـ Meta إن وُجدا، ومرجع الحجز متى وُجد الحجز. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة. تتلقى Meta عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Meta هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط. |

## 3b. Privacy page, the new Google line

| Language | Text |
|---|---|
| en | **Google Ireland Ltd. Advert measurement, only with your consent.** After you accept, Google Ads stores two cookies that remember which advert click brought you here. After a confirmed booking we send Google one message with the amount paid, the booking reference and the advert click code those cookies hold. We do not send your name, email, phone number, route or flight. Google receives your IP address and browser details when its script loads. Google may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences. |
| de | **Google Ireland Ltd. Anzeigenmessung, nur mit Ihrer Einwilligung.** Nach Ihrer Zustimmung speichert Google Ads zwei Cookies, die sich merken, welcher Anzeigenklick Sie hierher geführt hat. Nach einer bestätigten Buchung senden wir Google eine Nachricht mit dem bezahlten Betrag, der Buchungsreferenz und dem Anzeigenklick-Code, den diese Cookies enthalten. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke oder Flug. Google erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Google kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen. |
| fr | **Google Ireland Ltd. Mesure publicitaire, uniquement avec votre consentement.** Après votre accord, Google Ads dépose deux cookies qui retiennent quel clic sur une annonce vous a amené ici. Après une réservation confirmée, nous envoyons à Google un message contenant le montant payé, la référence de réservation et le code de clic publicitaire que ces cookies contiennent. Nous n'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet ou le vol. Google reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Google peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies. |
| ar | **Google Ireland Ltd. قياس الإعلانات، بموافقتك فقط.** بعد موافقتك، تضع Google Ads ملفَّي تعريف ارتباط يتذكّران أي نقرة على إعلان أوصلتك إلى هنا. بعد حجز مؤكَّد نرسل إلى Google رسالة واحدة تتضمن المبلغ المدفوع ومرجع الحجز ورمز النقرة على الإعلان الموجود في هذين الملفين. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة. تتلقى Google عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Google هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط. |

## 4. Privacy page, processor table row (Google)

Same pattern as the Cloudflare Web Analytics row ("Site analytics, only with your consent · Cloudflare").

| Language | Text |
|---|---|
| en | Advert measurement, only with your consent · Google Ads |
| de | Anzeigenmessung, nur mit Ihrer Einwilligung · Google Ads |
| fr | Mesure publicitaire, uniquement avec votre consentement · Google Ads |
| ar | قياس الإعلانات، بموافقتك فقط · Google Ads |

Row name: **Google Ireland Ltd**. `ADR-010` list gains Google Ireland Ltd (advert measurement, consent only).

## What the owner decided on this file (done 2026-10-09)

1. Read sections 1, 2b, 3a, 3b and 4 in the language(s) he can; Arabic and French read by someone he trusts is advisable, as no lawyer has read them.
2. Adopt as his own text (all of it, or with edits he names), through the question form.
3. In the same answer: move `CONSENT_POLICY_VERSION` from `2026-10-01` to the ship day, which asks every returning visitor again.

On adoption the build job copies each table byte for byte into `app/vamos-meta-texts.js` (new keys for Google), `apps/web/i18n/messages/*.json`, and extends `owner-texts.test.ts` to compare them with this file. Until then this file is a draft and no test reads it.
