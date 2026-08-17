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
  if (window.VamosLocale) return;

  var LANGS = ['en', 'de', 'fr', 'ar'];
  var RTL = { ar: true };
  var CURS = {
    CHF: { sym: 'CHF', space: ' ', name: 'Swiss francs' },
    EUR: { sym: '€', space: ' ', name: 'Euro' },
    USD: { sym: '$', space: '', name: 'US dollars' },
    AED: { sym: 'AED', space: ' ', name: 'UAE dirham' },
  };
  var LS_LANG = 'vamosLang', LS_CUR = 'vamosCurrency';

  /* Every amount on this platform is a placeholder (design system §2: never
     invent a CHF price), so switching currency swaps the mark, never the number. */
  var MONEY_RE = /(?:CHF|AED|EUR|USD|€|\$)(\u00A0|\s)?(\d[\d'’.,]*)/g;

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, CANVAS: 1 };
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  var dict = (window.VamosI18n && window.VamosI18n.strings) || {};
  var patterns = (window.VamosI18n && window.VamosI18n.patterns) || [];

  var state = read();
  var listeners = [];
  var store = new WeakMap();      // text node  -> { src, out }
  var attrStore = new WeakMap();  // element    -> { attr: { src, out } }
  var applying = false, queued = false, mo = null;

  function read() {
    var lang = 'en', cur = 'CHF';
    try {
      lang = localStorage.getItem(LS_LANG) || 'en';
      cur = localStorage.getItem(LS_CUR) || 'CHF';
    } catch (e) {}
    return {
      lang: LANGS.indexOf(lang) > -1 ? lang : 'en',
      cur: CURS[cur] ? cur : 'CHF',
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

  function lookup(key, lang) {
    if (lang === 'en') return null;
    var e = dict[key];
    if (e && e[lang]) return e[lang];
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p[lang] && p.re.test(key)) { p.re.lastIndex = 0; return key.replace(p.re, p[lang]); }
      p.re.lastIndex = 0;
    }
    return null;
  }

  /* Split markup puts the mark in its own node: <span>CHF</span><span>000.00</span>.
     The currency picker itself opts out with data-vt-no-i18n, so this is safe. */
  var LONE_CUR = /^(?:CHF|EUR|USD|AED|€|\$)$/;

  function convert(src) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src);
    var lead = m[1], key = m[2], trail = m[3];
    if (!key) return src;
    if (LONE_CUR.test(key)) return lead + (CURS[state.cur] || CURS.CHF).sym + trail;
    var out = key;
    if (/[A-Za-z]/.test(key)) out = lookup(key, state.lang) || key;
    out = reprice(out);
    return lead + out + trail;
  }

  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName]) return true;
      if (n.hasAttribute && (n.hasAttribute('data-vt-no-i18n') || n.getAttribute('translate') === 'no')) return true;
    }
    return false;
  }

  function applyText(node) {
    var v = node.nodeValue;
    if (!v || !/\S/.test(v)) return;
    var rec = store.get(node);
    if (!rec || rec.out !== v) { rec = { src: v }; store.set(node, rec); }
    var next = convert(rec.src);
    if (next !== v) node.nodeValue = next;
    rec.out = next;
  }

  function applyAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      if (!v || !/\S/.test(v)) continue;
      var bag = attrStore.get(el);
      if (!bag) { bag = {}; attrStore.set(el, bag); }
      var rec = bag[a];
      if (!rec || rec.out !== v) { rec = { src: v }; bag[a] = rec; }
      var next = convert(rec.src);
      if (next !== v) el.setAttribute(a, next);
      rec.out = next;
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentNode)) applyText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && skipped(root)) return;
    if (root.nodeType === 1) applyAttrs(root);

    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (SKIP_TAGS[n.tagName] || n.hasAttribute('data-vt-no-i18n') || n.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
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
     rAF, which would leave the queue latched and the page half-translated. */
  function schedule(roots) {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; pass(roots); }, 16);
  }

  function observe() {
    if (mo) return;
    /* Helmet scripts can run before <body> exists — keep trying, or the observer
       never attaches and late-mounting child components stay untranslated. */
    if (!document.body) { setTimeout(observe, 25); return; }
    mo = new MutationObserver(function (recs) {
      if (applying) return;
      var roots = [], full = false;
      for (var i = 0; i < recs.length && !full; i++) {
        var r = recs[i];
        if (r.type === 'characterData') roots.push(r.target);
        else if (r.type === 'attributes') roots.push(r.target);
        else {
          for (var j = 0; j < r.addedNodes.length; j++) roots.push(r.addedNodes[j]);
          if (r.addedNodes.length > 60) full = true;
        }
        if (roots.length > 400) full = true;
      }
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
    if (next.cur && CURS[next.cur] && next.cur !== state.cur) { state.cur = next.cur; changed = true; }
    if (!changed) return;
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
    LANGS: LANGS,
    CURRENCIES: CURS,
    lang: function () { return state.lang; },
    cur: function () { return state.cur; },
    isRTL: function () { return !!RTL[state.lang]; },
    setLang: function (v) { set({ lang: v }); },
    setCur: function (v) { set({ cur: v }); },
    set: function (o) { set(o || {}); },
    money: money,
    reprice: reprice,
    t: function (s, lang) { return lookup(String(s), lang || state.lang) || s; },
    extend: function (more) { for (var k in more) if (Object.prototype.hasOwnProperty.call(more, k)) dict[k] = more[k]; pass(); },
    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
    },
    refresh: function (root) { pass(root ? [root] : null); legalNotice(); },
  };

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
  /* DC surfaces stream in after first paint — one late sweep catches the rest. */
  window.addEventListener('load', function () { schedule(null); });
})();
