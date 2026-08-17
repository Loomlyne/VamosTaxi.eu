/* Vamos Taxi — one Lenis instance per surface. Loaded after assets/lenis.js.
   Tuned to the brand's motion rules (§3 Motion): short, flat, no bounce. */
(function () {
  if (window.__vtLenisBoot) return;
  window.__vtLenisBoot = true;

  var SETTINGS = {
    lerp: 0.12,            // damping, not a fixed duration — punctual, never floaty
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,      // touch keeps the platform's native scrolling
    anchors: true,         // in-page #hash links glide, honouring scroll-margin-top
    allowNestedScroll: true, // tables, sheets, dropdowns keep their own scroll
    autoRaf: true
  };

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lenis = null, lockObserver = null, tries = 0;

  function locked(el) {
    if (!el) return false;
    var o = getComputedStyle(el);
    var v = o.overflowY === 'visible' ? o.overflow : o.overflowY;
    return v === 'hidden' || v === 'clip';
  }

  // Screens lock the page behind sheets and dialogs with body{overflow:hidden}.
  // Lenis drives window scroll, so that lock has to reach the instance too.
  function syncLock() {
    if (!lenis) return;
    if (locked(document.body) || locked(document.documentElement)) lenis.stop();
    else lenis.start();
  }

  function boot() {
    if (lenis) return;
    lenis = new window.Lenis(SETTINGS);
    window.__vtLenis = lenis;
    lockObserver = new MutationObserver(syncLock);
    lockObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    lockObserver.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    syncLock();
  }

  function teardown() {
    if (!lenis) return;
    if (lockObserver) { lockObserver.disconnect(); lockObserver = null; }
    lenis.destroy();
    lenis = null;
    window.__vtLenis = null;
  }

  function apply() {
    if (mq.matches) { teardown(); return; }
    // Helmet scripts are injected, so load order is not guaranteed — wait for the library.
    if (!window.Lenis || !document.body) { if (++tries < 400) setTimeout(apply, 25); return; }
    boot();
  }

  /* One way to move the page. Lenis owns the scroll position while it is running,
     so a native window.scrollTo is overwritten on its next frame and the visitor
     stays where they were — every in-page jump goes through here instead. */
  window.vtScrollTo = function (target, offset) {
    var el = typeof target === 'string' ? document.getElementById(String(target).replace(/^#/, '')) : target;
    if (!el) return false;
    var off = typeof offset === 'number' ? offset : -24;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (window.__vtLenis) { window.__vtLenis.scrollTo(el, { offset: off, immediate: mq.matches }); return; }
        var top = el.getBoundingClientRect().top + window.pageYOffset + off;
        window.scrollTo({ top: top, behavior: mq.matches ? 'auto' : 'smooth' });
      });
    });
    return true;
  };

  apply();
  if (mq.addEventListener) mq.addEventListener('change', function () { tries = 0; apply(); });
  else if (mq.addListener) mq.addListener(function () { tries = 0; apply(); });
})();
