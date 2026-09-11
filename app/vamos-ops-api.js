/* Vamos Taxi — staff JSON client for the DC ops mock.

   Absolute /api/… only. serveOpsDc injects <base href="/app/ops/">, so a
   relative path without that prefix would resolve under /app/ops/. Never log tokens.
   Never write CHF. */
(function () {
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

  window.VamosOpsApi = { request: request };
})();
