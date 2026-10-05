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
   Only those answers count: every other 4xx stays the screen's own message. */
(function () {
  // The shell's helmet can run this file twice (parser, then the dc-runtime): one watcher only.
  var LOST_KEY = "vamosOpsSessionLostAt";
  var lost = false;
  var probing = false;

  function endSession() {
    if (lost) return;
    lost = true;
    try { localStorage.removeItem("vamosOpsAuth"); } catch (e) {}
    // A page that came back from /login a moment ago and still sees a dead session would bounce
    // for ever; the second time within 15 s it stays where it is.
    try {
      var last = Number(sessionStorage.getItem(LOST_KEY) || 0);
      var now = Date.now();
      if (last && now - last < 15000) return;
      sessionStorage.setItem(LOST_KEY, String(now));
    } catch (e) {}
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

  // A screen file answered 404: ask the session itself before calling it dead.
  function probeSession(rawFetch) {
    if (probing || lost) return;
    probing = true;
    rawFetch("/api/staff/me", { method: "GET", credentials: "include" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          return readJson(res).then(function (json) { if (deadSessionBody(res.status, json)) endSession(); });
        }
      })
      .catch(function () {})
      .then(function () { probing = false; });
  }

  function inspect(rawFetch, url, res) {
    if (!res || typeof res.status !== "number") return;
    var path = sameOriginPath(res.url || url);
    if (!path) return;
    if (res.status === 404 && /^\/app\/ops\/[^/]+\.dc\.html$/.test(path)) {
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
