/* Vamos Taxi — the Google tag loader (Google Ads, tag AW-368142830). Owner decisions 2026-10-09 (D2, D4).

   Runs on the mock pages AND the Next pages (it asks the server itself, it does not need the mock consent
   runtime). Loaded from the cookie banner (mock) and from the locale layout (Next).

   Before the visitor accepts Marketing nothing leaves the browser: the only thing done is a local
   `gtag('consent','default', denied)` (no request). Google's script is added to the page after ALL of these
   are true, checked in the browser:
     1. GOOGLE_ON    the owner's Google wording is live (apps/web/lib/google/flag.ts holds the same value).
     2. The address is on the list below (a path list; the query and hash never decide, and are never sent).
     3. GET /api/consent/state says marketing is on under the current consent version: the server, never the
        browser cache and never a consent event alone. Asked on every page load, so "already accepted" and
        "accepted a moment ago" are the same path.

   What Google is told: the tag id; `page_location` = origin + path with the booking reference replaced by
   :ref (never a query, never a hash, never a token); `page_referrer` = the bare origin of the previous site or
   empty; consent state; and, once, the conversion (amount, CHF, booking reference). No page_view event.

   Withdrawing (Necessary only, or Marketing off) sets every consent signal to denied, forgets the queued
   conversion and deletes Google's cookies (every domain form). Our code never writes a value into them.

   API: VamosGoogle.conversion({ value, transactionId }) -> true if sent or queued, false if refused;
   a page that runs before this script loads pushes { value, transactionId } onto window.VamosGoogleQueue (an
   array); on load each item goes through conversion() (every guard applies) and the queue object's push()
   then does the same;
   for tests: .allowed(href), .scrub(href, referrer), .loaded(), .revoked(), .pending()

   Plain browser script (not transpiled): var, function. */
