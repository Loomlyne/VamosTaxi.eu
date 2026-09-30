/* Vamos Taxi - the owner's three Meta texts (banner, cookies row, privacy line), four languages.
   Source: .planning/decisions/2026-09-30-meta-wording.md, verbatim, never reword (D-16).
   Generated from that file; owner-texts.test.ts byte-compares this file against it.
   Segments: plain strings, { b: 'bold' }, { code: 'code' }. */
(function () {
  var TEXTS = {
  banner: {
    en: ['We use necessary cookies to run your booking. If you accept, Meta (Facebook and Instagram) may also measure visits to this site and completed bookings, so we can see which adverts work. You can refuse, and you can change your choice at any time in Cookie preferences.'],
    de: ['Wir verwenden notwendige Cookies, damit Ihre Buchung funktioniert. Wenn Sie zustimmen, darf Meta (Facebook und Instagram) zusätzlich Besuche dieser Website und abgeschlossene Buchungen messen, damit wir sehen, welche Anzeigen wirken. Sie können ablehnen und Ihre Wahl jederzeit in den Cookie-Einstellungen ändern.'],
    fr: ['Nous utilisons des cookies nécessaires au fonctionnement de votre réservation. Si vous acceptez, Meta (Facebook et Instagram) peut aussi mesurer les visites de ce site et les réservations terminées, afin que nous sachions quelles annonces fonctionnent. Vous pouvez refuser et modifier votre choix à tout moment dans les préférences de cookies.'],
    ar: ['نستخدم ملفات تعريف الارتباط الضرورية لإتمام حجزك. إذا وافقت، يمكن لشركة Meta (فيسبوك وإنستغرام) أيضًا قياس زيارات هذا الموقع والحجوزات المكتملة، لنعرف أي الإعلانات تنجح. يمكنك الرفض، ويمكنك تغيير اختيارك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
  },
  cookiesRow: {
    en: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' and ', { code: '_fbc' }, '. Set only after you accept. They let Meta recognise this browser to measure adverts. Kept for up to 90 days.'],
    de: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' und ', { code: '_fbc' }, '. Werden erst nach Ihrer Zustimmung gesetzt. Sie ermöglichen Meta, diesen Browser wiederzuerkennen, um Anzeigen zu messen. Speicherdauer bis zu 90 Tage.'],
    fr: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). Cookies ', { code: '_fbp' }, ' et ', { code: '_fbc' }, '. Déposés uniquement après votre accord. Ils permettent à Meta de reconnaître ce navigateur pour mesurer les annonces. Conservés jusqu\'à 90 jours.'],
    ar: [{ b: 'Meta' }, ' (Meta Platforms Ireland Ltd). ملفا تعريف الارتباط ', { code: '_fbp' }, ' و', { code: '_fbc' }, '. لا يُوضعان إلا بعد موافقتك. يسمحان لشركة Meta بالتعرّف على هذا المتصفح لقياس الإعلانات. يُحفظان لمدة تصل إلى 90 يومًا.'],
  },
  privacyLine: {
    en: [{ b: 'Meta Platforms Ireland Ltd. Advert measurement, only with your consent.' }, ' After you accept, Meta records that a page of this site was opened. After a paid booking we send Meta one message with the amount paid and the two Meta cookie identifiers, if they exist. We do not send your name, email, phone number, route, flight or booking reference. Meta may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences.'],
    de: [{ b: 'Meta Platforms Ireland Ltd. Anzeigenmessung, nur mit Ihrer Einwilligung.' }, ' Nach Ihrer Zustimmung erfasst Meta, dass eine Seite dieser Website geöffnet wurde. Nach einer bezahlten Buchung senden wir Meta eine Nachricht mit dem bezahlten Betrag und den beiden Meta-Cookie-Kennungen, sofern vorhanden. Wir senden weder Ihren Namen noch E-Mail-Adresse, Telefonnummer, Strecke, Flug oder Buchungsreferenz. Meta kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen.'],
    fr: [{ b: 'Meta Platforms Ireland Ltd. Mesure publicitaire, uniquement avec votre consentement.' }, ' Après votre accord, Meta enregistre qu\'une page de ce site a été ouverte. Après une réservation payée, nous envoyons à Meta un message contenant le montant payé et les deux identifiants de cookies Meta, s\'ils existent. Nous n\'envoyons ni votre nom, ni votre e-mail, ni votre numéro de téléphone, ni le trajet, le vol ou la référence de réservation. Meta peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies.'],
    ar: [{ b: 'Meta Platforms Ireland Ltd. قياس الإعلانات، بموافقتك فقط.' }, ' بعد موافقتك، تسجّل Meta أنّ صفحة من هذا الموقع قد فُتحت. بعد حجز مدفوع نرسل إلى Meta رسالة واحدة تتضمن المبلغ المدفوع ومعرّفَي ملفات تعريف الارتباط الخاصين بـ Meta إن وُجدا. لا نرسل اسمك ولا بريدك الإلكتروني ولا رقم هاتفك ولا المسار ولا رقم الرحلة ولا مرجع الحجز. قد تعالج Meta هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط.'],
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
    privacyLine: TEXTS.privacyLine,
    segments: segments,
  };
})();
