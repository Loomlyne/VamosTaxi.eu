/* Vamos Taxi — "Last updated" date of the legal pages (privacy, terms, cancellation, imprint).
   One constant, set by the control session on the ship day (owner decision 14, 2026-09-30).
   The mocks read it here; apps/web/next.config.ts reads the same line at build time for the
   Next.js pages. Format: ISO date, YYYY-MM-DD. The cookie policy keeps its own date. */
(function () {
  var LEGAL_UPDATED = '2026-09-30';
  // Consent date shown on /cookies and /privacy (D-31); plan 27-10 sets it equal to CONSENT_POLICY_VERSION.
  var CONSENT_UPDATED = '2026-10-01';

  var LOCALES = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', ar: 'ar-u-nu-latn' };

  function fmt(iso, lang) {
    var d = new Date(iso + 'T00:00:00Z');
    try {
      return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      }).format(d);
    } catch (e) {
      return iso;
    }
  }

  function label(lang) { return fmt(LEGAL_UPDATED, lang); }
  function consentLabel(lang) { return fmt(CONSENT_UPDATED, lang); }

  window.VamosLegalUpdated = { iso: LEGAL_UPDATED, label: label, consentIso: CONSENT_UPDATED, consentLabel: consentLabel };
})();
