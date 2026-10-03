# Legal translations, drafts for approval (U08-11), 2026-10-03

Owner answer, 2026-10-03: "Drafts for you to approve". Nothing here is live. After approval each line goes
into `app/vamos-i18n-dict.js` verbatim and is copied into `.planning/decisions/`.

## How the lines were found

- The live legal pages are the `.dc.html` mocks: `app/pages/terms.dc.html`, `privacy.dc.html`,
  `cookies.dc.html`, `cancellation.dc.html`. Their strings live in `app/vamos-i18n-dict.js`.
- Each page was opened in Chromium from origin/main `10c3cb7d`. The page's own `VamosLocale.coverage()` was run
  on the full body in de, fr and ar. Same result in all three languages: 33 strings with no entry.
- 19 of them are sentences that need a translation (this sheet). 14 are provider and cookie names
  that stay as written in every language (list at the end, no translation).
- Count per page: terms 3, privacy 10, cookies 5, cancellation 1 = 19 rows.
  "Cloudflare Web Analytics (cookieless)" shows on privacy and cookies, so P6 and C5 are one entry.
  That makes 18 new dictionary entries.
- The Next.js legal pages (`apps/web/app/[locale]/{terms,privacy,cookies,cancellation}/page.tsx`)
  reach no customer. They still hold the older text with pending pills (`PendingSlot`
  "Dpo or not required", "Driver noshow share", "Payment methods" and others), not these edited lines.
  Noted only. Nothing to translate there.

Rules used: Swiss German ("ss", never "ß"). Names, codes and numbers stay as they are (Vamos Taxi GmbH,
CH-020.4.077.792-7, Visa, TWINT, Cloudflare, 10). Each draft says what the English says, nothing more.
Where an earlier translation of the same line exists in the dictionary, its words are reused.
In Arabic, the register number and the figure 10 sit inside `vt-dir-keep` when built.

## Terms — /terms

| # | Section | English (verbatim, on the page now) | German | French | Arabic | Note |
|---|---|---|---|---|---|---|
| T1 | 01 Who you contract with | Registered as Vamos Taxi GmbH, company number CH-020.4.077.792-7 at the commercial register of the Canton of Zurich. Full company details are on the *[imprint]*. | Eingetragen als Vamos Taxi GmbH, Firmennummer CH-020.4.077.792-7 im Handelsregister des Kantons Zürich. Alle Angaben zum Unternehmen stehen im *[Impressum]*. | Immatriculée sous le nom Vamos Taxi GmbH, numéro d’entreprise CH-020.4.077.792-7 au registre du commerce du canton de Zurich. Les coordonnées complètes figurent dans les *[mentions légales]*. | مسجّلة باسم Vamos Taxi GmbH، رقم الشركة CH-020.4.077.792-7 في السجل التجاري لكانتون زيورخ. تفاصيل الشركة كاملةً في *[بيانات الناشر]*. | The link word in *[ ]* is already translated. Joined from the two earlier dictionary fragments. "Firmennummer" is the Swiss name for this CH number. |
| T2 | 04 Fixed price · Charged separately, only if you ask for it | Oversized or unusual items declared at booking: shown on your quote. | Übergrosse oder aussergewöhnliche Gegenstände, bei der Buchung angemeldet: in Ihrem Angebot ausgewiesen. | Objets hors format ou inhabituels déclarés à la réservation : indiqué sur votre devis. | الأغراض كبيرة الحجم أو غير المعتادة المُعلَنة عند الحجز: مبيّنة في عرض السعر الخاص بك. | Same pattern as the line above it ("Extended city stay…: shown on your quote."), which is already translated this way. |
| T3 | 11 Payment | Accepted methods: Visa, Mastercard, Apple Pay, Google Pay and TWINT. | Akzeptierte Zahlungsmittel: Visa, Mastercard, Apple Pay, Google Pay und TWINT. | Moyens acceptés : Visa, Mastercard, Apple Pay, Google Pay et TWINT. | وسائل الدفع المقبولة: Visa وMastercard وApple Pay وGoogle Pay وTWINT. | **Promise.** Checkout offers TWINT only when a switch is on (`apps/web/lib/checkout/stripe.ts:134`). See question 3. |