(function () {
  if (window.VamosGoogle) return;

  /* Same value as apps/web/lib/google/flag.ts. Opened 2026-10-09. */
  var GOOGLE_ON = true;

  var TAG_ID = 'AW-368142830';
  var SEND_TO = 'AW-368142830/liI8CIe79pUdEO7Txa8B';
  var SRC = 'https://www.googletagmanager.com/gtag/js?id=' + TAG_ID;
  var HOST = 'vamostaxi.site';
  var ORIGIN = 'https://' + HOST;
  var SEEN_PREFIX = 'vamosGoogleConv:';
  var MAX_QUEUED = 3;

  var loaded = false;
  var revokedHere = false;
  var withdrawSeq = 0;
  var defaulted = false;
  var queued = [];

  /* ---- address list: the same pages as the Meta page view, plus the one-page checkout and the confirmation.
     Pay links, manage-booking, sign-in confirm, reset-password, review, dashboard and ops are never on it. ---- */

  var INDEXABLE = ['about', 'faq', 'contact', 'terms', 'privacy', 'cookies', 'cancellation', 'imprint'];
  var PREFIXES = ['de', 'fr', 'ar'];
  var SECTIONS = ['transfers', 'details', 'mobile', 'preferences', 'security', 'close'];
  var PATHS = ['/', '/coming-soon', '/sitemap', '/account', '/bookings', '/sign-in', '/sign-up', '/checkout'];
  (function () {
    var i, j;
    for (i = 0; i < INDEXABLE.length; i++) PATHS.push('/' + INDEXABLE[i]);
    for (i = 0; i < PREFIXES.length; i++) {
      PATHS.push('/' + PREFIXES[i]);
      PATHS.push('/' + PREFIXES[i] + '/checkout');
      for (j = 0; j < INDEXABLE.length; j++) PATHS.push('/' + PREFIXES[i] + '/' + INDEXABLE[j]);
    }
    for (i = 0; i < SECTIONS.length; i++) PATHS.push('/account/' + SECTIONS[i]);
  })();
  var CONFIRMATION_RE = /^(\/(de|fr|ar))?\/confirmation\/VT-[0-9]{2}-[0-9]{4,5}$/;

  function inList(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
    return false;
  }

  function parse(href) {
    try {
      if (typeof URL !== 'function') return null;
      return new URL(String(href));
    } catch (e) { return null; }
  }

  function allowed(href) {
    var u = parse(href);
    if (!u) return false;
    if (u.protocol !== 'https:' || u.hostname !== HOST) return false;
    if (u.port !== '' || u.username !== '' || u.password !== '') return false;
    return inList(PATHS, u.pathname) || CONFIRMATION_RE.test(u.pathname);
  }

  /* What Google is told about the page. Fixed host, the path only, the reference replaced. */
  function scrub(href, referrer) {
    var u = parse(href);
    var path = u ? u.pathname : '/';
    path = path.replace(/\/confirmation\/[^\/]+$/, '/confirmation/:ref');
    var ref = '';
    var r = referrer ? parse(referrer) : null;
    if (r && (r.protocol === 'https:' || r.protocol === 'http:')) ref = r.origin + '/';
    return { location: ORIGIN + path, referrer: ref };
  }

  /* ---- consent mode: the default is written in the page, no request ---- */

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
  }

  var DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };

  function setDefault() {
    if (defaulted) return;
    ensureGtag();
    window.gtag('consent', 'default', DENIED);
    defaulted = true;
  }

  /* ---- withdraw: deny, forget, delete what Google's script wrote. Never writes a value. ---- */

  var COOKIE_NAMES = ['_gcl_au', '_gcl_aw', '_gcl_dc', '_gcl_gb', '_gcl_gs', '_gcl_ag', '_ga', '_gid', '_gat', 'FPLC', 'FPID', '_gac_gb'];
  var COOKIE_PREFIXES = ['_ga_', '_gac_', '_gcl_', '_gat_'];

  function cookieNames() {
    var out = COOKIE_NAMES.slice();
    try {
      var all = String(document.cookie || '').split(';');
      for (var i = 0; i < all.length; i++) {
        var name = all[i].replace(/^\s+/, '').split('=')[0];
        for (var p = 0; p < COOKIE_PREFIXES.length; p++) {
          if (name.indexOf(COOKIE_PREFIXES[p]) === 0 && !inList(out, name)) out.push(name);
        }
      }
    } catch (e) { /* nothing to read */ }
    return out;
  }

  function clearGoogle() {
    try {
      var parts = (location.hostname || '').split('.');
      var domains = [''];
      for (var i = parts.length - 2; i >= 0; i--) domains.push('.' + parts.slice(i).join('.'));
      var names = cookieNames();
      for (var n = 0; n < names.length; n++) {
        for (var d = 0; d < domains.length; d++) {
          document.cookie = names[n] + '=; Max-Age=0; path=/' + (domains[d] ? '; domain=' + domains[d] : '');
        }
      }
    } catch (e) { /* nothing to clear is not an error */ }
  }

  function withdraw() {
    withdrawSeq += 1;
    queued = [];
    try {
      if (defaulted || loaded) { ensureGtag(); window.gtag('consent', 'update', DENIED); }
      if (loaded) revokedHere = true;
    } catch (e) { /* the cookies below are still removed */ }
    clearGoogle();
  }

  /* ---- start Google's script: after the server said yes ---- */

  function seenKey(id) { return SEEN_PREFIX + id; }

  function sendConversion(item) {
    try {
      var key = seenKey(item.transactionId);
      try {
        if (window.localStorage.getItem(key)) return; /* a reload, a second tab: once only */
        window.localStorage.setItem(key, String(new Date().getTime()));
      } catch (e) { /* storage unavailable: Google's own de-duplication on transaction_id still applies */ }
      window.gtag('event', 'conversion', {
        send_to: SEND_TO,
        value: item.value,
        currency: 'CHF',
        transaction_id: item.transactionId,
      });
    } catch (e) { /* ignore */ }
  }

  function flushQueued() {
    var list = queued;
    queued = [];
    for (var i = 0; i < list.length; i++) sendConversion(list[i]);
  }

  function bootGoogle(analyticsOn) {
    if (loaded || revokedHere) return;
    if (!allowed(location.href)) return; /* re-checked right before the script is added */
    try {
      ensureGtag();
      setDefault();
      loaded = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = SRC;
      document.head.appendChild(s);
      window.gtag('js', new Date());
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: analyticsOn ? 'granted' : 'denied',
      });
      var page = scrub(location.href, document.referrer);
      window.gtag('config', TAG_ID, { send_page_view: false, page_location: page.location, page_referrer: page.referrer });
      flushQueued();
    } catch (e) { /* no tag is never an error for the visitor */ }
  }

  function check() {
    if (!GOOGLE_ON) return;
    if (revokedHere) return;
    var seq = withdrawSeq;
    var mayStart = allowed(location.href);
    try {
      fetch('/api/consent/state', { credentials: 'same-origin', cache: 'no-store' }).then(function (res) {
        return res.json();
      }).then(function (r) {
        if (seq !== withdrawSeq) return; /* a withdraw happened while we asked */
        if (!r || r.ok !== true) return; /* server unreachable: do nothing */
        if (r.chosen === true && r.choice && r.choice.marketing === true) {
          if (mayStart) bootGoogle(r.choice.analytics === true);
        } else {
          withdraw();
        }
      }, function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  /* The conversion. Asked for while the tag is still starting it waits (at most three); after a withdraw, or
     when Marketing is not on, it is dropped and a later Accept does not replay it. */
  function conversion(info) {
    try {
      if (!GOOGLE_ON || revokedHere) return false;
      if (!info || typeof info !== 'object') return false;
      var value = info.value;
      var id = info.transactionId;
      if (typeof value !== 'number' || !isFinite(value) || value <= 0 || value > 50000) return false;
      if (typeof id !== 'string' || !/^VT-[0-9]{2}-[0-9]{4,5}$/.test(id)) return false;
      if (!allowed(location.href)) return false;
      var item = { value: Math.round(value * 100) / 100, transactionId: id };
      if (loaded && typeof window.gtag === 'function') { sendConversion(item); return true; }
      if (queued.length < MAX_QUEUED) queued.push(item);
      return true;
    } catch (e) { return false; }
  }

  function start() {
    if (!GOOGLE_ON) return;
    if (!allowed(location.href)) return;
    setDefault();
    /* A saved choice (either runtime) or a withdraw: the server answers, not the event. */
    window.addEventListener('vamos:consent', function (e) {
      var d = e && e.detail;
      if (d && d.marketing === true) check(); else if (d) withdraw();
    });
    window.addEventListener('vamos:consent-recorded', function () { check(); });
    check();
  }

  /* Registered first: a page restored from the back-forward cache is asked again. */
  window.addEventListener('pageshow', function (e) {
    if (!e || e.persisted !== true || !GOOGLE_ON) return;
    check();
  });

  /* Necessary only in another tab. */
  window.addEventListener('storage', function (e) {
    if (!GOOGLE_ON || !e || e.key !== 'vamosCookieConsent') return;
    var c = null;
    try { c = JSON.parse(e.newValue || 'null'); } catch (err) { c = null; }
    if (!c || c.marketing !== true) withdraw();
  });

  window.VamosGoogle = {
    conversion: conversion,
    allowed: allowed,
    scrub: scrub,
    loaded: function () { return loaded; },
    revoked: function () { return revokedHere; },
    pending: function () { return queued.length; },
  };

  /* Items pushed before this script loaded (the confirmation page can run first): each goes through the same
     guards and the once-only key. Later pushes behave the same. */
  (function () {
    var early = window.VamosGoogleQueue;
    window.VamosGoogleQueue = { push: function (item) { conversion(item); return 0; } };
    if (early && typeof early.length === 'number' && typeof early !== 'string') {
      for (var i = 0; i < early.length; i++) conversion(early[i]);
    }
  })();

  start();
})();
