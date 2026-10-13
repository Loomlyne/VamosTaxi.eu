/* Vamos Taxi — staff JSON client for the DC ops mock.

   Absolute /api/… only. serveOpsDc injects <base href="/app/ops/">, so a
   relative path without that prefix would resolve under /app/ops/. Never log tokens.
   Never write CHF.

   Session watch (U8a, 2026-10-05). The shell is one document that swaps screens in place, and a
   screen is a file the runtime fetches the first time it is shown (`/app/ops/<Name>.dc.html`). Those
   files are staff-only: once the session has died the gate answers the same private 404 a missing file
   gets, and the runtime renders an empty placeholder, so the person saw a blank page with a sidebar.
   Two answers now send the browser to /login instead:
     - a staff API answer that says the session is gone (401 `no-session`, 403 `needs-mfa`, the
       second factor is asked for on /login, or 403 `not-staff` from /api/staff/*: the staff row was
       switched off, security S13);
     - a screen file answering 404 while /api/staff/me says the same (a 404 alone can be a missing file).
   Only those answers count: every other 4xx stays the screen's own message.
   A WRITE (POST, PUT, PATCH, DELETE) answered that way does not redirect at once: that would throw away
   the form the person is typing. The page stays, the screen shows its own error, the page marks the
   session lost, and the next read (a staff/API call or a screen file), history.pushState or popstate
   goes to /login instead. A staff write that then goes through clears the mark.
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
  // A write the server refused for a dead session leaves the page where it is (the typed form stays, the screen
  // shows its own error) and sets this mark; the next read, screen load or navigation then goes to /login.
  var lostPending = false;
  // When the mark was last set (each refused write sets it again). The hold the console store keeps on its automatic
  // bookings reads lasts HOLD_MS from here; after that the next poll tick is "the next read" and goes to /login, so a
  // refusal nobody looks at (a drag on the calendar board whose answer the screen ignores) cannot freeze the page for ever.
  var lostPendingAt = 0;
  var HOLD_MS = 60000;
  var probing = false;
  var reloadWanted = false;
  // The files a miss of which may reload a live page: the screens ops.dc.html mounts by route, and its
  // top-level imports (OpsSidebar: imported outside any sc-if, fetched once when the shell boots, so a miss
  // leaves the shell without a sidebar until a reload). Every other file under /app/ops/ is a part a screen
  // fetches while it runs (PlaceSearch when OpsDetail enters edit mode, BrandSelect, ActionsMenu inside the
  // conditional top bar, OpsTable ...), and a reload there would throw the edit away. A test reads the shell's
  // markup and keeps this list equal to its route mounts plus its top-level imports.
  var SHELL_SCREENS = {
    OpsDash: 1, OpsBoard: 1, OpsNewTrip: 1, OpsChauffeurs: 1, OpsDetail: 1, OpsPricing: 1, OpsReviews: 1,
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
      var now = Date.now();
      var last = storedTime(LOST_KEY, now);
      if (last && now - last < 15000) return;
      sessionStorage.setItem(LOST_KEY, String(now));
    } catch (e) {}
    lost = true;
    lostPending = false;
    location.replace("/login");
  }

  // The page's session is known lost (a write was refused for it) and the person has moved on: go now.
  function leaveIfLostPending() {
    if (!lostPending) return;
    try { endSession(); } catch (e) {}
  }

  function isWrite(method) {
    return /^(POST|PUT|PATCH|DELETE)$/.test(method);
  }

  function methodOf(input, init) {
    var m = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
    return String(m).toUpperCase();
  }

  // The reads that count as "the next read": the console's own, a staff/API call or a screen file. Fonts, photos,
  // other origins and the sign-in calls do not.
  function consoleRead(method, url) {
    if (method !== "GET" && method !== "HEAD") return false;
    var path = sameOriginPath(url);
    return (path.indexOf("/api/") === 0 && path !== "/api/auth") || /^\/app\/ops\/[^/]+\.dc\.html$/.test(path);
  }

  function sameOriginPath(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname : "";
    } catch (e) {
      return "";
    }
  }

  // The answers that say this person has no console session any more: 401 no-session, 403 needs-mfa (the second
  // factor is asked for on /login), and 403 not-staff from /api/staff/* (security S13: the staff row was switched
  // off while the token still looked fine; every staff call answers it and the screens stay blank). Anything
  // else, not-admin, csrf, staff-check-failed (503), a code-less 401/403, stays the screen's own message.
  function deadSessionBody(status, json, path) {
    if (!json || typeof json !== "object") return false;
    if (status === 401) return json.code === "no-session";
    if (status === 403) {
      return json.code === "needs-mfa" || (json.code === "not-staff" && String(path).indexOf("/api/staff/") === 0);
    }
    return false;
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

  // A time mark kept in session storage, or 0 when it has not happened yet. A mark in the future (a clock that was set
  // back, a bad value) would make `now - last` negative, which reads as "just now" for as long as the clock stays behind
  // it: the 15 s guards would hold every reload and every redirect back. A mark that has not happened is no mark.
  function storedTime(key, now) {
    var t = storedNumber(key);
    return t > now ? 0 : t;
  }

  // The question the console store asks before an automatic read: is a write the server refused for a dead session
  // waiting, and is it still inside its hold? Read-only. Past HOLD_MS (or if the clock went back) the answer is no, and the
  // store's next poll tick is an ordinary read that finds the page marked and goes to /login.
  function sessionLostPending() {
    var age = Date.now() - lostPendingAt;
    return lostPending && age >= 0 && age < HOLD_MS;
  }

  // The session is alive but a screen file came back 404 (Auth was slow, or the file is really missing):
  // reload the page, but not for ever. Per tab, in session storage: never within 15 s of the last reload,
  // and at most twice (the probe behind this has no time limit of its own, so Auth that stays slow would
  // otherwise repeat "404, probe answers, 15 s have passed" for ever). After ten quiet minutes the count
  // starts again. Without storage there is no guard, so there is no reload (a blank screen is better
  // than a loop).
  function reloadOnce() {
    try {
      var now = Date.now();
      var last = storedTime(RETRY_KEY, now);
      var count = storedNumber(RETRY_COUNT_KEY);
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
          return readJson(res).then(function (json) { if (deadSessionBody(res.status, json, "/api/staff/me")) endSession(); });
        }
        if (res.ok && reloadWanted) reloadOnce();
      })
      .catch(function () {})
      .then(function () { probing = false; reloadWanted = false; });
  }

  function inspect(rawFetch, url, res, method) {
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
      readJson(res).then(function (json) {
        if (!deadSessionBody(res.status, json, path)) return;
        // A read goes to /login at once. A write must not: the redirect would throw away the form it was sent
        // from. It marks the session lost and the next read, screen load or navigation goes instead.
        if (isWrite(method)) {
          lostPending = true;
          lostPendingAt = Date.now();
        } else {
          endSession();
        }
      });
      return;
    }
    // A staff write that went through proves the session is alive (a refresh race refused the first try):
    // the mark of an earlier refused write is void.
    if (res.ok && isWrite(method) && path.indexOf("/api/staff/") === 0) lostPending = false;
  }

  function watchFetch() {
    var rawFetch = window.fetch;
    if (typeof rawFetch !== "function" || rawFetch.__vamosOpsWatch) return;
    var watched = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = methodOf(input, init);
      if (lostPending && consoleRead(method, url)) leaveIfLostPending();
      return rawFetch.apply(window, arguments).then(function (res) {
        try { inspect(function () { return rawFetch.apply(window, arguments); }, url, res, method); } catch (e) {}
        return res;
      });
    };
    watched.__vamosOpsWatch = true;
    window.fetch = watched;
  }

  // The shell changes screen with history.pushState (and fires popstate itself); the back and forward buttons
  // fire popstate. With a refused write pending, either one is the person moving on: go to /login.
  function watchNavigation() {
    var h = window.history;
    if (!h || typeof h.pushState !== "function" || h.pushState.__vamosOpsWatch) return;
    var push = h.pushState;
    var watchedPush = function () {
      leaveIfLostPending();
      return push.apply(h, arguments);
    };
    watchedPush.__vamosOpsWatch = true;
    h.pushState = watchedPush;
    if (typeof window.addEventListener === "function") window.addEventListener("popstate", leaveIfLostPending);
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
  watchNavigation();
  // The shell's helmet can run this file twice. The first run owns the watcher and its mark (`lostPending`), so its API
  // object stays: a second one would answer for a mark nothing sets. `sessionLostPending()` is read-only; the console store
  // asks it to hold its automatic bookings poll while a refused write waits (vamos-ops-data.js).
  if (!(window.VamosOpsApi && typeof window.VamosOpsApi.sessionLostPending === "function")) {
    window.VamosOpsApi = { request: request, sessionLostPending: sessionLostPending };
  }
})();