## Privacy — /privacy

| # | Section | English (verbatim) | German | French | Arabic | Note |
|---|---|---|---|---|---|---|
| P1 | 01 Who is responsible · Data protection officer | no DPO appointed | kein Datenschutzberater ernannt | aucun délégué désigné | لم يُعيَّن مسؤول لحماية البيانات | **Legal term.** The row label is already "Datenschutzberater" (Swiss law). German law says "Datenschutzbeauftragter". See question 2. "DPO" is written out in de and ar. The row label already names the role. |
| P2 | 01 Who is responsible · Representative in the EU | none appointed | keine ernannt | aucun désigné | لم يُعيَّن أحد | Agrees with the row label ("Vertretung", "Représentant"). |
| P3 | 04 Who processes it · Supabase | Booking database and sign-in · Zurich | Buchungsdatenbank und Anmeldung · Zürich | Base de réservations et connexion · Zurich | قاعدة بيانات الحجوزات وتسجيل الدخول · زيورخ | Place is a fact: Zurich. |
| P4 | 04 Who processes it · Resend | Confirmation and driver-detail emails · used when transactional mail is on | Bestätigungs- und Fahrerdaten-E-Mails · im Einsatz, wenn der Versand von Transaktions-E-Mails aktiv ist | E-mails de confirmation et coordonnées du chauffeur · utilisé lorsque l’envoi des e-mails transactionnels est activé | رسائل التأكيد وبيانات السائق · يُستخدم عند تفعيل رسائل المعاملات | "Transactional mail" is a technical word, and each draft keeps it. |
| P5 | 04 Who processes it · Sentry | Error diagnostics · not in use | Fehlerdiagnose · nicht im Einsatz | Diagnostic des erreurs · non utilisé | تشخيص الأعطال · غير مستخدم | — |
| P6 | 04 Who processes it · row name (also /cookies 05 Analytics, Provider) | Cloudflare Web Analytics (cookieless) | Cloudflare Web Analytics (ohne Cookies) | Cloudflare Web Analytics (sans cookie) | Cloudflare Web Analytics (بدون ملفات ارتباط) | Product name stays Latin. Taken from the earlier dictionary line. One entry serves both pages. |
| P7 | 04 Who processes it · Cloudflare Web Analytics | Site analytics, only with your consent · Cloudflare | Website-Analyse, nur mit Ihrer Einwilligung · Cloudflare | Analyse du site, uniquement avec votre consentement · Cloudflare | تحليلات الموقع، بموافقتك فقط · Cloudflare | **Promise:** "only with your consent". Same words as before. |
| P8 | 06 How long we keep it · Payment records | 10 years (Swiss books) for accounting and tax. | 10 Jahre (Schweizer Geschäftsbücher) für Buchhaltung und Steuern. | 10 ans (livres comptables suisses) pour la comptabilité et la fiscalité. | 10 سنوات (الدفاتر التجارية السويسرية) للمحاسبة والضرائب. | **Number:** 10 years, unchanged. "Swiss books" is short English for the Swiss bookkeeping rule. Each draft says "Swiss business books". See question 4. |
| P9 | 06 How long we keep it · Server logs | as long as needed to run the service | so lange, wie für den Betrieb des Dienstes nötig | aussi longtemps que nécessaire au fonctionnement du service | طالما كان ذلك ضروريًا لتشغيل الخدمة | No period is named, and the drafts add none. Lower case at the start, as in English. |
| P10 | 06 How long we keep it · Consent record | as long as needed to show consent — proof of what you chose, and when. | so lange, wie nötig, um die Einwilligung zu belegen — Nachweis, was Sie gewählt haben und wann. | aussi longtemps que nécessaire pour attester du consentement — preuve de ce que vous avez choisi, et quand. | طالما كان ذلك ضروريًا لإثبات الموافقة — دليل على ما اخترته ومتى. | The part after the dash is the earlier translation, unchanged. |

## Cookies — /cookies

