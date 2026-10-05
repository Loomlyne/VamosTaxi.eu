/* Vamos Taxi — staff JSON client for the DC ops mock.

   Absolute /api/… only. serveOpsDc injects <base href="/app/ops/">, so a
   relative path without that prefix would resolve under /app/ops/. Never log tokens.
   Never write CHF.

   Session watch (U8a, 2026-10-05). The shell is one document that swaps screens in place, and a
   screen is a file the runtime fetches the first time it is shown (`/app/ops/<Name>.dc.html`). Those
   files are staff-only: once the session has died the gate answers the same private 404 a missing file
   gets, and the runtime renders an empty placeholder, so the person saw a blank page with a sidebar.
   Two answers now send the browser to /login instead:
     - a staff API answer that says the session is gone (401 `no-session`, or 403 `needs-mfa`, the
       second factor is asked for on /login);
     - a screen file answering 404 while /api/staff/me says the same (a 404 alone can be a missing file).
   Only those answers count: every other 4xx stays the screen's own message.
   A screen file 404 while /api/staff/me says the session is alive (the gate waits at most 5 s for
   Supabase Auth and answers the private 404 past that) reloads the page once: the DC runtime keeps the
   miss and never asks for that file again, so without the reload the screen stays blank. */
(function () {
  // The shell's helmet can run this file twice (parser, then the dc-runtime): one watcher only.
  var LOST_KEY = "vamosOpsSessionLostAt";
  var RETRY_KEY = "vamosOpsScreenRetryAt";
  var RETRY_COUNT_KEY = "vamosOpsScreenRetryCount";
  var RETRY_GAP_MS = 15000;
  var RETRY_MAX = 2;
  var RETRY_WINDOW_MS = 600000;
  var lost = false;
  var probing = false;
  var reloadWanted = false;
  // The files a miss of which may reload a live page: the screens ops.dc.html mounts by route, and its
  // top-level imports (OpsSidebar: imported outside any sc-if, fetched once when the shell boots, so a miss
  // leaves the shell without a sidebar until a reload). Every other file under /app/ops/ is a part a screen
  // fetches while it runs (PlaceSearch when OpsDetail enters edit mode, BrandSelect, ActionsMenu inside the
  // conditional top bar, OpsTable ...), and a reload there would throw the edit away. A test reads the shell's
  // markup and keeps this list equal to its route mounts plus its top-level imports.
  var SHELL_SCREENS = {
    OpsDash: 1, OpsBoard: 1, OpsNewTrip: 1, OpsFleet: 1, OpsDetail: 1, OpsPricing: 1, OpsReviews: 1,
    OpsContent: 1, OpsCalendarBoard: 1, OpsCustomers: 1, OpsSupportTicket: 1, OpsSettings: 1, OpsProfile: 1,
    OpsSidebar: 1
  };

  function endSession() {
    if (lost) return;
    try { localStorage.removeItem("vamosOpsAuth"); } catch (e) {}
    // A page that came back from /login a moment ago and still sees a dead session would bounce
    // for ever; the second time within 15 s it stays where it is. `lost` is set only once the guard has
    // let the redirect through: a held-back redirect must not use up the page, or a death after the
    // window would never redirect until a reload.
    try {
      var last = Number(sessionStorage.getItem(LOST_KEY) || 0);
      var now = Date.now();
      if (last && now - last < 15000) return;
      sessionStorage.setItem(LOST_KEY, String(now));
    } catch (e) {}
    lost = true;
    location.replace("/login");
  }

  function sameOriginPath(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname : "";
    } catch (e) {
      return "";
    }
  }

  function deadSessionBody(status, json) {
    if (!json || typeof json !== "object") return false;
    return (status === 401 && json.code === "no-session") || (status === 403 && json.code === "needs-mfa");
  }

  function readJson(res) {
    return res.clone().json().then(function (json) { return json; }, function () { return null; });
  }

  // A number kept in session storage, or 0 when it is missing or is not a plain number >= 0. A junk value
  // (NaN, a negative, text) must never switch the reload guard off: `NaN >= 2` is false, and the writer below
  // would store "NaN" again, so the page would be reloaded every 16 s for ever.
  function storedNumber(key) {
    var n = Number(sessionStorage.getItem(key));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // The session is alive but a screen file came back 404 (Auth was slow, or the file is really missing):
  // reload the page, but not for ever. Per tab, in session storage: never within 15 s of the last reload,
  // and at most twice (the probe behind this has no time limit of its own, so Auth that stays slow would
  // otherwise repeat "404, probe answers, 15 s have passed" for ever). After ten quiet minutes the count
  // starts again. Without storage there is no guard, so there is no reload (a blank screen is better
  // than a loop).
  function reloadOnce() {
    try {
      var last = storedNumber(RETRY_KEY);
      var count = storedNumber(RETRY_COUNT_KEY);
      var now = Date.now();
      if (last && now - last >= RETRY_WINDOW_MS) count = 0;
      if (last && now - last < RETRY_GAP_MS) return;
      if (!(count < RETRY_MAX)) return;
      sessionStorage.setItem(RETRY_KEY, String(now));
      sessionStorage.setItem(RETRY_COUNT_KEY, String(count + 1));
    } catch (e) {
      return;
    }
    location.reload();
  }

  // A screen file answered 404: ask the session itself before calling it dead.
  function probeSession(rawFetch) {
    if (probing || lost) return;
    probing = true;
    rawFetch("/api/staff/me", { method: "GET", credentials: "include" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          return readJson(res).then(function (json) { if (deadSessionBody(res.status, json)) endSession(); });
        }
        if (res.ok && reloadWanted) reloadOnce();
      })
      .catch(function () {})
      .then(function () { probing = false; reloadWanted = false; });
  }

  function inspect(rawFetch, url, res) {
    if (!res || typeof res.status !== "number") return;
    var path = sameOriginPath(res.url || url);
    if (!path) return;
    var screen = /^\/app\/ops\/([^/]+)\.dc\.html$/.exec(path);
    if (res.status === 404 && screen) {
      // Any miss asks whether the session is dead; only a shell screen's miss (route screen or the sidebar) may
      // reload a live one.
      if (Object.prototype.hasOwnProperty.call(SHELL_SCREENS, screen[1])) reloadWanted = true;
      probeSession(rawFetch);
      return;
    }
    if ((res.status === 401 || res.status === 403) && path.indexOf("/api/") === 0 && path !== "/api/auth") {
      readJson(res).then(function (json) { if (deadSessionBody(res.status, json)) endSession(); });
    }
  }

  function watchFetch() {
    var rawFetch = window.fetch;
    if (typeof rawFetch !== "function" || rawFetch.__vamosOpsWatch) return;
    var watched = function (input) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      return rawFetch.apply(window, arguments).then(function (res) {
        try { inspect(function () { return rawFetch.apply(window, arguments); }, url, res); } catch (e) {}
        return res;
      });
    };
    watched.__vamosOpsWatch = true;
    window.fetch = watched;
  }

  function request(method, path, body) {
    if (typeof path !== "string" || path.indexOf("/api/") !== 0) {
      return Promise.resolve({ ok: false, code: "bad-path" });
    }
    var opts = { method: method, credentials: "include" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts)
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          if (text) {
            try { json = JSON.parse(text); } catch (e) { json = null; }
          }
          if (json && typeof json === "object") {
            if (res.status === 405 && json.ok !== true) {
              json.ok = false;
              json.code = json.code && json.code !== "http" ? json.code : "method-not-allowed";
              json.status = res.status;
            }
            return json;
          }
          if (res.status === 405) return { ok: false, code: "method-not-allowed", status: 405 };
          return { ok: false, code: "http", status: res.status };
        });
      })
      .catch(function () {
        return { ok: false, code: "network" };
      });
  }

  watchFetch();
  window.VamosOpsApi = { request: request };
})();
