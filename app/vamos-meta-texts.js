/* Vamos Taxi - the owner's Meta and Google texts (banner, cookies rows, privacy lines, processor row), four languages.
   Sources, verbatim, never reword (D-16):
     .planning/decisions/2026-10-09-ad-tracking-wording.md  (banner, googleRow, privacyLine, googlePrivacyLine, googleProcessor)
     .planning/decisions/2026-09-30-meta-wording.md section 2 (cookiesRow, the Meta cookies row, unchanged)
     .planning/decisions/2026-10-11-ga4-wording.md  (analyticsRow, gaRow, gaPrivacyLine, gaProcessor)
     .planning/decisions/2026-10-13-gtm-wording.md  (gtmBanner, gtmRow, gtmPrivacyLine, gtmProcessor)
   Generated from those files; owner-texts.test.ts byte-compares this file against them.
   Segments: plain strings, { b: 'bold' }, { code: 'code' }. */
(function () {
  var TEXTS = {
  banner: {
    en: ['We use necessary cookies to run your booking. If you accept, Meta (Facebook and Instagram) and Google (Google Ads) may also measure visits to this site, clicks on contact buttons, the contact form, the steps of a booking and completed bookings, so we can see which adverts work. You can refuse, and you can change your choice at any time in Cookie preferences.'],
    de: ['Wir verwenden notwendige Cookies, damit Ihre Buchung funktioniert. Wenn Sie zustimmen, dürfen Meta (Facebook und Instagram) und Google (Google Ads) zusätzlich Besuche dieser Website, Klicks auf Kontaktschaltflächen, das Kontaktformular, die Schritte einer Buchung und abgeschlossene Buchungen messen, damit wir sehen, welche Anzeigen wirken. Sie können ablehnen und Ihre Wahl jederzeit in den Cookie-Einstellungen ändern.'],
    fr: ['Nous utilisons des cookies nécessaires au fonctionnement de votre réservation. Si vous acceptez, Meta (Facebook et Instagram) et Google (Google Ads) peuvent aussi mesurer les visites de ce site, les clics sur les boutons de contact, le formulaire de contact, les étapes d\'une réservation et les réservations terminées, afin que nous sachions quelles annonces fonctionnent. Vous pouvez refuser et modifier votre choix à tout moment dans les préférences de cookies.'],
    ar: ['نستخدم ملفات تعريف الارتباط الضرورية لإتمام حجزك. إذا وافقت، يمكن لشركتي Meta (فيسبوك وإنستغرام) وGoogle (إعلانات Google) أيضًا قياس زيارات هذا الموقع والنقرات على أزرار التواصل ونموذج الاتصال ومراحل الحجز والحجوزات المكتملة، لنعرف أي الإعلانات تنجح. يمكنك الرفض، ويمكنك تغيير اختيارك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
  },
  cookiesRow: {
    en: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' and ', { code: '_fbc' }, '. Set only after you accept. They let Meta recognise this browser to measure adverts. Kept for up to 90 days.'],
    de: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' und ', { code: '_fbc' }, '. Werden erst nach Ihrer Zustimmung gesetzt. Sie ermöglichen Meta, diesen Browser wiederzuerkennen, um Anzeigen zu messen. Speicherdauer bis zu 90 Tage.'],
    fr: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' et ', { code: '_fbc' }, '. Déposés uniquement après votre accord. Ils permettent à Meta de reconnaître ce navigateur pour mesurer les annonces. Conservés jusqu\'à 90 jours.'],
    ar: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). ملفا تعريف الارتباط ', { code: '_fbp' }, ' و', { code: '_fbc' }, '. لا يُوضعان إلا بعد موافقتك. يسمحان لشركة Meta بالتعرّف على هذا المتصفح لقياس الإعلانات. يُحفظان لمدة تصل إلى 90 يومًا.'],
  },
  googleRow: {
    en: [{ b: 'Google' }, ' (Google Ireland Ltd). Cookies ', { code: '_gcl_au' }, ' and ', { code: '_gcl_aw' }, '. Set only after you accept. They let Google Ads remember which advert click brought you here, to measure adverts. Kept for up to 90 days.'],
    de: [{ b: 'Google' }, ' (Google Ireland Ltd). Cookies ', { code: '_gcl_au' }, ' und ', { code: '_gcl_aw' }, '. Werden erst nach Ihrer Zustimmung gesetzt. Sie ermöglichen Google Ads, sich zu merken, welcher Anzeigenklick Sie hierher geführt hat, um Anzeigen zu messen. Speicherdauer bis zu 90 Tage.'],
    fr: [{ b: 'Google' }, ' (Google Ireland Ltd). Cookies ', { code: '_gcl_au' }, ' et ', { code: '_gcl_aw' }, '. Déposés uniquement après votre accord. Ils permettent à Google Ads de retenir quel clic sur une annonce vous a amené ici, pour mesurer les annonces. Conservés jusqu\'à 90 jours.'],
    ar: [{ b: 'Google' }, ' (Google Ireland Ltd). ملفا تعريف الارتباط ', { code: '_gcl_au' }, ' و', { code: '_gcl_aw' }, '. لا يُوضعان إلا بعد موافقتك. يسمحان لـ Google Ads بتذكّر أي نقرة على إعلان أوصلتك إلى هنا، لقياس الإعلانات. يُحفظان لمدة تصل إلى 90 يومًا.'],
  },
  privacyLine: {
    en: [{ b: 'Meta Platforms Ireland Ltd. Advert measurement, only with your consent.' }, ' After you accept, Meta records that a page of this site was opened, that a price button, a contact button (WhatsApp, phone or email) or the contact form was used, but not what you type, and the steps of a booking (choosing a vehicle, going to payment). When you choose a vehicle, when you go to payment and after a paid booking, we send Meta one message each with the amount, the two Meta cookie identifiers, if they exist, and, once the booking exists, its booking reference. We do not send your name, email, phone number, route or flight. Meta receives your IP address and browser details when its script loads. Meta may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences.'],
    de: [{ b: 'Meta Platforms Ireland Ltd. Anzeigenmessung, nur mit Ihrer Einwilligung.' }, ' Nach Ihrer Zustimmung erfasst Meta, dass eine Seite dieser Website geöffnet wurde, dass eine Preis-Schaltfläche, eine Kontakt-Schaltfläche (WhatsApp, Telefon oder E-Mail) oder das Kontaktformular benutzt wurde, nicht aber, was Sie eingeben, sowie die Schritte einer Buchung (Fahrzeug wählen, zur Zahlung gehen). Wenn Sie ein Fahrzeug wählen, wenn Sie zur Zahlung gehen und nach einer bezahlten Buchung, senden wir Meta jeweils eine Nachricht mit dem Betrag, den beiden Meta-Cookie-Kennungen, sofern vorhanden, und, sobald die Buchung besteht, ihrer Buchungsreferenz. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke oder Flug. Meta erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Meta kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen.'],
    fr: [{ b: 'Meta Platforms Ireland Ltd. Mesure publicitaire, uniquement avec votre consentement.' }, ' Après votre accord, Meta enregistre qu\'une page de ce site a été ouverte, qu\'un bouton de prix, un bouton de contact (WhatsApp, téléphone ou e-mail) ou le formulaire de contact a été utilisé, mais pas ce que vous saisissez, ainsi que les étapes d\'une réservation (choisir un véhicule, passer au paiement). Quand vous choisissez un véhicule, quand vous passez au paiement et après une réservation payée, nous envoyons à Meta un message pour chacun, contenant le montant, les deux identifiants de cookies Meta, s\'ils existent, et, dès que la réservation existe, sa référence. Nous n\'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet ou le vol. Meta reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Meta peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies.'],
    ar: [{ b: 'Meta Platforms Ireland Ltd. قياس الإعلانات، بموافقتك فقط.' }, ' بعد موافقتك، تسجّل Meta أنّ صفحة من هذا الموقع قد فُتحت، وأنّ زرّ السعر أو زرّ تواصل (واتساب أو الهاتف أو البريد الإلكتروني) أو نموذج الاتصال قد استُخدم، دون ما تكتبه، ومراحل الحجز (اختيار مركبة، الانتقال إلى الدفع). عندما تختار مركبة، وعندما تنتقل إلى الدفع، وبعد حجز مدفوع، نرسل إلى Meta رسالة في كل مرة تتضمن المبلغ ومعرّفَي ملفات تعريف الارتباط الخاصين بـ Meta إن وُجدا، ومرجع الحجز متى وُجد الحجز. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة. تتلقى Meta عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Meta هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
  },
  googlePrivacyLine: {
    en: [{ b: 'Google Ireland Ltd. Advert measurement, only with your consent.' }, ' After you accept, Google Ads stores two cookies that remember which advert click brought you here. After a confirmed booking we send Google one message with the amount paid, the booking reference and the advert click code those cookies hold. We do not send your name, email, phone number, route or flight. Google receives your IP address and browser details when its script loads. Google may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences.'],
    de: [{ b: 'Google Ireland Ltd. Anzeigenmessung, nur mit Ihrer Einwilligung.' }, ' Nach Ihrer Zustimmung speichert Google Ads zwei Cookies, die sich merken, welcher Anzeigenklick Sie hierher geführt hat. Nach einer bestätigten Buchung senden wir Google eine Nachricht mit dem bezahlten Betrag, der Buchungsreferenz und dem Anzeigenklick-Code, den diese Cookies enthalten. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke oder Flug. Google erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Google kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen.'],
    fr: [{ b: 'Google Ireland Ltd. Mesure publicitaire, uniquement avec votre consentement.' }, ' Après votre accord, Google Ads dépose deux cookies qui retiennent quel clic sur une annonce vous a amené ici. Après une réservation confirmée, nous envoyons à Google un message contenant le montant payé, la référence de réservation et le code de clic publicitaire que ces cookies contiennent. Nous n\'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet ou le vol. Google reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Google peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies.'],
    ar: [{ b: 'Google Ireland Ltd. قياس الإعلانات، بموافقتك فقط.' }, ' بعد موافقتك، تضع Google Ads ملفَّي تعريف ارتباط يتذكّران أي نقرة على إعلان أوصلتك إلى هنا. بعد حجز مؤكَّد نرسل إلى Google رسالة واحدة تتضمن المبلغ المدفوع ومرجع الحجز ورمز النقرة على الإعلان الموجود في هذين الملفين. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة. تتلقى Google عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Google هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
  },
  googleProcessor: {
    en: ['Advert measurement, only with your consent · Google Ads'],
    de: ['Anzeigenmessung, nur mit Ihrer Einwilligung · Google Ads'],
    fr: ['Mesure publicitaire, uniquement avec votre consentement · Google Ads'],
    ar: ['قياس الإعلانات، بموافقتك فقط · Google Ads'],
  },
  analyticsRow: {
    en: ['Tells us how many people visit, which pages they open and which step of a booking they abandon. Cloudflare counts without cookies; Google Analytics sets two cookies.'],
    de: ['Zeigt uns, wie viele Personen die Website besuchen, welche Seiten sie öffnen und bei welchem Buchungsschritt sie abbrechen. Cloudflare zählt ohne Cookies; Google Analytics setzt zwei Cookies.'],
    fr: ['Nous indique combien de personnes visitent le site, quelles pages elles ouvrent et à quelle étape elles abandonnent une réservation. Cloudflare compte sans cookies ; Google Analytics dépose deux cookies.'],
    ar: ['يخبرنا بعدد الزوار والصفحات التي يفتحونها والمرحلة التي يتوقفون عندها أثناء الحجز. تَعُدّ Cloudflare الزيارات دون ملفات تعريف ارتباط؛ ويضع Google Analytics ملفَّي تعريف ارتباط.'],
  },
  gaRow: {
    en: [{ b: 'Google Analytics' }, ' (Google Ireland Ltd). Cookies ', { code: '_ga' }, ' and ', { code: '_ga_<id>' }, '. Set only after you accept Analytics. They let Google Analytics count visits and recognise a returning browser. Kept for up to 90 days.'],
    de: [{ b: 'Google Analytics' }, ' (Google Ireland Ltd). Cookies ', { code: '_ga' }, ' und ', { code: '_ga_<id>' }, '. Werden erst gesetzt, wenn Sie Analyse zustimmen. Sie ermöglichen Google Analytics, Besuche zu zählen und einen wiederkehrenden Browser zu erkennen. Speicherdauer bis zu 90 Tage.'],
    fr: [{ b: 'Google Analytics' }, ' (Google Ireland Ltd). Cookies ', { code: '_ga' }, ' et ', { code: '_ga_<id>' }, '. Déposés uniquement après votre accord pour l\'analyse. Ils permettent à Google Analytics de compter les visites et de reconnaître un navigateur qui revient. Conservés jusqu\'à 90 jours.'],
    ar: [{ b: 'Google Analytics' }, ' (Google Ireland Ltd). ملفا تعريف الارتباط ', { code: '_ga' }, ' و', { code: '_ga_<id>' }, '. لا يُوضعان إلا بعد موافقتك على التحليلات. يسمحان لـ Google Analytics بعدّ الزيارات والتعرّف على متصفح يعود إلى الموقع. يُحفظان لمدة تصل إلى 90 يومًا.'],
  },
  gaPrivacyLine: {
    en: [{ b: 'Google Ireland Ltd. Site analytics, only with your consent.' }, ' After you accept Analytics, Google Analytics records which pages of this site were opened, without the part of the address after the page name, the site you came from (its name only), the buttons and booking steps listed for Meta above, and for a paid booking the amount and the booking reference. We do not send your name, email, phone number, route or flight. Google receives your IP address and browser details when its script loads. Google may process this data outside Switzerland. We keep the data in Google Analytics for 2 months. You can withdraw your consent at any time in Cookie preferences.'],
    de: [{ b: 'Google Ireland Ltd. Website-Analyse, nur mit Ihrer Einwilligung.' }, ' Nach Ihrer Zustimmung zur Analyse erfasst Google Analytics, welche Seiten dieser Website geöffnet wurden, ohne den Teil der Adresse nach dem Seitennamen, die Website, von der Sie kamen (nur ihren Namen), die oben bei Meta genannten Schaltflächen und Buchungsschritte sowie bei einer bezahlten Buchung den Betrag und die Buchungsreferenz. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke oder Flug. Google erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Google kann diese Daten ausserhalb der Schweiz verarbeiten. Wir bewahren die Daten in Google Analytics 2 Monate auf. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen.'],
    fr: [{ b: 'Google Ireland Ltd. Analyse du site, uniquement avec votre consentement.' }, ' Après votre accord pour l\'analyse, Google Analytics enregistre quelles pages de ce site ont été ouvertes, sans la partie de l\'adresse après le nom de la page, le site d\'où vous venez (son nom uniquement), les boutons et étapes de réservation énumérés pour Meta ci-dessus et, pour une réservation payée, le montant et la référence de réservation. Nous n\'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet ou le vol. Google reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Google peut traiter ces données hors de Suisse. Nous conservons les données dans Google Analytics pendant 2 mois. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies.'],
    ar: [{ b: 'Google Ireland Ltd. تحليلات الموقع، بموافقتك فقط.' }, ' بعد موافقتك على التحليلات، يسجّل Google Analytics الصفحات التي فُتحت من هذا الموقع، دون الجزء من العنوان الذي يلي اسم الصفحة، والموقع الذي أتيت منه (اسمه فقط)، والأزرار ومراحل الحجز المذكورة لـ Meta أعلاه، والمبلغ ومرجع الحجز عند الحجز المدفوع. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة. تتلقى Google عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Google هذه البيانات خارج سويسرا. نحتفظ بالبيانات في Google Analytics لمدة شهرين. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
  },
  gaProcessor: {
    en: ['Site analytics, only with your consent · Google Analytics'],
    de: ['Website-Analyse, nur mit Ihrer Einwilligung · Google Analytics'],
    fr: ['Analyse du site, uniquement avec votre consentement · Google Analytics'],
    ar: ['تحليلات الموقع، بموافقتك فقط · Google Analytics'],
  },
  gtmBanner: {
    en: ['If you accept both Analytics and Marketing, Google Tag Manager also loads; it sets no cookie of its own.'],
    de: ['Wenn Sie sowohl Analyse als auch Marketing zustimmen, wird zusätzlich Google Tag Manager geladen; er setzt keine eigenen Cookies.'],
    fr: ['Si vous acceptez à la fois l\'analyse et le marketing, Google Tag Manager est aussi chargé ; il ne dépose aucun cookie propre.'],
    ar: ['إذا وافقت على التحليلات والتسويق معًا، يُحمَّل أيضًا Google Tag Manager، ولا يضع ملف تعريف ارتباط خاصًا به.'],
  },
  gtmRow: {
    en: [{ b: 'Google Tag Manager' }, ' (Google Ireland Ltd). No cookie of its own. Loaded only after you accept both Analytics and Marketing. It starts the Google tags described above, under the choices you made.'],
    de: [{ b: 'Google Tag Manager' }, ' (Google Ireland Ltd). Kein eigenes Cookie. Wird erst geladen, wenn Sie sowohl Analyse als auch Marketing zustimmen. Er startet die oben beschriebenen Google-Tags gemäss Ihrer Auswahl.'],
    fr: [{ b: 'Google Tag Manager' }, ' (Google Ireland Ltd). Aucun cookie propre. Chargé uniquement après votre accord pour l\'analyse et pour le marketing. Il lance les balises Google décrites ci-dessus, selon vos choix.'],
    ar: [{ b: 'Google Tag Manager' }, ' (Google Ireland Ltd). لا يضع ملف تعريف ارتباط خاصًا به. لا يُحمَّل إلا بعد موافقتك على التحليلات والتسويق معًا. يُشغّل علامات Google الموضّحة أعلاه وفق اختياراتك.'],
  },
  gtmPrivacyLine: {
    en: [{ b: 'Google Ireland Ltd. Tag management, only with your consent.' }, ' After you accept both Analytics and Marketing, Google Tag Manager loads on this site and starts the Google tags described above, under the choices you made. It adds no data of its own about you, your booking or your messages. Google receives your IP address and browser details when its script loads. Google may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences; Google Tag Manager then stops on the page you are on and does not load again until you accept both again.'],
    de: [{ b: 'Google Ireland Ltd. Tag-Verwaltung, nur mit Ihrer Einwilligung.' }, ' Nach Ihrer Zustimmung zu Analyse und Marketing wird Google Tag Manager auf dieser Website geladen und startet die oben beschriebenen Google-Tags gemäss Ihrer Auswahl. Er fügt keine eigenen Daten über Sie, Ihre Buchung oder Ihre Nachrichten hinzu. Google erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Google kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen; Google Tag Manager stoppt dann auf der geöffneten Seite und wird erst wieder geladen, wenn Sie beidem erneut zustimmen.'],
    fr: [{ b: 'Google Ireland Ltd. Gestion des balises, uniquement avec votre consentement.' }, ' Après votre accord pour l\'analyse et pour le marketing, Google Tag Manager se charge sur ce site et lance les balises Google décrites ci-dessus, selon vos choix. Il n\'ajoute aucune donnée propre sur vous, votre réservation ou vos messages. Google reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Google peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies ; Google Tag Manager s\'arrête alors sur la page ouverte et ne se recharge que si vous acceptez à nouveau les deux.'],
    ar: [{ b: 'Google Ireland Ltd. إدارة العلامات، بموافقتك فقط.' }, ' بعد موافقتك على التحليلات والتسويق معًا، يُحمَّل Google Tag Manager على هذا الموقع ويُشغّل علامات Google الموضّحة أعلاه وفق اختياراتك. لا يضيف أي بيانات خاصة به عنك أو عن حجزك أو رسائلك. تتلقى Google عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Google هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط؛ عندها يتوقف Google Tag Manager على الصفحة المفتوحة ولا يُحمَّل مجددًا إلا بعد موافقتك على الأمرين من جديد.'],
  },
  gtmProcessor: {
    en: ['Tag management, only with your consent · Google Tag Manager'],
    de: ['Tag-Verwaltung, nur mit Ihrer Einwilligung · Google Tag Manager'],
    fr: ['Gestion des balises, uniquement avec votre consentement · Google Tag Manager'],
    ar: ['إدارة العلامات، بموافقتك فقط · Google Tag Manager'],
  },
  };

  /** Returns the segment array of one owner text for a language, falling back to English. */
  function segments(key, lang) {
    var t = TEXTS[key];
    if (!t) return [];
    return t[lang] || t.en;
  }

  window.VamosMetaTexts = {
    banner: TEXTS.banner,
    cookiesRow: TEXTS.cookiesRow,
    googleRow: TEXTS.googleRow,
    privacyLine: TEXTS.privacyLine,
    googlePrivacyLine: TEXTS.googlePrivacyLine,
    googleProcessor: TEXTS.googleProcessor,
    analyticsRow: TEXTS.analyticsRow,
    gaRow: TEXTS.gaRow,
    gaPrivacyLine: TEXTS.gaPrivacyLine,
    gaProcessor: TEXTS.gaProcessor,
    gtmBanner: TEXTS.gtmBanner,
    gtmRow: TEXTS.gtmRow,
    gtmPrivacyLine: TEXTS.gtmPrivacyLine,
    gtmProcessor: TEXTS.gtmProcessor,
    segments: segments,
  };
})();
