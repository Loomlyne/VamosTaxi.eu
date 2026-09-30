/* Vamos Taxi — page transition retired.

   Helmets still load this file. It only drops #vt-boot-cover so the static
   first-paint sheet does not stick, then native navigation takes over.
   No overlay. No cubes. No glow. No click intercept. */
(function () {
  var host = location.hostname || '';
  var path = location.pathname || '';
  function dropBoot() {
    var boot = document.getElementById('vt-boot-cover');
    if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
    var overlay = document.getElementById('vt-page-transition');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  if (host.indexOf('dashboard.') === 0 || host.indexOf('vamos-ops-changes') === 0 || path.indexOf('/app/ops') === 0) {
    dropBoot();
    return;
  }
  dropBoot();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dropBoot);
  }

  function logicalPath(p) {
    p = (p || '/').replace(/\/+$/, '') || '/';
    p = p.replace(/\.dc\.html$/, '').replace(/\.html$/, '');
    if (p === '/app/home/home' || p === '/app/home' || p === '/en' || p === '/de' || p === '/fr' || p === '/ar') return '/';
    if (p === '/app/ops' || p === '/app/ops/ops') return '/app/ops';
    return p;
  }
  void logicalPath;

  function vtScrollHash(tries) {
    tries = tries || 0;
    var id = (location.hash || '').replace(/^#/, '');
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) {
      if (tries < 40) setTimeout(function () { vtScrollHash(tries + 1); }, 80);
      return;
    }
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var top = el.getBoundingClientRect().top + window.pageYOffset - 88;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
  }
  addEventListener('load', function () { setTimeout(vtScrollHash, 80); });
})();
