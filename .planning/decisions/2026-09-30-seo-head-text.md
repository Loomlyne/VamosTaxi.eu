# Owner decision: search and tab text, and one address per language (2026-09-30)

Given through the question form in the SEO session ("Approve all as written"; "Build B now, on this branch").
The wording below is the owner's text, used verbatim by `apps/web/lib/seo/pages.json`. Nobody changes a
line without asking him. No lawyer has read it.

## Decisions

1. Titles and descriptions: the table below, four languages, nine indexable pages.
2. Language option B: English at the unprefixed address, German, French and Arabic at `/de`, `/fr`, `/ar`
   on the nine indexable pages. The language switch in the page moves the address to match, without a reload.
3. Private pages (sign-in, sign-up, reset-password, manage-booking, booking-detail, account, bookings,
   checkout, confirmation) keep one address, stay noindex, and carry no share picture.
4. Tab titles of the private pages were drafted by the agent in the same voice, not read by him. They are in
   the table file, rows with `indexable: false`.
5. Share picture: `apps/web/public/og-image.jpg`, supplied photography `hero-airport.jpg` on a charcoal scrim with the wordmark.
   No tagline.

## Text

## home  `/`  indexable: yes
- **EN** title (53): Vamos Taxi – Pre-booked taxi transfers in Switzerland
  desc (129): Book your airport or city transfer ahead of time. See a fixed price, pay online, and your driver is waiting at the agreed pickup.
- **DE** title (52): Vamos Taxi – Vorbestellte Taxifahrten in der Schweiz
  desc (140): Buchen Sie Ihre Flughafen- oder Stadtfahrt im Voraus. Sie sehen den Festpreis, zahlen online und Ihr Fahrer wartet am vereinbarten Abholort.
- **FR** title (50): Vamos Taxi – Transferts en taxi réservés en Suisse
  desc (144): Réservez votre trajet aéroport ou ville à l’avance. Vous voyez un prix fixe, vous payez en ligne et votre chauffeur vous attend au lieu convenu.
- **AR** title (50): Vamos Taxi – توصيل بسيارة أجرة بحجز مسبق في سويسرا
  desc (137): احجز رحلتك من المطار أو داخل المدينة مسبقًا. سترى سعرًا ثابتًا، وتدفع عبر الإنترنت، وسيكون السائق بانتظارك في نقطة الاستلام المتفق عليها.

## about  `/about`  indexable: yes
- **EN** title (39): About Vamos Taxi | Pre-booked transfers
  desc (140): Vamos Taxi is a Swiss company that runs pre-booked airport and city transfers. See the service, the vehicle classes and how a booking works.
- **DE** title (38): Über Vamos Taxi | Vorbestellte Fahrten
  desc (149): Vamos Taxi ist ein Schweizer Unternehmen für vorbestellte Flughafen- und Stadtfahrten. Lernen Sie Service, Fahrzeugklassen und Buchungsablauf kennen.
- **FR** title (41): À propos de Vamos Taxi | Trajets réservés
  desc (155): Vamos Taxi est une entreprise suisse de transferts aéroport et ville réservés à l’avance. Découvrez le service, les classes de véhicules et la réservation.
- **AR** title (31): عن Vamos Taxi | رحلات بحجز مسبق
  desc (105): Vamos Taxi شركة سويسرية لرحلات المطار والمدينة بحجز مسبق. تعرّف على الخدمة وفئات السيارات وكيف يتم الحجز.

## faq  `/faq`  indexable: yes
- **EN** title (39): Booking and ride questions | Vamos Taxi
  desc (119): Answers on booking, fixed prices, payment, meeting your driver, changes and cancellations for your Vamos Taxi transfer.
- **DE** title (40): Fragen zu Buchung und Fahrt | Vamos Taxi
  desc (121): Antworten zu Buchung, Festpreis, Zahlung, Treffpunkt mit Ihrem Fahrer, Änderungen und Stornierung Ihrer Vamos-Taxi-Fahrt.
- **FR** title (41): Questions sur la réservation | Vamos Taxi
  desc (155): Réponses sur la réservation, le prix fixe, le paiement, la rencontre avec votre chauffeur, les modifications et l’annulation de votre transfert Vamos Taxi.
- **AR** title (35): أسئلة عن الحجز والرحلة | Vamos Taxi
  desc (94): إجابات عن الحجز والسعر الثابت والدفع ولقاء السائق وتعديل الرحلة وإلغائها لرحلتك مع Vamos Taxi.

## contact  `/contact`  indexable: yes
- **EN** title (43): Contact Vamos Taxi | Email, phone, WhatsApp
  desc (114): Write, call or send a WhatsApp message to Vamos Taxi. Ask about a booking or a transfer and tell us what you need.
- **DE** title (46): Kontakt Vamos Taxi | E-Mail, Telefon, WhatsApp
  desc (119): Schreiben Sie Vamos Taxi, rufen Sie an oder senden Sie eine WhatsApp-Nachricht. Fragen Sie zu einer Buchung oder Fahrt.
