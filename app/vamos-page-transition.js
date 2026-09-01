/* Vamos Taxi — site-wide page transition.

   One continuous move across the document boundary:
     yellow sweeps up → the page-ground sheet lands on top of it → the Vamos
     lockup rises from below into the middle → [documents swap] → lockup and
     sheet carry on up and off the top → the new page is there.

   The outgoing page plays the first three beats, the incoming page plays the
   last one — it boots with the sheet covering and the lockup already at rest,
   so the seam is invisible.

   Load in every page's <helmet>, right after vamos-locale.js:
     <script src="vamos-page-transition.js"></script>

   The arriving document is covered from its FIRST painted frame by #vt-boot-cover,
   a static div in each page's own <body> (see the <style id="vt-boot"> block there).
   It has to be static markup: the DC runtime only injects <helmet> stylesheets and
   scripts once React has loaded, so this file does not exist yet while the browser
   paints the new document's opening frames. This script adopts that cover and drops
   it once its own sheet has painted at COVER.

   The cover IS the loading state: arrival holds it until the page underneath
   has actually rendered (capped), so nothing ever uncovers onto a half-built
   page. Motion is requestAnimationFrame with a setTimeout watchdog (rAF is
   suspended outright in a hidden document, which would otherwise strand the
   page under a sheet).

   Escape hatches: data-no-transition on an <a> keeps native navigation.
   Honours prefers-reduced-motion: reduce — instant navigation, no overlay. */
