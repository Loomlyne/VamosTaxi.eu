/* Vamos Taxi — the mock pages' consent runtime.

   One place that reads the visitor's consent state from the server, writes every
   choice to POST /api/consent, keeps the display cache and hands out Turnstile.
   The server is the record (27-CONTEXT D-06); localStorage.vamosCookieConsent is a
   display cache only and is ignored when its version is not the current policy version.

   Load it in <helmet> AFTER vamos-locale.js:
     <script src="../vamos-locale.js"></script>
     <script src="../vamos-consent.js"></script>

   API
     VamosConsent.state()                  -> Promise {ok, chosen, choice|null, policyVersion} | {ok:false}
     VamosConsent.save(method, cats, opts) -> Promise {ok:true} | {ok:false, code}
     VamosConsent.onChange(fn) -> off      subscribe to 'vamos:consent'
     VamosConsent.cached()                 display cache for the current policy version, or null
     VamosConsent.turnstile(box, onToken, onError) -> {execute, reset, remove}

   Cloudflare Web Analytics (cookieless) starts only once a saved choice allows
   Analytics: when state() reads one from the server, or save() records one.
   Cloudflare's automatic injection must stay off (owner 2026-10-01).

   Plain browser script (not transpiled): var, function, fetch + Promise. */
(function () {
  if (window.VamosConsent) return;

  var KEY = 'vamosCookieConsent';
  var EVENT = 'vamos:consent';
  var API_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var policyVersion = null;
  var scriptRequested = false;
  /* Public site tag; apps/web/lib/consent/web-analytics.ts carries the same one. */
  var BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
  var BEACON_TOKEN = '792482ef56d84c46aee4f6501205ce68';

  function startAnalytics() {
    try {
      var host = location.hostname || '';
      if (!/(^|\.)vamostaxi\.(site|eu)$/.test(host) || host.indexOf('dashboard.') === 0) return;
      if (document.querySelector('script[src="' + BEACON_SRC + '"]')) return;
      var s = document.createElement('script');
      s.defer = true;
      s.src = BEACON_SRC;
      s.setAttribute('data-cf-beacon', JSON.stringify({ token: BEACON_TOKEN }));
      document.head.appendChild(s);
    } catch (e) { /* no analytics is never an error for the visitor */ }
  }

  function lang() {
    var l = window.VamosLocale && window.VamosLocale.lang;
    var v = typeof l === 'function' ? l.call(window.VamosLocale) : l;
    return v === 'de' || v === 'fr' || v === 'ar' ? v : 'en';
  }

  function state() {
    var done = function (v) { return v; };
    var failed = function () { return { ok: false }; };
    try {
      return fetch('/api/consent/state', { cache: 'no-store', credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) return failed();
          return res.json().then(function (j) {
            if (!j || j.ok !== true) return failed();
            if (typeof j.policyVersion === 'string') policyVersion = j.policyVersion;
            if (j.chosen === true && j.choice && j.choice.analytics === true) startAnalytics();
            return done({
              ok: true,
              chosen: j.chosen === true,
              choice: j.chosen === true && j.choice ? j.choice : null,
              policyVersion: policyVersion,
            });
          });
        })
        .then(null, failed);
    } catch (e) {
      return Promise.resolve(failed());
    }
  }

  function newKey() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) { /* no crypto: the server does not need a key */ }
    return undefined;
  }

  function writeCache(method, cats) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: policyVersion, method: method,
        functional: cats.functional === true, analytics: cats.analytics === true,
        marketing: cats.marketing === true, at: new Date().toISOString(),
      }));
    } catch (e) { /* storage unavailable: the server still holds the record */ }
  }

  function save(method, cats, opts) {
    opts = opts || {};
    cats = cats || {};
    var payload = {
      method: method,
      locale: lang(),
      functional: cats.functional === true,
      analytics: cats.analytics === true,
      marketing: cats.marketing === true,
    };
    if (opts.turnstileToken) payload.turnstileToken = opts.turnstileToken;
    var key = opts.idempotencyKey || newKey();
    if (key) payload.idempotencyKey = key;
    var fail = function (code) { return { ok: false, code: code }; };
    try {
      return fetch('/api/consent', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (res.ok) {
          writeCache(method, payload);
          if (payload.analytics) startAnalytics();
          var detail = {
            method: method, functional: payload.functional,
            analytics: payload.analytics, marketing: payload.marketing,
          };
          try { window.dispatchEvent(new window.CustomEvent(EVENT, { detail: detail })); } catch (e) { /* no event support */ }
          return { ok: true };
        }
        if (res.status === 429) return fail('rate_limited');
        if (res.status === 403) {
          return res.json().then(function (j) {
            return fail(j && j.code === 'challenge_failed' ? 'challenge_failed' : 'forbidden');
          }, function () { return fail('forbidden'); });
        }
        if (res.status === 400) return fail('invalid_input');
        return fail('unavailable');
      }).then(null, function () { return fail('network'); });
    } catch (e) {
      return Promise.resolve(fail('network'));
    }
  }

  function onChange(fn) {
    var h = function (e) { fn(e && e.detail); };
    window.addEventListener(EVENT, h);
    return function () { window.removeEventListener(EVENT, h); };
  }

  function cached() {
    if (policyVersion === null) return null;
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && typeof c === 'object' && c.v === policyVersion) return c;
    } catch (e) { /* unreadable cache is no cache */ }
    return null;
  }

  function loadScript() {
    if (scriptRequested || (window.turnstile && typeof window.turnstile.render === 'function')) return;
    scriptRequested = true;
    var s = document.createElement('script');
    s.src = API_SCRIPT;
    document.head.appendChild(s);
  }

  /** Renders an explicit Turnstile widget (action consent) into `box`. Nothing runs on load. */
  function turnstile(box, onToken, onError) {
    var meta = document.querySelector('meta[name="vt-turnstile-site-key"]');
    var siteKey = meta && meta.getAttribute('content');
    var widgetId = null;
    var wantExecute = false;
    var removed = false;
    var tries = 0;
    var timer = null;
    if (!siteKey) {
      if (onError) onError('no-site-key');
      return { execute: function () { if (onError) onError('no-site-key'); }, reset: function () {}, remove: function () {} };
    }
    loadScript();
    function ready() { return window.turnstile && typeof window.turnstile.render === 'function'; }
    function render() {
      timer = null;
      if (removed || widgetId !== null) return;
      if (!ready()) {
        tries += 1;
        if (tries > 200) { if (onError) onError('script'); return; }
        timer = setTimeout(render, 50);
        return;
      }
      widgetId = window.turnstile.render(box, {
        sitekey: siteKey,
        action: 'consent',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: function (token) { if (onToken) onToken(token); },
        'expired-callback': function () { if (onError) onError('expired'); },
        'error-callback': function () { if (onError) onError('error'); },
      });
      if (wantExecute) window.turnstile.execute(widgetId);
    }
    render();
    return {
      execute: function () {
        wantExecute = true;
        if (widgetId !== null && ready()) window.turnstile.execute(widgetId);
      },
      reset: function () {
        if (widgetId !== null && ready()) window.turnstile.reset(widgetId);
      },
      remove: function () {
        removed = true;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (widgetId !== null && ready() && typeof window.turnstile.remove === 'function') window.turnstile.remove(widgetId);
        widgetId = null;
      },
    };
  }

  window.VamosConsent = { state: state, save: save, onChange: onChange, cached: cached, turnstile: turnstile };
})();