- **FR** title (50): Contacter Vamos Taxi | E-mail, téléphone, WhatsApp
  desc (119): Écrivez à Vamos Taxi, appelez ou envoyez un message WhatsApp. Posez votre question sur une réservation ou un transfert.
- **AR** title (39): اتصل بـ Vamos Taxi | بريد، هاتف، واتساب
  desc (85): راسل Vamos Taxi أو اتصل أو أرسل رسالة واتساب. اسأل عن حجز أو رحلة وأخبرنا بما تحتاجه.

## terms  `/terms`  indexable: yes
- **EN** title (33): Terms and conditions | Vamos Taxi
  desc (93): The terms that apply when you book a transfer with Vamos Taxi GmbH. Read them before you pay.
- **DE** title (44): Allgemeine Geschäftsbedingungen | Vamos Taxi
  desc (111): Die Bedingungen, die gelten, wenn Sie eine Fahrt bei der Vamos Taxi GmbH buchen. Lesen Sie sie vor der Zahlung.
- **FR** title (33): Conditions générales | Vamos Taxi
  desc (119): Les conditions qui s’appliquent lorsque vous réservez un transfert auprès de Vamos Taxi GmbH. Lisez-les avant de payer.
- **AR** title (28): الشروط والأحكام | Vamos Taxi
  desc (68): الشروط التي تسري عند حجز رحلة لدى Vamos Taxi GmbH. اقرأها قبل الدفع.

## privacy  `/privacy`  indexable: yes
- **EN** title (27): Privacy policy | Vamos Taxi
  desc (122): How Vamos Taxi GmbH collects and uses your data when you book a transfer or use this site, and how to contact us about it.
- **DE** title (33): Datenschutzerklärung | Vamos Taxi
  desc (134): Wie die Vamos Taxi GmbH Ihre Daten bei einer Buchung oder beim Besuch dieser Website erhebt und nutzt, und wie Sie uns dazu erreichen.
- **FR** title (41): Politique de confidentialité | Vamos Taxi
  desc (139): Comment Vamos Taxi GmbH collecte et utilise vos données lors d’une réservation ou de l’usage du site, et comment nous contacter à ce sujet.
- **AR** title (27): سياسة الخصوصية | Vamos Taxi
  desc (100): كيف تجمع Vamos Taxi GmbH بياناتك وتستخدمها عند الحجز أو استخدام هذا الموقع، وكيف تتواصل معنا بشأنها.

## cookies  `/cookies`  indexable: yes
- **EN** title (20): Cookies | Vamos Taxi
  desc (84): Which cookies Vamos Taxi uses, what each one is for, and how you change your choice.
- **DE** title (20): Cookies | Vamos Taxi
  desc (86): Welche Cookies Vamos Taxi verwendet, wozu jedes dient und wie Sie Ihre Auswahl ändern.
- **FR** title (20): Cookies | Vamos Taxi
  desc (85): Quels cookies Vamos Taxi utilise, à quoi sert chacun et comment modifier votre choix.
- **AR** title (33): ملفات تعريف الارتباط | Vamos Taxi
  desc (79): ما ملفات تعريف الارتباط التي يستخدمها Vamos Taxi، ولأي غرض، وكيف تغيّر اختيارك.

## cancellation  `/cancellation`  indexable: yes
- **EN** title (37): Cancellation and changes | Vamos Taxi
  desc (78): How to cancel or change a Vamos Taxi booking and what happens to your payment.
- **DE** title (39): Stornierung und Änderungen | Vamos Taxi
  desc (90): So stornieren oder ändern Sie eine Vamos-Taxi-Buchung und was mit Ihrer Zahlung geschieht.
- **FR** title (40): Annulation et modifications | Vamos Taxi
  desc (93): Comment annuler ou modifier une réservation Vamos Taxi et ce qu’il advient de votre paiement.
- **AR** title (29): الإلغاء والتعديل | Vamos Taxi
  desc (59): كيف تلغي حجزًا لدى Vamos Taxi أو تعدّله، وماذا يحدث لدفعتك.

## imprint  `/imprint`  indexable: yes
- **EN** title (20): Imprint | Vamos Taxi
  desc (101): Company details of Vamos Taxi GmbH, Bleicherstrasse 16, 8953 Dietikon: registered office and contact.
- **DE** title (22): Impressum | Vamos Taxi
  desc (87): Firmenangaben der Vamos Taxi GmbH, Bleicherstrasse 16, 8953 Dietikon: Sitz und Kontakt.
- **FR** title (29): Mentions légales | Vamos Taxi
  desc (85): Coordonnées de Vamos Taxi GmbH, Bleicherstrasse 16, 8953 Dietikon : siège et contact.
- **AR** title (31): البيانات القانونية | Vamos Taxi
  desc (79): بيانات شركة Vamos Taxi GmbH، Bleicherstrasse 16، 8953 Dietikon: المقر والتواصل.
