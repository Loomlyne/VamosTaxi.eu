/* Vamos Taxi — "Last updated" date of the legal pages (privacy, terms, cancellation, imprint).
   One constant, set by the control session on the ship day (owner decision 14, 2026-09-30).
   The mocks read it here; apps/web/next.config.ts reads the same line at build time for the
   Next.js pages. Format: ISO date, YYYY-MM-DD. The cookie policy keeps its own date. */
(function () {
  var LEGAL_UPDATED = '2026-09-30';

  var LOCALES = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', ar: 'ar-u-nu-latn' };

  function label(lang) {
    var d = new Date(LEGAL_UPDATED + 'T00:00:00Z');
    try {
      return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      }).format(d);
    } catch (e) {
      return LEGAL_UPDATED;
    }
  }

  window.VamosLegalUpdated = { iso: LEGAL_UPDATED, label: label };
})();
