/* Local stand-in for Meta's script (Phase 28 plan 28-06). It mimics the contract the loader relies on,
   as observed in the real script: it drains fbq.queue, honours "consent revoke" by queueing instead of
   sending (and this stub never replays), writes _fbp like Meta (fb.1.<ms>.<10 digits>, 90 days,
   domain=.vamostaxi.site, path=/), sends a PageView as an image request, and counts an address change
   as a page view unless fbq.disablePushState is true. Calls are recorded on window.__fbqCalls. */
(function () {
  var fbq = window.fbq;
  if (!fbq) return;
  var HOST = 'https://www.' + 'face' + 'book' + '.com/tr/';
  var calls = (window.__fbqCalls = window.__fbqCalls || []);
  var id = '';
  var locked = false;
  var held = [];

  function writeFbp() {
    if (/(^|; )_fbp=/.test(document.cookie)) return;
    var expires = new Date(Date.now() + 90 * 24 * 3600 * 1000).toUTCString();
    var digits = String(Math.floor(Math.random() * 9e9) + 1e9);
    document.cookie = '_fbp=fb.1.' + Date.now() + '.' + digits + '; expires=' + expires + '; domain=.vamostaxi.site; path=/';
  }

  function pageView() {
    writeFbp();
    if (location.search.indexOf('fbclid') !== -1) {
      try { localStorage.setItem('multiFbc', 'x'); } catch (e) {}
    }
    var img = new Image();
    img.src = HOST + '?id=' + encodeURIComponent(id) + '&ev=PageView&dl=' + encodeURIComponent(location.href) + '&rl=' + encodeURIComponent(document.referrer) + '&n=' + Math.random();
  }

  function handle(args) {
    var a = Array.prototype.slice.call(args);
    calls.push(a);
    if (a[0] === 'consent' && a[1] === 'revoke') { locked = true; return; }
    if (a[0] === 'init') { id = a[1]; return; }
    if (a[0] === 'track' || a[0] === 'trackCustom') {
      if (locked) { held.push(a); return; }
      pageView();
    }
  }

  var queued = fbq.queue || [];
  fbq.queue = [];
  fbq.callMethod = function () { handle(arguments); };
  for (var i = 0; i < queued.length; i++) handle(queued[i]);

  /* Meta wraps pushState/replaceState and counts each address change, unless told not to. */
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var out = original.apply(this, arguments);
      if (fbq.disablePushState !== true) handle(['trackCustom', 'PageView']);
      return out;
    };
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && fbq.disablePushState !== true) handle(['trackCustom', 'PageView']);
  });
})();