| # | Section | English (verbatim) | German | French | Arabic | Note |
|---|---|---|---|---|---|---|
| C1 | 03 Strictly necessary · __stripe_mid · __stripe_sid · Duration | not in use until live payments | nicht im Einsatz bis zum Start der echten Zahlungen | non utilisé avant l’activation des paiements réels | غير مستخدم حتى تفعيل المدفوعات الفعلية | "Live payments" = real card payments switched on. No date is promised. |
| C2 | 03 Strictly necessary · cf_clearance · Duration | as set by Cloudflare | wie von Cloudflare festgelegt | tel que défini par Cloudflare | كما تحدّده Cloudflare | — |
| C3 | 04 Functional · vamosLang · Duration | until you change language | bis Sie die Sprache ändern | jusqu’à ce que vous changiez de langue | إلى أن تغيّر اللغة | First half of the earlier dictionary line, unchanged. |
| C4 | 04 Functional · vamos:recent-places · Duration | until you clear it | bis Sie die letzten Orte löschen | jusqu’à ce que vous effaciez les lieux récents | إلى أن تمسح الأماكن الأخيرة | German has no clear "it" here, so each draft names what is cleared: "recent places". These are the earlier dictionary words. |
| C5 | 05 Analytics · Provider | Cloudflare Web Analytics (cookieless) | see P6 | see P6 | see P6 | Same entry as P6. |

## Cancellation — /cancellation

| # | Section | English (verbatim) | German | French | Arabic | Note |
|---|---|---|---|---|---|---|
| X1 | 05 If no driver arrives | Where our records show you were at the pickup point and no vehicle came, you receive full refund back. | Wenn unsere Aufzeichnungen zeigen, dass Sie am Abholpunkt waren und kein Fahrzeug kam, erhalten Sie eine volle Rückerstattung. | Si nos relevés montrent que vous étiez au point de prise en charge et qu’aucun véhicule n’est venu, vous êtes remboursé intégralement. | إذا أظهرت سجلاتنا أنك كنت في نقطة الانطلاق ولم تصل أي سيارة، تحصل على استرداد كامل للمبلغ. | **Promise:** full refund. The English is broken ("full refund back"). It came from a pending value, "Driver noshow share", being replaced by plain text in `ae9165bf`. The drafts say "a full refund". See question 1. |

## Optional: one more line on /cookies (U08-15, not part of U08-11)

The purpose cell next to `vamosLang` reads "Remembers whether you read the site in English or German".
It has translations, but the site has four languages. Draft only if you want it fixed in the same pass:

| # | English now | Proposed English | German | French | Arabic |
|---|---|---|---|---|---|
| C6 | Remembers whether you read the site in English or German | Remembers which language you read the site in | Merkt sich, in welcher Sprache Sie die Website lesen | Retient la langue dans laquelle vous lisez le site | يتذكّر اللغة التي تقرأ بها الموقع |

## Names that stay as written (no translation)

The build job marks these `data-vt-no-i18n` so they stop showing as gaps:
privacy `Stripe Payments Europe Ltd`, `Supabase`, `Cloudflare`, `Mapbox`, `Sentry`;
cookies `sb-yaumjzvylngfjhtuffqs-auth-token`, `Vamos Taxi · Supabase`, `__stripe_mid · __stripe_sid`,
`Stripe`, `cf_clearance`, `Cloudflare`, `vamosLang`, `vamos:recent-places`, `Sentry`.

## Questions for the owner (one decision each)

1. /cancellation, section 05: the English now reads "you receive full refund back." Change it to
   "you receive a full refund."? Recommended: yes. All three drafts already say this.
2. /privacy, section 01: German name for the data protection officer. Keep "Datenschutzberater"
   (Swiss law, already the row label)? Recommended: yes. The other choice is "Datenschutzbeauftragter"
   (German and EU law).
3. /terms, section 11: the line names TWINT as accepted, but checkout offers TWINT only when a switch is on.
   Keep TWINT in the list? (Example: a customer reads "TWINT" in German and finds only card on /checkout.)
4. /privacy, section 06: keep "(Swiss books)" in English, with "Swiss business books" in the translations?
   Or change the English to "(Swiss bookkeeping law)"? Recommended: keep the English and approve the drafts as written.
5. /cookies, section 04: fix "English or German" in the same pass (row C6)? Recommended: yes.
6. Approve the 19 lines in the tables (T1–T3, P1–P10, C1–C5, X1) as written, or mark the ones to change.
