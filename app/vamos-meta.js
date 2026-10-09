/* Vamos Taxi — the mock pages' Meta loader (Phase 28; events added 2026-10-09).

   PageView, plus three fixed events sent through VamosMeta.track(): ViewContent (the price button),
   Lead (the contact form was sent) and Contact (a WhatsApp, phone or email button). Each carries at most
   one fixed word, never a number, an address or typed text. Never in any HTML the server sends (D-05):
   this file adds Meta's script to the page after every check below has passed, and only then. Nothing
   else goes to Meta: no other event, no user data in init, no noscript image. The booking steps
   (vehicle chosen, go to payment, paid) go from our server, never from this file.

   A page view may be counted only when ALL of these are true, checked in the browser:
     1. GATE_OPEN    the owner's three legal texts are live (apps/web/lib/meta/legal-gate.ts).
     2. SWITCHES_OFF the owner reported both Events Manager switches off
                     (.planning/decisions/2026-10-01-meta-events-manager-switches.md).
        Both constants are pinned by a test to the TypeScript flags. Phase 28 plan 28-07 sets them.
     3. The address is on the allow-list below (D-01..D-03) and the referrer is clean.
     4. GET /api/consent/state says marketing is on under the current consent version — the server,
        never the browser cache and never the 'vamos:consent' event alone (D-04).

   Withdrawing (Necessary only, or Marketing off) on a page where the pixel runs revokes Meta's
   consent at once, never allows it again on that page, and deletes the cookies _fbp / _fbc (every
   domain form) and Meta's two local storage keys. Our code never writes a value into those cookies.

   Load it in <helmet> AFTER vamos-consent.js (the cookie banner does):
     <script src="../vamos-consent.js"></script>
     <script src="../vamos-meta.js"></script>

   API: VamosMeta.track(name, params), and for tests VamosMeta.allowed(href, referrer), .loaded(), .revoked(),
   .pending()

   Plain browser script (not transpiled): var, function. */
