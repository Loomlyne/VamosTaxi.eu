/* Vamos Taxi — the platform's locale runtime.

   One store, one broadcast, one DOM pass. Language and currency are chosen once
   (header, menu, anywhere) and every surface follows: sections, forms, dialogs,
   footer, ops. Nothing reloads.

   Load it in <helmet> AFTER vamos-i18n-dict.js:
     <script src="vamos-i18n-dict.js"></script>
     <script src="vamos-locale.js"></script>

   API
     VamosLocale.lang() / .cur()          current choice
     VamosLocale.setLang(v) / .setCur(v)  change it everywhere
     VamosLocale.onChange(fn) -> off      subscribe (React pages relabel in place)
     VamosLocale.money('000')             format an amount in the chosen currency
     VamosLocale.t('English string')      look a string up
     VamosLocale.extend({...})            add strings from a page
     VamosLocale.refresh()                re-run the DOM pass by hand

   Text a page renders in English is translated from the dictionary; text a page
   already renders itself (the booking widget, the header) is left alone, because
   its own output never matches an English key. */
(function () {
  /* The design-system bundle installs its own VamosLocale (its own small
     dictionary, its own `vamos.lang` storage key, `lang` as a getter). This
     file is the platform store — CLAUDE.md — so it takes over rather than
     bailing out: park the kit's runtime on English (its observer then idles)
     and replace it. Loading this file twice is still a no-op. */
  var prev = window.VamosLocale;
  if (prev && prev.__vamosApp) return;
  if (prev && typeof prev.setLang === 'function') { try { prev.setLang('en'); } catch (e) {} }
  /* ...and keep it parked. Its boot() reads `vamos.lang` off localStorage on
     DOMContentLoaded; leaving a non-English value there re-arms its observer
     and the two runtimes then rewrite the same nodes at each other for ever. */
  try { localStorage.removeItem('vamos.lang'); localStorage.removeItem('vamos.cur'); } catch (e) {}

  var LANGS = ['en', 'de', 'fr', 'ar'];
  var RTL = { ar: true };
  var CURS = {
    CHF: { sym: 'CHF', space: ' ', name: 'Swiss francs' },
    EUR: { sym: '€', space: ' ', name: 'Euro' },
    USD: { sym: '$', space: '', name: 'US dollars' },
    AED: { sym: 'AED', space: ' ', name: 'UAE dirham' },
  };
  var LS_LANG = 'vamosLang', LS_CUR = 'vamosCurrency';
  /* Keys the design-system runtime used before this file took over. Read once
     for migration, never written back — see the takeover note above. */
  var LS_LANG_DS = 'vamos.lang', LS_CUR_DS = 'vamos.cur';

  /* Every amount on this platform is a placeholder (design system §2: never
     invent a CHF price), so switching currency swaps the mark, never the number. */
  var MONEY_RE = /(?:CHF|AED|EUR|USD|€|\$)(\u00A0|\s)?(\d[\d'’.,]*)/g;

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, CANVAS: 1 };
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  /* \p{L} where the engine has it, Latin + Arabic otherwise. */
  var HAS_LETTER;
  try { HAS_LETTER = new RegExp('\\p{L}', 'u'); }
  catch (e) { HAS_LETTER = /[A-Za-z\u00C0-\u024F\u0600-\u06FF]/; }

  var dict = (window.VamosI18n && window.VamosI18n.strings) || {};
  var patterns = (window.VamosI18n && window.VamosI18n.patterns) || [];

  var state = read();
  var listeners = [];
  var applying = false, queued = false, mo = null;
  var reverse = null;             // any translation -> its English key
  /* convert() is pure for a given (lang, cur), and the same few hundred strings
     recur on every sweep — without this the pattern scan runs thousands of
     regexes per pass and the page crawls. Cleared whenever the choice changes. */
  var memo = Object.create(null), memoN = 0;

  function resetMemo() { memo = Object.create(null); memoN = 0; }

  function reverseIndex() {
    if (reverse) return reverse;
    reverse = {};
    for (var k in dict) {
      var e = dict[k];
      for (var i = 0; i < LANGS.length; i++) {
        var v = e[LANGS[i]];
        if (v && !reverse[v]) reverse[v] = k;
      }
    }
    return reverse;
  }

  function isDashboardHost() {
    return location.hostname === 'dashboard.vamostaxi.site';
  }

  function read() {
    var lang = 'en', cur = 'CHF';
    try {
      lang = localStorage.getItem(LS_LANG) || localStorage.getItem(LS_LANG_DS) || 'en';
      cur = localStorage.getItem(LS_CUR) || localStorage.getItem(LS_CUR_DS) || 'CHF';
    } catch (e) {}
    return {
      lang: LANGS.indexOf(lang) > -1 ? lang : 'en',
      /* Ops is Swiss-only: a previously saved public currency must never turn
         dashboard placeholders into AED/EUR/USD. */
      cur: isDashboardHost() ? 'CHF' : (CURS[cur] ? cur : 'CHF'),
    };
  }

  /* ── formatting ───────────────────────────────────────────────────────── */

  function money(amount, curCode) {
    var c = CURS[curCode || state.cur] || CURS.CHF;
    return c.sym + c.space + String(amount);
  }

  function reprice(s) {
    if (s.indexOf('CHF') < 0 && s.indexOf('AED') < 0 && s.indexOf('€') < 0 &&
        s.indexOf('$') < 0 && s.indexOf('EUR') < 0 && s.indexOf('USD') < 0) return s;
    return s.replace(MONEY_RE, function (_m, _sp, num) { return money(num); });
  }

  /* ── translation ──────────────────────────────────────────────────────── */

  /* Patterns are stored as an English regex plus a template per language, so a
     string a pattern already produced ("© 2026 Vamos Taxi. Alle Rechte
     vorbehalten.") has to be matchable in reverse too, or German would stick
     when the reader switches to French. Both directions are derived lazily
     from what the pattern already carries. */
  function unescapeSrc(s) {
    return s.replace(/\\([\\^$.*+?()[\]{}|/])/g, '$1');
  }

  function englishTemplate(p) {
    if (p.__en) return p.__en;
    var src = p.re.source.replace(/^\^/, '').replace(/\$$/, '');
    var out = '', depth = 0, gi = 0;
    for (var c = 0; c < src.length; c++) {
      var ch = src.charAt(c);
      if (ch === '\\') { if (depth === 0) out += ch + src.charAt(c + 1); c++; continue; }
      if (ch === '(') { depth++; if (depth === 1) { gi++; out += '$' + gi; } continue; }
      if (ch === ')') { depth--; continue; }
      if (depth === 0) out += ch;
    }
    p.__en = unescapeSrc(out);
    return p.__en;
  }

  function templateRx(p, lang) {
    if (!p.__rx) p.__rx = {};
    if (p.__rx[lang] !== undefined) return p.__rx[lang];
    var tpl = lang === 'en' ? englishTemplate(p) : p[lang];
    p.__rx[lang] = tpl
      ? new RegExp('^' + tpl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$(\d)/g, '(.+)') + '$')
      : null;
    return p.__rx[lang];
  }

  function fromPattern(key, lang) {
    /* Patterns are short one-liners; skip the 150-odd regex tests for prose. */
    if (key.length > 160) return null;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      for (var j = 0; j < LANGS.length; j++) {
        var rx = templateRx(p, LANGS[j]);
        if (!rx) continue;
        var m = rx.exec(key);
        if (!m) continue;
        var target = lang === 'en' ? englishTemplate(p) : p[lang];
        if (!target) return null;
        return target.replace(/\$(\d)/g, function (_x, n) { return m[+n] || ''; });
      }
    }
    return null;
  }

  function lookup(key, lang) {
    var e = dict[key];
    if (lang !== 'en') {
      if (e && e[lang]) return e[lang];
    }
    /* A node can be holding an already-translated string: the page was read in
       German and the reader switches to Arabic, or back to English. Map the
       translation back to its English key and go on from there, so every
       language reaches every other one and English is always recoverable. */
    var en = reverseIndex()[key];
    if (en && en !== key) {
      if (lang === 'en') return en;
      var e2 = dict[en];
      if (e2 && e2[lang]) return e2[lang];
    }
    if (lang === 'en') return fromPattern(key, 'en');
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p[lang] && p.re.test(key)) { p.re.lastIndex = 0; return key.replace(p.re, p[lang]); }
      p.re.lastIndex = 0;
    }
    return fromPattern(key, lang);
  }

  /* Split markup puts the mark in its own node: <span>CHF</span><span>000.00</span>.
     The currency picker itself opts out with data-vt-no-i18n, so this is safe. */
  var LONE_CUR = /^(?:CHF|EUR|USD|AED|€|\$)$/;

  function convert(src) {
    var hit = memo[src];
    if (hit !== undefined) return hit;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src);
    var lead = m[1], key = m[2], trail = m[3];
    if (!key) return src;
    if (LONE_CUR.test(key)) return lead + (CURS[state.cur] || CURS.CHF).sym + trail;
    var out = key;
    /* Any script, not just Latin: Arabic text has no [A-Za-z], and skipping
       lookup for it would make Arabic a one-way door. */
    if (HAS_LETTER.test(key)) out = lookup(key, state.lang) || key;
    out = reprice(out);
    var result = lead + out + trail;
    if (memoN > 6000) resetMemo();
    memo[src] = result; memoN++;
    return result;
  }

  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName]) return true;
      if (n.hasAttribute && (n.hasAttribute('data-vt-no-i18n') || n.getAttribute('translate') === 'no')) return true;
    }
    return false;
  }

  /* Stateless on purpose. Every value is normalised back to its English key
     before being translated, so a node can hold any language and still switch
     to any other — no per-node source cache to go stale when React re-renders
     a subtree or a second pass lands mid-flight. */
  function applyText(node) {
    var v = node.nodeValue;
    if (!v || !/\S/.test(v)) return;
    var next = convert(v);
    if (next !== v) node.nodeValue = next;
  }

  function applyAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      if (!v || !/\S/.test(v)) continue;
      var next = convert(v);
      if (next !== v) el.setAttribute(a, next);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentNode)) applyText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    /* A textarea's TEXT is the traveller's own words and is never touched, but its
       placeholder is our copy and has to switch language like any other label. */
    if (root.nodeType === 1 && root.tagName === 'TEXTAREA') { if (!skipped(root.parentNode)) applyAttrs(root); return; }
    if (root.nodeType === 1 && skipped(root)) return;
    if (root.nodeType === 1) applyAttrs(root);

    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (n.hasAttribute('data-vt-no-i18n') || n.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS[n.tagName]) { if (n.tagName === 'TEXTAREA') applyAttrs(n); return NodeFilter.FILTER_REJECT; }
          return NodeFilter.FILTER_ACCEPT;
        }
        return /\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 1) applyAttrs(n); else applyText(n); }
  }

  function pass(roots) {
    if (!document.body) return;
    applying = true;
    try {
      if (!roots || !roots.length) walk(document.body);
      else for (var i = 0; i < roots.length; i++) walk(roots[i]);
    } finally {
      applying = false;
    }
  }

  /* ── chrome: html lang/dir, Arabic type fallback ──────────────────────── */

  function chrome() {
    var h = document.documentElement;
    h.setAttribute('lang', state.lang);
    h.setAttribute('dir', RTL[state.lang] ? 'rtl' : 'ltr');
    h.setAttribute('data-vt-lang', state.lang);
    h.setAttribute('data-vt-cur', state.cur);
    if (RTL[state.lang]) {
      arabicFont();
      h.style.setProperty('--vt-font-body', "'Noto Sans Arabic','Poppins',system-ui,sans-serif");
      h.style.setProperty('--vt-font-display', "'Noto Sans Arabic','Qurova','Poppins',system-ui,sans-serif");
    } else {
      h.style.removeProperty('--vt-font-body');
      h.style.removeProperty('--vt-font-display');
    }
  }

  function arabicFont() {
    if (document.getElementById('vt-ar-font')) return;
    var l = document.createElement('link');
    l.id = 'vt-ar-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }

  /* Long-form legal copy is not machine-translated — a page marked
     data-vt-legal says so in the reader's language instead of pretending. */
  var LEGAL_NOTE = {
    de: 'Diese Rechtsseite liegt bisher nur auf Englisch vor. Die deutsche Fassung wird von der Rechtsberatung geprüft; verbindlich ist bis dahin der englische Text.',
    fr: 'Cette page juridique n’existe pour l’instant qu’en anglais. La version française est en cours de validation juridique ; le texte anglais fait foi jusque-là.',
    ar: 'هذه الصفحة القانونية متاحة بالإنجليزية فقط حتى الآن. النسخة العربية قيد المراجعة القانونية، والنص الإنجليزي هو المُلزِم حتى ذلك الحين.',
  };

  function legalNotice() {
    var host = document.querySelector('[data-vt-legal]');
    if (!host) return;
    var have = (host.getAttribute('data-vt-legal') || 'en').split(/\s+/);
    var el = document.getElementById('vt-legal-note');
    if (have.indexOf(state.lang) > -1) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'vt-legal-note';
      el.setAttribute('data-vt-no-i18n', '');
      el.style.cssText = 'background:var(--vt-bg-inverse,#1E1F1F);border-bottom:1px solid rgb(255 255 255/.14)';
      var inner = document.createElement('p');
      inner.id = 'vt-legal-note-text';
      inner.style.cssText = 'max-width:1200px;margin:0 auto;padding:14px clamp(20px,5vw,56px);' +
        'color:var(--vt-text-inverse-muted,rgb(255 255 255/.72));font-family:var(--vt-font-body);' +
        'font-size:var(--vt-body-sm,14px);line-height:1.6;text-wrap:pretty';
      el.appendChild(inner);
      host.insertBefore(el, host.firstChild);
    }
    (document.getElementById('vt-legal-note-text') || el).textContent = LEGAL_NOTE[state.lang] || '';
  }

  /* ── observation ──────────────────────────────────────────────────────── */

  /* Timers, not requestAnimationFrame: a background or hidden preview never fires
     rAF, which would leave the queue latched and the page half-translated.
     Roots accumulate — dropping the second batch inside the window is how a
     freshly rendered section ends up left in English. */
  var pendingRoots = null, pendingFull = false;
  function schedule(roots) {
    if (!roots) pendingFull = true;
    else { pendingRoots = pendingRoots || []; for (var i = 0; i < roots.length; i++) pendingRoots.push(roots[i]); }
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      var full = pendingFull, rs = pendingRoots;
      pendingFull = false; pendingRoots = null;
      pass(full ? null : rs);
    }, 90);
  }

  function observe() {
    if (mo) return;
    /* Helmet scripts can run before <body> exists — keep trying, or the observer
       never attaches and late-mounting child components stay untranslated. */
    if (!document.body) { setTimeout(observe, 25); return; }
    mo = new MutationObserver(function (recs) {
      /* No takeRecords() drain here: our own writes do wake this observer, but
         the pass is idempotent — the follow-up pass converts each node to the
         value it already has, writes nothing, and the cycle ends. Draining
         instead threw away React's re-render records and left whole sections
         stranded in the previous language. */
      if (applying) return;
      var roots = [], full = false;
      for (var i = 0; i < recs.length && !full; i++) {
        var r = recs[i];
        /* Components that rebuild their own DOM (the footer splits every link
           into per-character cells on each language change) fire hundreds of
           records that are all inside opted-out subtrees. Counting them is how
           one relabel turns into repeated full-document walks. */
        var host = r.target && r.target.nodeType === 1 ? r.target : (r.target && r.target.parentNode);
        if (r.type === 'attributes' && host && host.tagName === 'TEXTAREA') { if (!skipped(host.parentNode)) roots.push(host); continue; }
        if (host && host.nodeType === 1 && skipped(host)) continue;
        if (r.type === 'characterData') roots.push(r.target);
        else if (r.type === 'attributes') roots.push(r.target);
        else {
          for (var j = 0; j < r.addedNodes.length; j++) roots.push(r.addedNodes[j]);
          if (r.addedNodes.length > 60) full = true;
        }
        if (roots.length > 400) full = true;
      }
      if (!roots.length && !full) return;
      schedule(full ? null : roots);
    });
    mo.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  /* ── public ───────────────────────────────────────────────────────────── */

  function emit() {
    var snap = { lang: state.lang, cur: state.cur };
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](snap); } catch (e) {} }
    try { window.dispatchEvent(new CustomEvent('vamos:locale', { detail: snap })); } catch (e) {}
  }

  function set(next, quiet) {
    var changed = false;
    if (next.lang && LANGS.indexOf(next.lang) > -1 && next.lang !== state.lang) { state.lang = next.lang; changed = true; }
    if (isDashboardHost() && next.cur && next.cur !== 'CHF') next.cur = 'CHF';
    if (next.cur && CURS[next.cur] && next.cur !== state.cur) { state.cur = next.cur; changed = true; }
    if (!changed) return;
    resetMemo();
    if (!quiet) {
      try {
        localStorage.setItem(LS_LANG, state.lang);
        localStorage.setItem(LS_CUR, state.cur);
      } catch (e) {}
    }
    chrome();
    pass();
    legalNotice();
    emit();
    /* Subscribed React surfaces re-render right after emit() and paint their own
       English again — sweep once the re-render has landed. */
    setTimeout(function () { pass(); legalNotice(); }, 60);
    setTimeout(function () { pass(); }, 320);
  }

  window.VamosLocale = {
    __vamosApp: true,
    __v: 9,
    LANGS: LANGS,
    CURRENCIES: CURS,
    lang: function () { return state.lang; },
    cur: function () { return state.cur; },
    get dir() { return RTL[state.lang] ? 'rtl' : 'ltr'; },
    isRTL: function () { return !!RTL[state.lang]; },
    setLang: function (v) { set({ lang: v }); },
    setCur: function (v) { set({ cur: v }); },
    set: function (o) { set(o || {}); },
    money: money,
    reprice: reprice,
    t: function (s, lang) { return lookup(String(s), lang || state.lang) || s; },
    extend: function (more) { for (var k in more) if (Object.prototype.hasOwnProperty.call(more, k)) dict[k] = more[k]; reverse = null; resetMemo(); pass(); },
    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
    },
    refresh: function (root) { pass(root ? [root] : null); legalNotice(); },

    /* Design-system components render amounts as [data-money]; keep that
       contract working now that this runtime owns the page. */
    renderMoney: function (root) {
      var nodes = (root || document).querySelectorAll('[data-money]');
      for (var i = 0; i < nodes.length; i++) {
        var raw = nodes[i].getAttribute('data-money');
        nodes[i].textContent = money(raw === '' || raw === 'pending' || raw == null ? '000' : raw);
      }
    },
    apply: function (root) { pass(root ? [root] : null); },

    /* Every visible English string on a surface that the dictionary cannot
       resolve. Run it on a page, clear it to zero, and the surface is done
       in all four languages. Returns { count, strings, attrs }. */
    coverage: function (root, lang) {
      if (typeof root === 'string') { lang = root; root = null; }
      var target = lang || (state.lang !== 'en' ? state.lang : 'de');
      var host = (root && root.nodeType) ? root : document.body;
      /* Already-translated output is not a gap: a page read in German is full
         of German text nodes that will never resolve as English keys. */
      var translated = {};
      for (var key in dict) {
        var e = dict[key];
        for (var i = 0; i < LANGS.length; i++) if (e[LANGS[i]]) translated[e[LANGS[i]]] = 1;
      }
      reverse = null;
      resetMemo();
      var missText = {}, missAttr = {};
      var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (n) {
          if (n.nodeType === 1) {
            if (n.hasAttribute('data-vt-no-i18n') || n.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
            if (SKIP_TAGS[n.tagName]) {
              if (n.tagName === 'TEXTAREA') for (var k = 0; k < ATTRS.length; k++) { if (n.hasAttribute(ATTRS[k])) check(n.getAttribute(ATTRS[k]), missAttr, ATTRS[k]); }
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
          return HAS_LETTER.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      function check(raw, bag, where) {
        var rec = raw && /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
        var key = rec ? rec[2] : '';
        if (!key || !HAS_LETTER.test(key) || LONE_CUR.test(key)) return;
        if (translated[key]) return;
        if (lookup(key, target)) return;
        bag[key] = (bag[key] || 0) + 1;
        if (where) bag[key] = where;
      }
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 1) {
          for (var j = 0; j < ATTRS.length; j++) {
            if (!n.hasAttribute(ATTRS[j])) continue;
            check(n.getAttribute(ATTRS[j]), missAttr, ATTRS[j]);
          }
        } else {
          check(n.nodeValue, missText, null);
        }
      }
      var strings = Object.keys(missText), attrs = Object.keys(missAttr);
      return { lang: target, count: strings.length + attrs.length, strings: strings, attrs: attrs };
    },
  };

  /* Helmet scripts are injected dynamically, so load order is not guaranteed:
     the design-system bundle is large and can finish evaluating AFTER this
     file, reassigning global.VamosLocale over the top of it. Ownership has to
     be durable rather than order-dependent — a later kit assignment is
     absorbed and parked on English instead of replacing the platform store. */
  (function defend() {
    var API = window.VamosLocale;
    try {
      Object.defineProperty(window, 'VamosLocale', {
        configurable: true,
        get: function () { return API; },
        set: function (v) {
          if (v && v.__vamosApp) { API = v; return; }
          if (v && typeof v.setLang === 'function') { try { v.setLang('en'); } catch (e) {} }
          /* keep API as-is: the kit's runtime is parked, ours stays in charge */
        },
      });
    } catch (e) {}
  })();

  /* Another tab (or the ops console in a second window) changed the choice. */
  window.addEventListener('storage', function (e) {
    if (e.key !== LS_LANG && e.key !== LS_CUR) return;
    var next = read();
    set(next, true);
  });

  function start() {
    chrome();
    pass();
    legalNotice();
    observe();
    emit();
    setTimeout(function () { observe(); pass(); legalNotice(); }, 120);
    setTimeout(function () { observe(); pass(); legalNotice(); }, 600);
    setTimeout(function () { observe(); pass(); legalNotice(); }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  /* DC surfaces stream in after first paint, and a bundle that lands last may
     have re-run its own boot in the meantime — re-assert and sweep once more. */
  window.addEventListener('load', function () {
    chrome();
    schedule(null);
    setTimeout(function () { chrome(); pass(); legalNotice(); }, 400);
  });
})();
