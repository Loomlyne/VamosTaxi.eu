/* Vamos Taxi — "Last updated" date of each legal page (terms, cancellation, imprint, privacy, cookies).
   Each page shows the day its own text last changed (owner, 2026-10-05, replacing the single
   ship-day constant of decision 14, 2026-09-30). Set a page's line on the day that page's text
   changes. It is a display date only: it is NOT the consent version. CONSENT_POLICY_VERSION in
   apps/web/lib/consent/policy.ts decides when visitors are asked for consent again, and changing
   a date here never touches it.
   The mocks read it here; apps/web/next.config.ts reads the same block at build time for the
   Next.js pages. Format: ISO date, YYYY-MM-DD, one line per page. */
(function () {
  var UPDATED = {
    cancellation: '2026-10-05', // flight lines (04); last text change before: 2026-10-03, 3cac1fc5
    cookies: '2026-10-04', // vt-auth cookie row, bce75750 / 5a027e71
    imprint: '2026-10-05', // 09 internal note removed
    privacy: '2026-10-05', // flight lines (02); last text change before: 2026-10-04, 5a027e71
    terms: '2026-10-05', // flight lines (06, 08); last text change before: 2026-10-03, 3cac1fc5
  };

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

  /** ISO date of a page's own last text change, '' for a page that has none. */
  function iso(page) { return UPDATED[page] || ''; }
  /** The same date written out in the active language, '' for a page that has none. */
  function label(page, lang) { return UPDATED[page] ? fmt(UPDATED[page], lang) : ''; }

  window.VamosLegalUpdated = { iso: iso, label: label };
})();
