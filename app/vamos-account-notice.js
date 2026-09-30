/* Vamos Taxi - the sign-up account notice (owner-approved Text 1), four languages.
   Source: checkout.acctCreateNotice in apps/web/i18n/messages/{en,de,fr,ar}.json, from
   .planning/decisions/2026-09-29-checkout-account-notice.md. Never reword.
   Generated from the message files; apps/web/lib/auth/signup-notice-mock.test.ts pins this file to them.
   Segments: plain strings, { terms: 'link text' }, { privacy: 'link text' }. */
(function () {
  var NOTICE = {
    en: ['By creating an account you accept our ', { terms: 'Terms' }, ' and confirm you have read our ', { privacy: 'Privacy notice' }, '.'],
    de: ['Mit dem Erstellen eines Kontos akzeptieren Sie unsere ', { terms: 'AGB' }, ' und bestätigen, dass Sie unsere ', { privacy: 'Datenschutzerklärung' }, ' gelesen haben.'],
    fr: ['En créant un compte, vous acceptez nos ', { terms: 'conditions générales' }, ' et confirmez avoir lu notre ', { privacy: 'déclaration de confidentialité' }, '.'],
    ar: ['بإنشاء حساب، فإنك توافق على ', { terms: 'الشروط والأحكام' }, ' وتؤكد أنك قرأت ', { privacy: 'إشعار الخصوصية' }, '.'],
  };

  /** Returns the segment array of the account notice for a language, falling back to English. */
  function segments(lang) {
    return NOTICE[lang] || NOTICE.en;
  }

  window.VamosAccountNotice = {
    createNotice: NOTICE,
    segments: segments,
  };
})();