(function () {
  if (window.VamosMeta) return;

  /* Flipped by plan 28-07 only, one line each. */
  var GATE_OPEN = true;
  var SWITCHES_OFF = true;
  /* Opened 2026-10-09. Real events, after Marketing is accepted. Same value as the server flag. */
  var EVENTS_ON = true;

  var PIXEL_ID = '1595596972063765';
  var SRC = 'https://connect.facebook.net/en_US/fbevents.js';
  var HOST = 'vamostaxi.site';
  var CACHE_KEY = 'vamosCookieConsent';

  var loaded = false;
  var revokedHere = false;
  var withdrawSeq = 0;
  var queued = []; /* events asked for before the pixel booted; sent right after the PageView, dropped on withdraw */
  var lastSent = {}; /* name + word -> time, so one press never counts twice */

  /* ---- allow-list: the same rules as apps/web/lib/meta/pixel-pages.ts (shared table in tests) ---- */

  var INDEXABLE = ['about', 'faq', 'contact', 'terms', 'privacy', 'cookies', 'cancellation', 'imprint'];
  var PREFIXES = ['de', 'fr', 'ar'];
  var SECTIONS = ['transfers', 'details', 'mobile', 'preferences', 'security', 'close'];
  var PATHS = ['/', '/coming-soon', '/sitemap', '/account', '/bookings', '/sign-in', '/sign-up'];
  (function () {
    var i, j;
    for (i = 0; i < INDEXABLE.length; i++) PATHS.push('/' + INDEXABLE[i]);
    for (i = 0; i < PREFIXES.length; i++) {
      PATHS.push('/' + PREFIXES[i]);
      for (j = 0; j < INDEXABLE.length; j++) PATHS.push('/' + PREFIXES[i] + '/' + INDEXABLE[j]);
    }
    for (i = 0; i < SECTIONS.length; i++) PATHS.push('/account/' + SECTIONS[i]);
  })();

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

  function urlAllowed(href) {
    var u = parse(href);
    if (!u) return false;
    if (u.protocol !== 'https:' || u.hostname !== HOST) return false;
    if (u.port !== '' || u.username !== '' || u.password !== '') return false;
    if (!inList(PATHS, u.pathname)) return false;

    if (u.pathname === '/sign-in' || u.pathname === '/sign-up') {
      if (u.href.indexOf('?') !== -1) return false;
    } else if (u.search !== '') {
      var parts = u.search.slice(1).split('&');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '') continue;
        var eq = parts[i].indexOf('=');
        var key = (eq === -1 ? parts[i] : parts[i].slice(0, eq)).replace(/\+/g, ' ');
        try { key = decodeURIComponent(key); } catch (e) { /* raw key, it will not match below */ }
        if (key === 'service') {
          /* The service link (/?service=airport#book): one lower-case word, read raw (no escapes). */
          if (eq === -1 || !/^[a-z_-]{1,32}$/.test(parts[i].slice(eq + 1))) return false;
        } else if (key !== 'fbclid' && !/^utm_[a-z_]+$/.test(key)) return false;
      }
    }

    if (u.hash !== '' && !/^#[A-Za-z0-9_-]{1,64}$/.test(u.hash)) return false;

    /* Decoded once strictly (an undecodable address fails closed), then again leniently, level by level,
       so a double-encoded @ (%2540) or reference (vt%252D1) cannot slip through. Anything that still
       changes after five rounds is refused. */
    var decoded;
    try { decoded = decodeURIComponent(u.href); } catch (e) { return false; }
    for (var round = 0; ; round++) {
      if (/vt-\d/i.test(decoded) || decoded.indexOf('@') !== -1) return false;
      var next = decoded.replace(/%([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
      if (next === decoded) return true;
      if (round >= 5) return false;
      decoded = next;
    }
  }

  /* Meta's own registrable domains. A referrer from one of them (the redirect page an advert click passes
     through, l.facebook.com/l.php?u=...&h=..., is long by Meta's design) is accepted with its full address,
     but only when it is verified here: whole labels, never a suffix of another name. */
  var META_DOMAINS = ['facebook.com', 'instagram.com', 'messenger.com', 'threads.net', 'fb.com', 'fb.me'];

  function metaHost(h) {
    for (var i = 0; i < META_DOMAINS.length; i++) {
      var d = META_DOMAINS[i];
      if (h === d || (h.length > d.length + 1 && h.slice(-(d.length + 1)) === '.' + d)) return true;
    }
    return false;
  }

  function metaReferrerAllowed(ref) {
    if (ref.length > 2048 || ref.indexOf('#') !== -1) return false;
    var u = parse(ref);
    if (!u) return false;
    if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '' || u.hash !== '') return false;
    if (!metaHost(u.hostname)) return false;
    /* No e-mail address and no booking reference anywhere in it, however often it is escaped. */
    var decoded;
    try { decoded = decodeURIComponent(u.href); } catch (e) { return false; }
    for (var round = 0; ; round++) {
      if (/vt-\d/i.test(decoded) || decoded.indexOf('@') !== -1) return false;
      var next = decoded.replace(/%([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
      if (next === decoded) return true;
      if (round >= 5) return false;
      decoded = next;
    }
  }

  /* The previous address travels to Meta as 'rl'. Fail closed (research Pattern 3). A page of ours
     counts only when the previous page was a clean one or the bare origin; a Meta product counts with its
     full verified address (above); any other site counts only when it sent just its bare origin (path '/',
     no query, no hash), so no outside address, with a token or a name in it, can ride along. */
  function referrerAllowed(ref) {
    if (!ref) return true;
    var u = parse(ref);
    if (!u) return false;
    var bare = u.pathname === '/' && ref.indexOf('?') === -1 && ref.indexOf('#') === -1;
    var h = u.hostname;
    if (h === HOST || h.slice(-(HOST.length + 1)) === '.' + HOST) {
      return bare || urlAllowed(ref);
    }
    return bare || metaReferrerAllowed(ref);
  }

  function allowed(href, referrer) {
    return urlAllowed(href) && referrerAllowed(referrer || '');
  }

  /* ---- withdraw: delete what Meta's script wrote in this browser. Never writes a value. ---- */

  function clearMeta() {
    try {
      var parts = (location.hostname || '').split('.');
      var domains = [''];
      for (var i = parts.length - 2; i >= 0; i--) domains.push('.' + parts.slice(i).join('.'));
      var names = ['_fbp', '_fbc', '_fbleid'];
      for (var n = 0; n < names.length; n++) {
        for (var d = 0; d < domains.length; d++) {
          document.cookie = names[n] + '=; Max-Age=0; path=/' + (domains[d] ? '; domain=' + domains[d] : '');
        }
      }
    } catch (e) { /* nothing to clear is not an error */ }
    var keys = ['multiFbc', 'aemSource'];
    for (var k = 0; k < keys.length; k++) {
      try { localStorage.removeItem(keys[k]); } catch (e) { /* storage unavailable */ }
    }
  }

  function withdraw() {
    withdrawSeq += 1;
    queued = [];
    try {
      if (loaded && window.fbq) {
        window.fbq('consent', 'revoke');
        revokedHere = true;
      }
    } catch (e) { /* the cookies below are still removed */ }
    clearMeta();
  }

  /* ---- the three browser events: a fixed list, a fixed word each, never a number, an address or text ---- */

  var EVENTS = {
    ViewContent: { key: 'content_name', words: ['transfer'] },
    Lead: { key: null, words: [] },
    Contact: { key: 'content_category', words: ['whatsapp', 'phone', 'email'] },
  };
  var MAX_QUEUED = 5;

  /* Returns the parameter object to send, or null when the name or the word is not on the list. */
  function eventParams(name, params) {
    if (!Object.prototype.hasOwnProperty.call(EVENTS, name)) return null;
    var def = EVENTS[name];
    if (def.key === null) return {};
    var word = params && typeof params === 'object' ? params[def.key] : undefined;
    if (typeof word !== 'string' || !inList(def.words, word)) return null;
    var out = {};
    out[def.key] = word;
    return out;
  }

  function sendNow(item) {
    try { window.fbq('track', item.name, item.params); } catch (e) { /* ignore */ }
  }

  function flushQueued() {
    var list = queued;
    queued = [];
    for (var i = 0; i < list.length; i++) sendNow(list[i]);
  }

  /* Same four checks as the page view: both flags, the address, and a server-confirmed Marketing consent.
     Before the pixel has started the event waits (at most five); after a withdraw it is dropped. */
  function track(name, params) {
    try {
      if (!GATE_OPEN || !SWITCHES_OFF || !EVENTS_ON || revokedHere) return false;
      var p = eventParams(name, params);
      if (p === null) return false;
      if (!allowed(location.href, document.referrer)) return false;
      var stamp = name + ':' + (p.content_name || p.content_category || '');
      var now = new Date().getTime();
      if (lastSent[stamp] && now - lastSent[stamp] < 1500) return false;
      lastSent[stamp] = now;
      var item = { name: name, params: p };
      if (loaded && window.fbq) { sendNow(item); return true; }
      if (queued.length < MAX_QUEUED) queued.push(item);
      return true;
    } catch (e) { return false; }
  }

  /* One capturing listener for every WhatsApp, phone and email link of every mock page (also the ones a
     component adds later). It reads the kind from the link address and sends only the kind. */
  function contactKind(href) {
    var h = String(href || '').replace(/^\s+/, '').toLowerCase();
    if (h.indexOf('tel:') === 0) return 'phone';
    if (h.indexOf('mailto:') === 0) return 'email';
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)(\/|\?|$)/.test(h)) return 'whatsapp';
    return null;
  }

  function onContactClick(e) {
    try {
      var el = e && e.target;
      for (var i = 0; el && i < 8; i++, el = el.parentNode) {
        if (el.getAttribute && el.tagName && String(el.tagName).toLowerCase() === 'a') {
          var kind = contactKind(el.getAttribute('href'));
          if (kind) track('Contact', { content_category: kind });
          return;
        }
      }
    } catch (err) { /* a click is never an error for the visitor */ }
  }

  /* ---- start Meta's script: stub first, then the script, exactly one PageView queued ---- */

  function bootPixel() {
    if (loaded || revokedHere || window.fbq) return; /* another fbq on the page: fail closed */
    if (!allowed(location.href, document.referrer)) return; /* re-checked right before the stub is built */
    try {
      var n = function () {
        if (n.callMethod) n.callMethod.apply(n, arguments);
        else n.queue.push(arguments);
      };
      window.fbq = n;
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      n.disablePushState = true; /* no automatic page view when the address changes in place */
      loaded = true;
      window.fbq('set', 'autoConfig', false, PIXEL_ID); /* before init, with the id */
      window.fbq('set', 'autoConfig', false); /* and globally */
      window.fbq('init', PIXEL_ID); /* the id only: no user data, ever */
      window.fbq('track', 'PageView');
      flushQueued();
      var s = document.createElement('script');
      s.async = true;
      s.src = SRC;
      document.head.appendChild(s);
    } catch (e) { /* no pixel is never an error for the visitor */ }
  }

  function check() {
    if (!GATE_OPEN || !SWITCHES_OFF) { clearMeta(); return; }
    if (revokedHere) return;
    var consent = window.VamosConsent;
    if (!consent || typeof consent.state !== 'function') return;
    /* Pages that are not on the allow-list never start the pixel, but they still remove what Meta left in
       this browser when the server says marketing is not on (CR-01 b). */
    var mayStart = allowed(location.href, document.referrer);
    var seq = withdrawSeq;
    try {
      consent.state().then(function (r) {
        if (seq !== withdrawSeq) return; /* a withdraw happened while we asked */
        if (!r || r.ok !== true) return; /* server unreachable: do nothing */
        if (r.chosen === true && r.choice && r.choice.marketing === true) { if (mayStart) bootPixel(); }
        else withdraw(); /* revokes Meta's consent when the pixel already runs here, and deletes what it left */
      }, function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  function start() {
    try {
      window.VamosConsent.onChange(function (detail) {
        if (detail && detail.marketing === true) check(); /* the server answers, not the event */
        else withdraw();
      });
    } catch (e) { /* no subscription: the next page load still decides */ }
    check();
  }

  /* Registered first, before Meta's script exists, so it runs before Meta's own handler: a page
     restored from the back-forward cache must not count after a withdraw. */
  window.addEventListener('pageshow', function (e) {
    if (!e || e.persisted !== true) return;
    try {
      var c = window.VamosConsent && typeof window.VamosConsent.cached === 'function' ? window.VamosConsent.cached() : null;
      if (loaded && window.fbq && (revokedHere || !(c && c.marketing === true))) window.fbq('consent', 'revoke');
    } catch (err) { /* ignore */ }
    check();
  });

  /* Necessary only in another tab. */
  window.addEventListener('storage', function (e) {
    if (!e || e.key !== CACHE_KEY) return;
    var c = null;
    try { c = JSON.parse(e.newValue || 'null'); } catch (err) { c = null; }
    if (!c || c.marketing !== true) withdraw();
  });

  if (typeof document.addEventListener === 'function') document.addEventListener('click', onContactClick, true);

  window.VamosMeta = {
    track: track,
    allowed: allowed,
    loaded: function () { return loaded; },
    revoked: function () { return revokedHere; },
    pending: function () { return queued.length; },
  };

  /* Wait for the consent runtime, 5 s at most (same poll as the cookie banner). */
  var tries = 0;
  (function wait() {
    if (window.VamosConsent) { start(); return; }
    tries += 1;
    if (tries > 100) return;
    setTimeout(wait, 50);
  })();
})();
