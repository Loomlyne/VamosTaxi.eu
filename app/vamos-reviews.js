/* Vamos Taxi — the one review store.

   Public home hydrates GET /api/reviews (published only). Ops writes through
   GET/POST/PATCH/DELETE /api/staff/reviews. all() is [] until hydrate (D-35).
   Zero avatars is the shipping state (D-22). */
(function () {
  var SOURCES = [
    { id: "google", label: "Google", imported: true },
    { id: "tripadvisor", label: "Tripadvisor", imported: true },
    { id: "trustpilot", label: "Trustpilot", imported: true },
    { id: "manual", label: "Collected by us", imported: false }
  ];

  var list = [];
  var pending = false;
  var loaded = false;
  var subs = [];
  var base = "/api/staff/reviews";

  function isOpsHost() {
    try {
      return String(location.hostname || "").indexOf("dashboard.") === 0;
    } catch (e) {
      return false;
    }
  }

  function listPath() {
    return isOpsHost() ? "/api/staff/reviews" : "/api/reviews";
  }

  function isImported(source) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === source) return SOURCES[i].imported;
    return false;
  }

  function api(method, path, body) {
    var client = window.VamosOpsApi;
    if (client && typeof client.request === "function") {
      return client.request(method, path, body);
    }
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
          if (json && typeof json === "object") return json;
          return { ok: false, code: "http", status: res.status };
        });
      })
      .catch(function () {
        return { ok: false, code: "network" };
      });
  }

  function fromApi(r) {
    r = r || {};
    var src = r.source && isImported(r.source) !== undefined ? r.source : "manual";
    var avatar = r.avatarPath || r.avatar || "";
    return {
      id: r.id || "",
      source: src,
      name: r.authorName || r.name || "",
      role: r.authorRole || r.role || "",
      text: r.body || r.text || "",
      rating: Math.max(0, Math.min(5, +(r.rating) || 0)),
      route: r.routeLabel || r.route || "",
      vehicleClass: r.vehicleClassSlug || r.vehicleClass || "",
      vehicleClassId: r.vehicleClassId || null,
      avatar: avatar,
      url: r.sourceUrl || r.url || "",
      verified: !!r.verified,
      published: r.published === false ? false : true,
      locked: r.locked === true || isImported(src),
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : 0
    };
  }

  function toPayload(r) {
    r = r || {};
    return {
      authorName: r.name || "",
      authorRole: r.role || "",
      body: r.text || "",
      rating: r.rating,
      routeLabel: r.route || "",
      vehicleClassId: r.vehicleClassId || null,
      avatarPath: r.avatar || null,
      sourceUrl: r.url || null,
      source: r.source || "manual",
      verified: !!r.verified,
      published: r.published !== false,
      sortOrder: r.sortOrder
    };
  }

  function pickRows(json) {
    if (!json || json.ok === false) return [];
    var data = json.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }

  function emit() {
    var snapshot = list.slice();
    subs.slice().forEach(function (fn) { try { fn(snapshot); } catch (e) {} });
    try {
      window.dispatchEvent(new CustomEvent("vamos:reviews", { detail: { rows: snapshot } }));
    } catch (e) {}
  }

  function hydrate() {
    if (pending || loaded) return;
    pending = true;
    api("GET", listPath()).then(function (json) {
      pending = false;
      loaded = true;
      list = pickRows(json).map(fromApi);
      emit();
    });
  }

  function afterWrite(json, previous, nextList) {
    if (json && json.ok) {
      var rows = pickRows(json);
      list = rows.length ? rows.map(fromApi) : nextList;
    } else {
      list = previous;
    }
    emit();
  }

  window.VamosReviews = {
    SOURCES: SOURCES,
    sourceLabel: function (id) {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i].label;
      return id || "";
    },
    isImported: isImported,
    all: function () { hydrate(); return list.slice(); },
    published: function () {
      hydrate();
      return list.filter(function (r) { return r.published; });
    },
    get: function (id) {
      hydrate();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    blank: function () {
      return fromApi({
        id: "",
        source: "manual",
        rating: 5,
        published: false,
        verified: false,
        avatarPath: null
      });
    },
    upsert: function (rec) {
      var row = fromApi(rec || {});
      var i;
      for (i = 0; i < list.length; i++) if (list[i].id === row.id) return this.update(row.id, row);
      return this.add(row);
    },
    add: function (r) {
      var previous = list.slice();
      var row = fromApi(r || {});
      api("POST", base, toPayload(row)).then(function (json) {
        afterWrite(json, previous, previous.concat([row]));
      });
      return previous.slice();
    },
    update: function (id, patch) {
      var previous = list.slice();
      var body = patch || {};
      if (body.move === "up" || body.move === "down") {
        api("PATCH", base + "/" + encodeURIComponent(id), { move: body.move }).then(function (json) {
          afterWrite(json, previous, previous);
        });
        return previous.slice();
      }
      if (Object.keys(body).length === 1 && Object.prototype.hasOwnProperty.call(body, "published")) {
        api("PATCH", base + "/" + encodeURIComponent(id), { published: !!body.published }).then(function (json) {
          afterWrite(json, previous, previous);
        });
        return previous.slice();
      }
      var current = null;
      var i;
      for (i = 0; i < previous.length; i++) if (previous[i].id === id) current = previous[i];
      var merged = {};
      var k;
      if (current) for (k in current) merged[k] = current[k];
      for (k in body) merged[k] = body[k];
      api("PATCH", base + "/" + encodeURIComponent(id), toPayload(merged)).then(function (json) {
        afterWrite(json, previous, previous.map(function (r) { return r.id === id ? fromApi(merged) : r; }));
      });
      return previous.slice();
    },
    remove: function (id) {
      var previous = list.slice();
      api("DELETE", base + "/" + encodeURIComponent(id)).then(function (json) {
        afterWrite(json, previous, previous.filter(function (r) { return r.id !== id; }));
      });
      return previous.slice();
    },
    move: function (id, dir) {
      var move = dir < 0 ? "up" : "down";
      return this.update(id, { move: move });
    },
    reorder: function (fromId, toId) {
      var previous = list.slice();
      var from = -1;
      var to = -1;
      previous.forEach(function (r, i) { if (r.id === fromId) from = i; if (r.id === toId) to = i; });
      if (from < 0 || to < 0 || from === to) return previous.slice();
      var steps = Math.abs(from - to);
      var move = from < to ? "down" : "up";
      var chain = Promise.resolve();
      var n;
      for (n = 0; n < steps; n++) {
        chain = chain.then(function () {
          return api("PATCH", base + "/" + encodeURIComponent(fromId), { move: move });
        });
      }
      chain.then(function (json) {
        afterWrite(json, previous, previous);
      });
      return previous.slice();
    },
    reset: function () { list = []; loaded = false; pending = false; emit(); hydrate(); return list.slice(); },
    onChange: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    }
  };
})();
