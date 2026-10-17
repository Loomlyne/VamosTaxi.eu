/* Vamos Taxi — the Google tag loader: Google Ads (AW-368142830, owner decisions 2026-10-09 D2, D4) and Google
   Analytics 4 (G-K5MZME44P6, adopted wording .planning/decisions/2026-10-11-ga4-wording.md). One gtag.js library,
   one script, two configs, each under its own consent choice. Google Tag Manager (GTM-KPKGT4VH) runs behind
   GTM_ON, off since 2026-10-15 (agency container duplicates the Ads and GA4 tags; see .planning/decisions/2026-10-15-gtm-off.md).

   Runs on the mock pages AND the Next pages (it asks the server itself, it does not need the mock consent
   runtime). Loaded from the cookie banner (mock) and from the locale layout (Next).

   Consent Mode v2 ADVANCED since 2026-10-16 (owner decision .planning/decisions/2026-10-16-tracking-before-consent.md,
   adopted wording 2026-10-16-google-advanced-consent-wording.md). On every listed page, for every visitor:
   `gtag('consent','default', denied)` first, then Google's script, ads_data_redaction on, url_passthrough never set.
   While denied Google sets no cookie and gets cookieless pings. The Ads and GA4 configs and the one GA4 page_view
   go out once, after GET /api/consent/state has answered (so an accepted visitor is counted once, with its
   cookies), or denied after 1.5 s / an unreachable server. While denied: the GA4 events of the fixed list, and for a
   paid booking a conversion and a purchase with the amount and CHF only, never the booking reference.
   Granting needs ALL of these, checked in the browser:
     1. GOOGLE_ON    the owner's Google wording is live (apps/web/lib/google/flag.ts holds the same value).
     2. The address is on the list below (a path list; the query and hash never decide, and are never sent).
     3. GET /api/consent/state says Marketing or Analytics is on under the current consent version: the server,
        never the browser cache and never a consent event alone. Asked on every page load, so "already
        accepted" and "accepted a moment ago" are the same path.
   Then, each purpose granted only under its own choice:
     Marketing on  -> the Google Ads config; ad_storage and ad_user_data granted; ad_personalization stays
                      denied (remarketing wording not adopted).
     Analytics on  -> the GA4 config (ANALYTICS_ON); analytics_storage granted; one page_view; cookies kept
                      90 days; Google signals and ad personalisation signals off.
     Analytics only -> every ad_* signal denied, no Ads config. Marketing only -> no GA4, analytics_storage denied.
     A later choice on the same page (Analytics then Marketing, or the reverse) adds the other config to the
     script already there, without loading it again.
     Both on and GTM_ON -> Google Tag Manager's container, after the consent default; no noscript frame, ever.

   What Google is told: the tag ids; `page_location` = origin + path with the booking reference replaced by
   :ref (never a query, never a hash, never a token); `page_referrer` = the bare origin of the previous site or
   empty; `page_title` = that same path (the confirmation title holds the reference); consent state. Ads: once,
   the conversion (amount, CHF, booking reference); no page_view. GA4: one page_view, the button and booking-step
   events Meta gets (a fixed list, no value, no word but the contact kind) and, once, the purchase (amount, CHF,
   booking reference). Never a name, email, phone, route, flight or typed text.

   Withdrawing a choice stops only that choice on this page and never starts it again here: Marketing off
   denies the ad signals, forgets the queued conversion and deletes the Ads cookies; Analytics off denies
   analytics_storage, forgets the queued events and deletes `_ga` and `_ga_*`. Every domain form. Once Tag
   Manager has run on the page it cannot be unloaded, so withdrawing either choice there stops everything
   Google on that page. Our code never writes a value into Google's cookies.

   API: VamosGoogle.conversion({ value, transactionId }) -> true if sent or queued, false if refused (the Ads
   conversion under Marketing, the GA4 purchase under Analytics);
   a page that runs before this script loads pushes { value, transactionId } onto window.VamosGoogleQueue (an
   array); on load each item goes through conversion() (every guard applies) and the queue object's push()
   then does the same;
   VamosGoogle.track(name, params) -> the GA4 event for one of Meta's event names (below);
   for tests: .allowed(href), .scrub(href, referrer), .loaded(), .revoked(), .pending(), .analyticsLoaded(),
   .analyticsRevoked(), .tagManagerLoaded(), .pendingEvents()

   Plain browser script (not transpiled): var, function. */