(function () {
  if (window.__vtPageTransition) return;
  window.__vtPageTransition = true;

  var LEG = 460, STAGGER = 280;   // cover legs / yellow's solo beat before the ground sheet
  var OUT = 480, HOLD = 320;      // reveal leg / minimum time the cover holds
  var CAP = 2200;                 // hard release, so a stalled resource can't strand the page
  var CREST = 18;                 // vh of wave riding above AND below each panel
  // A sheet is 100+2*CREST tall, so ABOVE has to clear the bottom crest too —
  // -(100+CREST) left that crest parked on screen over the header.
  var COVER = -CREST, BELOW = 100, ABOVE = -(100 + 2 * CREST);

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  var yellow = cssVar('--vt-yellow', '#FDC20B');
  var charcoal = cssVar('--vt-charcoal', '#1E1F1F');
  var white = cssVar('--vt-white', '#FFFFFF');
  // The second sheet matches THIS PAGE's ground, not the OS colour scheme:
  // every page sets body{background:var(--vt-bg-page)}, so read it back and
  // let the browser normalise whatever notation the token uses.

  function logicalPath(p) {
    p = (p || '/').replace(/\/+$/, '') || '/';
    p = p.replace(/\.dc\.html$/, '').replace(/\.html$/, '');
    if (p === '/app/home/home' || p === '/app/home' || p === '/en' || p === '/de' || p === '/fr' || p === '/ar') return '/';
    return p;
  }
  function samePage(u) {
    return logicalPath(u.pathname) === logicalPath(location.pathname);
  }
  function vtScrollHash(tries) {
    tries = tries || 0;
    var id = (location.hash || '').replace(/^#/, '');
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) {
      if (tries < 40) setTimeout(function () { vtScrollHash(tries + 1); }, 80);
      return;
    }
    if (window.vtScrollTo) window.vtScrollTo(el, -88);
    else {
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var top = el.getBoundingClientRect().top + window.pageYOffset - 88;
      window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  function schemeColor() {
    var bg = document.body ? getComputedStyle(document.body).backgroundColor : '';
    if (!bg || /,\s*0\s*\)$/.test(bg) || bg === 'transparent') {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--vt-bg-page,#fff)';
      document.documentElement.appendChild(probe);
      bg = getComputedStyle(probe).backgroundColor;
      document.documentElement.removeChild(probe);
    }
    var m = bg.match(/[\d.]+/g) || [255, 255, 255];
    var lum = 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2];
    // Return the MEASURED ground, not the token: a #FFFFFF sheet lifting off a
    // #F6F6F6 page steps the whole viewport in one frame — that's the flash.
    return bg || (lum < 128 ? charcoal : white);
  }

  // Four cubic segments, same command structure in both, lerp'd per frame:
  // a calm rolling edge at rest, deep multi-crest surf mid-flight.
  var FLAT = [0,172, 90,182,270,182,360,172, 450,162,630,162,720,172, 810,182,990,182,1080,172, 1170,162,1350,162,1440,172, 1440,200, 0,200];
  var PEAK = [0,60, 90,150,270,-40,360,70, 450,180,630,-30,720,80, 810,190,990,-20,1080,70, 1170,160,1350,-10,1440,55, 1440,200, 0,200];
  var SEGS = (FLAT.length - 6) / 6;
  function pathAt(t) {
    var v = [], i;
    for (i = 0; i < FLAT.length; i++) v.push(FLAT[i] + (PEAK[i] - FLAT[i]) * t);
    var d = 'M' + v[0] + ',' + v[1], k = 2;
    for (i = 0; i < SEGS; i++, k += 6) d += 'C' + v[k] + ',' + v[k+1] + ' ' + v[k+2] + ',' + v[k+3] + ' ' + v[k+4] + ',' + v[k+5];
    return d + 'L' + v[k] + ',' + v[k+1] + 'L' + v[k+2] + ',' + v[k+3] + 'Z';
  }
  function ease(t) { return t * t * t * (t * (t * 6 - 15) + 10); } // smootherstep — no snap at either end

  var root = document.createElement('div');
  root.id = 'vt-page-transition';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:hidden;pointer-events:none;contain:strict';

  // A sheet is crest + panel + mirrored crest, so BOTH sweeping edges are wavy:
  // the top crest leads on the way in, the bottom crest leads on the way out.
  function makeSheet(fill) {
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;right:0;top:0;height:' + (100 + 2 * CREST) + 'vh;will-change:transform;backface-visibility:hidden';
    var wave = '<svg viewBox="0 0 1440 200" preserveAspectRatio="none" style="display:block;width:100%;height:' + CREST + 'vh;overflow:visible">' +
      '<path fill="' + fill + '"></path></svg>';
    el.innerHTML = wave +
      '<div style="width:100%;height:100vh;margin:-1px 0;background:' + fill + '"></div>' +
      wave.replace('display:block', 'display:block;transform:scaleY(-1)');
    root.appendChild(el);
    var paths = el.querySelectorAll('path');
    return { el: el, path: paths[0], tail: paths[1], panel: el.querySelector('div') };
  }
  var lead = makeSheet(yellow);          // first colour in, on the way out only
  var trail = makeSheet(schemeColor());  // the page's own ground, and the one that reveals
  function placeLogo() {}                // no lockup — the sheets carry the whole move

  function place(s, y, t) {
    s.el.style.transform = 'translateY(' + y + 'vh)';
    var d = pathAt(t < 0 ? 0 : t > 1 ? 1 : t);
    s.path.setAttribute('d', d);
    s.tail.setAttribute('d', d);
  }
  place(lead, ABOVE, 0);   // arrival: yellow is already gone
  place(trail, COVER, 1);  // arrival: the ground sheet is what covers

  function mount() {
    var host = document.body || document.documentElement;
    host.insertBefore(root, host.firstChild);
    handoff();
  }
  // Hand over from the static boot cover to the real sheet. Two frames, so the
  // sheet is demonstrably painted before the thing underneath it goes away —
  // removing it in the same frame reopens the gap this exists to close.
  function handoff() {
    var boot = document.getElementById('vt-boot-cover');
    if (!boot) return;
    function drop() { if (boot.parentNode) boot.parentNode.removeChild(boot); }
    requestAnimationFrame(function () { requestAnimationFrame(drop); });
    setTimeout(drop, 400); // rAF is suspended in a hidden document
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var animating = false;
  // legs are [sheet, fromY, toY, fromT, toT, startDelay, ripplePhase]
  function play(legs, duration, cb) {
    animating = true;
    var t0 = Date.now(), span = duration, done = false, watchdog, i;
    for (i = 0; i < legs.length; i++) span = Math.max(span, duration + legs[i][5]);
    function step(leg, ms) {
      var p = Math.max(0, Math.min(1, (ms - leg[5]) / duration)), e = ease(p);
      // the morph rides a sine on top of the sweep, windowed to zero at both
      // ends, so the crest visibly sloshes instead of gliding
      var slosh = 0.26 * Math.sin(Math.PI * p) * Math.sin(ms / 105 + leg[6]);
      place(leg[0], leg[1] + (leg[2] - leg[1]) * e, leg[3] + (leg[4] - leg[3]) * e + slosh);
    }
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      for (var j = 0; j < legs.length; j++) place(legs[j][0], legs[j][2], legs[j][4]);
      animating = false;
      if (cb) cb();
    }
    function frame() {
      if (done) return;
      var ms = Date.now() - t0;
      for (var j = 0; j < legs.length; j++) step(legs[j], ms);
      if (ms >= span) finish(); else requestAnimationFrame(frame);
    }
    watchdog = setTimeout(finish, span + 400);
    requestAnimationFrame(frame);
  }

  function park() { // off-screen: the overlay must never swallow a click
    place(lead, ABOVE, 0); place(trail, ABOVE, 0); placeLogo(0);
    root.style.pointerEvents = 'none';
    // Two full-viewport composited layers cost every later frame on the page;
    // re-armed on the way out, where they are actually earning their keep.
    lead.el.style.willChange = 'auto'; trail.el.style.willChange = 'auto';
  }
  var revealed = false;
  var leaving = false; // covers the gap between the sheets landing and the navigation
  function reveal() {
    if (revealed) return;
    revealed = true;
    if (reduced) { park(); return; }
    play([[trail, COVER, ABOVE, 1, 0, 0, 1.7]], OUT, park);
  }
  // The cover IS the loading state. The navigation fires the moment the sheets
  // land on the way out, so the next document is already fetching while this
  // sheet still covers. Hold until the page underneath has actually rendered;
  // DOMContentLoaded is far too early (the component runtime paints the
  // template after it), so watch for a rendered body, capped.
  var arrivedAt = Date.now();
  // support.js does dc.replaceWith(<div id="dc-root">) before React renders, so
  // <x-dc> is gone by the time anything could be true of it — probing for it made
  // this whole clause unreachable and quietly reduced the wait to window.load.
  function pageReady() {
    if (document.readyState === 'complete') return true;
    var host = document.getElementById('dc-root');
    return !!(host && host.firstElementChild && document.body && document.body.offsetHeight > innerHeight * 0.8);
  }
  function whenReady(startedAt) {
    var waited = Date.now() - startedAt;
    if ((pageReady() && waited >= HOLD) || waited > CAP) {
      requestAnimationFrame(function () { requestAnimationFrame(reveal); }); // one painted frame first
      setTimeout(reveal, 120); // rAF is frozen in a hidden document
      return;
    }
    setTimeout(function () { whenReady(startedAt); }, 60);
  }
  whenReady(arrivedAt);
  addEventListener('load', function () { setTimeout(vtScrollHash, 80); });
  addEventListener('pageshow', function (e) { if (e.persisted) { animating = false; leaving = false; park(); } });

  function eligible(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
    if (a.getAttribute('rel') === 'external') return false;
    var hrefAttr = a.getAttribute('href') || '';
    // Hash-only hrefs stay on this document. A document base URL would otherwise
    // resolve them onto another pathname and play the overlay as a page change.
    if (hrefAttr.charAt(0) === '#') return false;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return false; }
    if (u.origin !== location.origin) return false;
    if (samePage(u) && u.search === location.search && u.hash) return false;
    return true;
  }

  document.addEventListener('click', function (e) {
    if (animating || leaving || reduced || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!eligible(a)) return;
    e.preventDefault();
    var href = a.href;
    leaving = true;
    root.style.pointerEvents = 'auto';
    lead.el.style.willChange = 'transform'; trail.el.style.willChange = 'transform';
    place(lead, BELOW, 0); place(trail, BELOW, 0); placeLogo(0); // parked under — as unseen as ABOVE, so the snap reads as nothing
    play([[lead, BELOW, COVER, 0, 1, 0, 0], [trail, BELOW, COVER, 0, 1, STAGGER, 2.4]], LEG, function () {
      location.href = href; // fired the instant the screen is covered, not after the logo beat
      setTimeout(park, 4000); // navigation blocked or refused — never strand the page under the cover
    });
  }, true);
})();