(function () {
  if (window.VamosGoogle) return;

  /* Same value as apps/web/lib/google/flag.ts. Opened 2026-10-09. */
  var GOOGLE_ON = true;
  /* GA4, same value as GA4_OPEN in apps/web/lib/google/flag.ts. Wording adopted 2026-10-11. */
  var ANALYTICS_ON = true;
  /* Google Tag Manager, same value as GTM_OPEN in apps/web/lib/google/flag.ts. Wording adopted 2026-10-13
     (.planning/decisions/2026-10-13-gtm-wording.md). Only with Analytics AND Marketing on.
     Off 2026-10-15 (duplicate tags), ON again 2026-10-16: the controller read the live container's published tags
     as empty (.planning/decisions/2026-10-16-tracking-before-consent.md). OFF again 2026-10-17 (owner: the empty
     container is the "off" Google tag; keep G-K5MZME44P6). */
  var GTM_ON = false;

  var TAG_ID = 'AW-368142830';
  var SEND_TO = 'AW-368142830/liI8CIe79pUdEO7Txa8B';
  var GA_ID = 'G-K5MZME44P6';
  var GTM_ID = 'GTM-KPKGT4VH';
  var GOOGLE_HOST = 'https://www.googletagmanager.com';
  var GA_COOKIE_SECONDS = 7776000; /* 90 days, the adopted cookies row */
  var HOST = 'vamostaxi.site';
  var ORIGIN = 'https://' + HOST;
  var SEEN_PREFIX = 'vamosGoogleConv:';
  var GA_SEEN_PREFIX = 'vamosGaPurchase:';
  var MAX_QUEUED = 3;
  var MAX_EVENTS = 5;
  var CONFIG_WAIT_MS = 1500;

  var scriptAdded = false;
  var adsOn = false;
  var gaOn = false;
  var gtmOn = false;
  var adsRevoked = false;
  var gaRevoked = false;
  var gtmRevoked = false;
  var answered = false;
  var withdrawSeq = 0;
  var defaulted = false;
  var configured = false; /* the Ads and GA4 configs (and the one page_view) went out, granted or denied */
  var queued = [];
  var events = [];
  var lastSent = {};

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
    return { location: ORIGIN + path, referrer: ref, title: path };
  }

  /* Read each time: a page that changes its address in place is described by the current path. */
  function pageFields() {
    return scrub(location.href, document.referrer);
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

  /* What is granted on this page now. Each purpose only while its own config runs. */
  function consentNow() {
    var ads = adsOn && !adsRevoked ? 'granted' : 'denied';
    return {
      ad_storage: ads,
      ad_user_data: ads,
      /* Owner 2026-10-12: remarketing off until he adopts its wording. Measurement only. */
      ad_personalization: 'denied',
      analytics_storage: gaOn && !gaRevoked ? 'granted' : 'denied',
    };
  }

  /* ---- withdraw: deny, forget, delete what Google's script wrote. Never writes a value. ---- */

  var ADS_NAMES = ['_gcl_au', '_gcl_aw', '_gcl_dc', '_gcl_gb', '_gcl_gs', '_gcl_ag', '_gac_gb'];
  var ADS_PREFIXES = ['_gac_', '_gcl_'];
  var GA_NAMES = ['_ga', '_gid', '_gat', 'FPLC', 'FPID'];
  var GA_PREFIXES = ['_ga_', '_gat_'];

  function cookieNames(names, prefixes) {
    var out = names.slice();
    try {
      var all = String(document.cookie || '').split(';');
      for (var i = 0; i < all.length; i++) {
        var name = all[i].replace(/^\s+/, '').split('=')[0];
        for (var p = 0; p < prefixes.length; p++) {
          if (name.indexOf(prefixes[p]) === 0 && !inList(out, name)) out.push(name);
        }
      }
    } catch (e) { /* nothing to read */ }
    return out;
  }

  function clearCookies(names, prefixes) {
    try {
      var parts = (location.hostname || '').split('.');
      var domains = [''];
      for (var i = parts.length - 2; i >= 0; i--) domains.push('.' + parts.slice(i).join('.'));
      var list = cookieNames(names, prefixes);
      for (var n = 0; n < list.length; n++) {
        for (var d = 0; d < domains.length; d++) {
          document.cookie = list[n] + '=; Max-Age=0; path=/' + (domains[d] ? '; domain=' + domains[d] : '');
        }
      }
    } catch (e) { /* nothing to clear is not an error */ }
  }

  /* Owner 2026-10-17 ("remove the off one, keep the active one"; filter approved in the question form):
     Google's served config for the Ads tag AW-368142830 still links the agency's old GA4 G-JW17PMTRE9, which the
     owner cannot reach (his Google login has no Ads account). Its hits are dropped here and its cookie is
     cleared. Only a /g/collect request whose tid is exactly that id: G-K5MZME44P6 and the Ads tag are untouched.
     This file runs from <head> before gtag.js, so the wrap is in place before the first hit. */
  var DEAD_GA4_COOKIE = '_ga_JW17PMTRE9';
  function deadHit(u) {
    try {
      var s = String(u && typeof u === 'object' && typeof u.url === 'string' ? u.url : u);
      return s.indexOf('/g/collect') !== -1 && /[?&]tid=G-JW17PMTRE9(&|$)/.test(s);
    } catch (e) { return false; }
  }
  function clearDeadGa4() {
    try { if (String(document.cookie || '').indexOf(DEAD_GA4_COOKIE + '=') === -1) return; } catch (e) { return; }
    clearCookies([DEAD_GA4_COOKIE], []);
  }
  (function () {
    if (!GOOGLE_ON) return;
    try {
      var f = window.fetch;
      if (typeof f === 'function') {
        window.fetch = function (input) {
          if (deadHit(input)) return Promise.resolve(new Response(null, { status: 204 }));
          return f.apply(this, arguments);
        };
      }
      var nav = window.navigator;
      var beacon = nav && nav.sendBeacon;
      if (typeof beacon === 'function') {
        nav.sendBeacon = function (url) {
          if (deadHit(url)) return true;
          return beacon.apply(nav, arguments);
        };
      }
    } catch (e) { /* no wrap: the hit goes, nothing else breaks */ }
    clearDeadGa4();
    setTimeout(clearDeadGa4, 4000);
    window.addEventListener('vamos:consent', function () { setTimeout(clearDeadGa4, 3000); });
  })();

  /* ads: Marketing is off; analytics: Analytics is off. Where Tag Manager has run, either stops both.
     fromServer: the server's own answer, which must not cancel another answer still on its way. */
  function withdraw(ads, analytics, fromServer) {
    if (!ads && !analytics) return;
    if (!fromServer) withdrawSeq += 1;
    if (gtmOn) { ads = true; analytics = true; gtmRevoked = true; }
    /* The server's first answer keeps what waits: configure() sends it cookieless (decision defaults 1 and 2,
       2026-10-16). Only the visitor's own withdraw on this page forgets it. */
    if (!fromServer) {
      if (ads && analytics) queued = [];
      if (analytics) events = [];
    }
    var changed = (ads && adsOn && !adsRevoked) || (analytics && gaOn && !gaRevoked);
    if (ads && adsOn) adsRevoked = true;
    if (analytics && gaOn) gaRevoked = true;
    try {
      /* Both off: everything denied, as it always was. One off: the update only when it ran on this page. */
      if (ads && analytics ? defaulted || scriptAdded : changed) {
        ensureGtag();
        window.gtag('consent', 'update', ads && analytics ? DENIED : consentNow());
      }
    } catch (e) { /* the cookies below are still removed */ }
    if (ads) clearCookies(ADS_NAMES, ADS_PREFIXES);
    if (analytics) clearCookies(GA_NAMES, GA_PREFIXES);
  }

  /* ---- the conversion (Ads) and the purchase (GA4): once per booking reference each ---- */

  /* Writes the once-only key before the send; false when this browser already sent it. */
  function firstTime(prefix, id) {
    try {
      var key = prefix + id;
      if (window.localStorage.getItem(key)) return false; /* a reload, a second tab: once only */
      window.localStorage.setItem(key, String(new Date().getTime()));
    } catch (e) { /* storage unavailable: Google's own de-duplication on transaction_id still applies */ }
    return true;
  }

  function sendConversion(item) {
    try {
      if (!firstTime(SEEN_PREFIX, item.transactionId)) return;
      window.gtag('event', 'conversion', {
        send_to: SEND_TO,
        value: item.value,
        currency: 'CHF',
        transaction_id: item.transactionId,
      });
    } catch (e) { /* ignore */ }
  }

  function sendPurchase(item) {
    try {
      if (!firstTime(GA_SEEN_PREFIX, item.transactionId)) return;
      var p = pageFields();
      window.gtag('event', 'purchase', {
        send_to: GA_ID,
        value: item.value,
        currency: 'CHF',
        transaction_id: item.transactionId,
        page_location: p.location,
        page_referrer: p.referrer,
        page_title: p.title,
      });
    } catch (e) { /* ignore */ }
  }

  /* Denied (default 1, adopted 2026-10-16): a cookieless ping with the amount and CHF only, never the reference.
     The once-only key is still written, so a reload sends nothing more. */
  function sendDeniedConversion(item) {
    try {
      if (!firstTime(SEEN_PREFIX, item.transactionId)) return;
      window.gtag('event', 'conversion', { send_to: SEND_TO, value: item.value, currency: 'CHF' });
    } catch (e) { /* ignore */ }
  }

  function sendDeniedPurchase(item) {
    try {
      if (!firstTime(GA_SEEN_PREFIX, item.transactionId)) return;
      var p = pageFields();
      window.gtag('event', 'purchase', {
        send_to: GA_ID,
        value: item.value,
        currency: 'CHF',
        page_location: p.location,
        page_referrer: p.referrer,
        page_title: p.title,
      });
    } catch (e) { /* ignore */ }
  }

  function sendPaid(item) {
    if (adsOn && !adsRevoked) sendConversion(item);
    else sendDeniedConversion(item);
    if (ANALYTICS_ON) {
      if (gaOn && !gaRevoked) sendPurchase(item);
      else sendDeniedPurchase(item);
    }
  }

  function flushQueued() {
    var list = queued;
    queued = [];
    for (var i = 0; i < list.length; i++) sendPaid(list[i]);
  }

  /* ---- GA4 events: Meta's browser and booking-step events, a fixed list, no value, no free text ---- */

  var GA_EVENTS = {
    ViewContent: { ga: 'view_item', key: 'content_name', words: ['transfer'], out: null }, /* the price button */
    Lead: { ga: 'generate_lead', key: null, words: [], out: null }, /* the contact form was sent */
    Contact: { ga: 'contact', key: 'content_category', words: ['whatsapp', 'phone', 'email'], out: 'method' },
    InitiateCheckout: { ga: 'begin_checkout', key: null, words: [], out: null }, /* a vehicle was chosen */
    AddPaymentInfo: { ga: 'add_payment_info', key: null, words: [], out: null }, /* going to payment */
  };

  /* Returns { ga, word } or null when the name or the word is not on the list. */
  function gaEvent(name, params) {
    if (!Object.prototype.hasOwnProperty.call(GA_EVENTS, name)) return null;
    var def = GA_EVENTS[name];
    if (def.key === null) return { ga: def.ga, out: null, word: '' };
    var word = params && typeof params === 'object' ? params[def.key] : undefined;
    if (typeof word !== 'string' || !inList(def.words, word)) return null;
    return { ga: def.ga, out: def.out, word: word };
  }

  function sendEvent(ev) {
    try {
      var p = pageFields();
      var out = { send_to: GA_ID, page_location: p.location, page_referrer: p.referrer, page_title: p.title };
      if (ev.out) out[ev.out] = ev.word;
      window.gtag('event', ev.ga, out);
    } catch (e) { /* ignore */ }
  }

  function flushEvents() {
    var list = events;
    events = [];
    for (var i = 0; i < list.length; i++) sendEvent(list[i]);
  }

  /* Before the configs went out the event waits (at most five); after that it goes out at once, with cookies
     when Analytics is granted, as a cookieless ping when it is not (default 2, adopted 2026-10-16). */
  function track(name, params) {
    try {
      if (!GOOGLE_ON || !ANALYTICS_ON) return false;
      var ev = gaEvent(name, params);
      if (ev === null) return false;
      if (!allowed(location.href)) return false;
      var stamp = ev.ga + ':' + ev.word;
      var now = new Date().getTime();
      if (lastSent[stamp] && now - lastSent[stamp] < 1500) return false;
      lastSent[stamp] = now;
      if (configured) { sendEvent(ev); return true; }
      if (events.length < MAX_EVENTS) events.push(ev);
      return true;
    } catch (e) { return false; }
  }

  /* One capturing listener for every WhatsApp, phone and email link (also the ones a component adds later).
     It reads the kind from the link address and sends only the kind. */
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

  /* ---- start Google's script: after the server said yes, each config under its own choice ---- */

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  /* Tag Manager: only with both choices on, never again on a page where either was withdrawn. */
  function bootTagManager() {
    if (!GTM_ON || gtmOn || gtmRevoked) return;
    if (!(adsOn && !adsRevoked && gaOn && !gaRevoked)) return;
    if (!allowed(location.href)) return;
    try {
      gtmOn = true;
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      addScript(GOOGLE_HOST + '/gtm.js?id=' + GTM_ID);
    } catch (e) { /* no container is never an error for the visitor */ }
  }

  /* Google's script, once per page, right after the denied default: for every visitor on a listed page. */
  function loadScript() {
    if (scriptAdded) return;
    ensureGtag();
    setDefault();
    scriptAdded = true;
    addScript(GOOGLE_HOST + '/gtag/js?id=' + TAG_ID);
    window.gtag('js', new Date());
    window.gtag('set', 'ads_data_redaction', true);
  }

  /* The two configs and the one GA4 page_view, once per page, under whatever consent is current: granted after
     an Accept the server confirmed, denied otherwise (cookieless). */
  function configure() {
    if (configured || !scriptAdded) return;
    if (!allowed(location.href)) return;
    try {
      configured = true;
      var p = pageFields();
      window.gtag('config', TAG_ID, { send_page_view: false, page_location: p.location, page_referrer: p.referrer });
      if (ANALYTICS_ON) {
        window.gtag('config', GA_ID, {
          send_page_view: false,
          page_location: p.location,
          page_referrer: p.referrer,
          page_title: p.title,
          cookie_expires: GA_COOKIE_SECONDS,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        });
        window.gtag('event', 'page_view', { send_to: GA_ID, page_location: p.location, page_referrer: p.referrer, page_title: p.title });
      }
      flushQueued();
      flushEvents();
    } catch (e) { /* no tag is never an error for the visitor */ }
  }

  /* The server said yes: grant each purpose under its own choice (never one withdrawn on this page), then the
     configs if they have not gone out yet. */
  function bootGoogle(marketing, analytics) {
    if (!allowed(location.href)) return; /* re-checked right before granting */
    var addAds = marketing && !adsOn && !adsRevoked;
    var addGa = analytics && ANALYTICS_ON && !gaOn && !gaRevoked;
    try {
      loadScript();
      if (addAds || addGa) {
        if (addAds) adsOn = true;
        if (addGa) gaOn = true;
        window.gtag('consent', 'update', consentNow());
      }
      configure();
      bootTagManager();
      flushQueued();
      flushEvents();
    } catch (e) { /* no tag is never an error for the visitor */ }
  }

  function check() {
    if (!GOOGLE_ON) return;
    var seq = withdrawSeq;
    var mayStart = allowed(location.href);
    try {
      fetch('/api/consent/state', { credentials: 'same-origin', cache: 'no-store' }).then(function (res) {
        return res.json();
      }).then(function (r) {
        if (seq !== withdrawSeq) return; /* a withdraw happened while we asked */
        if (!r || r.ok !== true) { configure(); return; } /* server unreachable: denied */
        answered = true;
        var chosen = r.chosen === true && r.choice;
        var marketing = !!(chosen && r.choice.marketing === true);
        var analytics = !!(chosen && r.choice.analytics === true);
        withdraw(!marketing, !analytics, true);
        if ((marketing || analytics) && mayStart) bootGoogle(marketing, analytics);
        else configure(); /* denied: cookieless */
      }, function () { configure(); });
    } catch (e) { /* ignore */ }
  }

  /* The conversion. Asked for while the tag is still starting it waits (at most three); after a withdraw of
     both choices, or when neither is on, it goes out cookieless (amount and CHF only) and a later Accept does not replay it. */
  function conversion(info) {
    try {
      if (!GOOGLE_ON) return false;
      if (!info || typeof info !== 'object') return false;
      var value = info.value;
      var id = info.transactionId;
      if (typeof value !== 'number' || !isFinite(value) || value <= 0 || value > 50000) return false;
      if (typeof id !== 'string' || !/^VT-[0-9]{2}-[0-9]{4,5}$/.test(id)) return false;
      if (!allowed(location.href)) return false;
      var item = { value: Math.round(value * 100) / 100, transactionId: id };
      if (configured && typeof window.gtag === 'function') { sendPaid(item); return true; }
      if (queued.length < MAX_QUEUED) queued.push(item);
      return true;
    } catch (e) { return false; }
  }

  function start() {
    if (!GOOGLE_ON) return;
    if (!allowed(location.href)) return;
    loadScript(); /* advanced: the denied default, then the script, for every visitor */
    setTimeout(configure, CONFIG_WAIT_MS); /* the server is slow: the configs go out denied */
    /* A saved choice (either runtime) or a withdraw: what was turned off stops now; the server answers what
       may start, not the event. */
    window.addEventListener('vamos:consent', function (e) {
      var d = e && e.detail;
      if (!d) return;
      withdraw(d.marketing !== true, d.analytics !== true);
      if (d.marketing === true || d.analytics === true) check();
    });
    window.addEventListener('vamos:consent-recorded', function () { check(); });
    if (typeof document.addEventListener === 'function') document.addEventListener('click', onContactClick, true);
    check();
  }

  /* Registered first: a page restored from the back-forward cache is asked again. */
  window.addEventListener('pageshow', function (e) {
    if (!e || e.persisted !== true || !GOOGLE_ON) return;
    check();
  });

  /* A choice turned off in another tab. */
  window.addEventListener('storage', function (e) {
    if (!GOOGLE_ON || !e || e.key !== 'vamosCookieConsent') return;
    var c = null;
    try { c = JSON.parse(e.newValue || 'null'); } catch (err) { c = null; }
    withdraw(!c || c.marketing !== true, !c || c.analytics !== true);
  });

  window.VamosGoogle = {
    conversion: conversion,
    track: track,
    allowed: allowed,
    scrub: scrub,
    loaded: function () { return scriptAdded; },
    revoked: function () { return adsRevoked; },
    pending: function () { return queued.length; },
    analyticsLoaded: function () { return gaOn; },
    analyticsRevoked: function () { return gaRevoked; },
    tagManagerLoaded: function () { return gtmOn; },
    pendingEvents: function () { return events.length; },
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
