/* Vamos Taxi — the one review store.

   Public home hydrates GET /api/reviews (published only). Ops writes through
   GET/POST/PATCH/DELETE /api/staff/reviews. all() is [] until hydrate (D-35).
   Zero avatars is the shipping state (D-22). */
(function () {
  if (window.VamosReviews) return;
  var SOURCES = [
    { id: "google", label: "Google", imported: true, logo: "/assets/reviews/google.svg", star: "/assets/reviews/google-star.svg" },
    { id: "tripadvisor", label: "Tripadvisor", imported: true, logo: "/assets/reviews/tripadvisor.svg", star: "/assets/reviews/tripadvisor-star.svg" },
    { id: "trustpilot", label: "Trustpilot", imported: true, logo: "/assets/reviews/trustpilot-stacked-ink.svg", star: "/assets/reviews/trustpilot-star.svg" },
    { id: "manual", label: "Collected by us", imported: false }
  ];

  function findSource(id) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
    return null;
  }

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
    var s = findSource(source);
    return !!(s && s.imported);
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
      name: r.authorName != null ? String(r.authorName) : (r.name != null ? String(r.name) : ""),
      role: r.authorRole != null ? String(r.authorRole) : (r.role != null ? String(r.role) : ""),
      text: r.body != null ? String(r.body) : (r.text != null ? String(r.text) : ""),
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

  function classSlugOf(v) {
    return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function classIdFromRow(r) {
    r = r || {};
    if (r.vehicleClassId) return r.vehicleClassId;
    var needle = classSlugOf(r.vehicleClass);
    if (!needle) return null;
    var classes = [];
    try {
      if (window.VamosOps && window.VamosOps.CLASSES) classes = window.VamosOps.CLASSES;
    } catch (e) {}
    var i, c, slug, label;
    for (i = 0; i < classes.length; i++) {
      c = classes[i] || {};
      if (!c.id) continue;
      if (String(c.id).toLowerCase() === needle) return c.id;
      slug = classSlugOf(c.slug);
      label = classSlugOf(c.label || c.name);
      if (slug === needle || label === needle) return c.id;
    }
    return needle;
  }

  function toPayload(r) {
    r = r || {};
    return {
      authorName: r.name != null ? String(r.name) : "",
      authorRole: r.role != null ? String(r.role) : "",
      body: r.text != null ? String(r.text) : "",
      rating: r.rating,
      routeLabel: r.route || "",
      vehicleClassId: classIdFromRow(r),
      avatarPath: null,
      sourceUrl: String(r.url || "").trim() || null,
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
      var s = findSource(id);
      return s ? s.label : (id || "");
    },
    sourceLogo: function (id) {
      var s = findSource(id);
      return (s && s.logo) || "";
    },
    starSrc: function (id) {
      var s = findSource(id);
      return (s && s.star) || "";
    },
    isImported: isImported,
    all: function () { hydrate(); return list.slice(); },
    published: function () {
      hydrate();
      return list.filter(function (r) { return r.published; });
    },
    ready: function () { return loaded; },
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
        verified: true,
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
        if (!id) return previous.slice();
        var published = !!body.published;
        var nextPublished = previous.map(function (r) {
          if (r.id !== id) return r;
          var copy = {};
          for (var k in r) copy[k] = r[k];
          copy.published = published;
          return copy;
        });
        list = nextPublished;
        emit();
        api("PATCH", base + "/" + encodeURIComponent(id), { published: published }).then(function (json) {
          afterWrite(json, previous, nextPublished);
        });
        return nextPublished.slice();
      }
      var current = null;
      var i;
      for (i = 0; i < previous.length; i++) if (previous[i].id === id) current = previous[i];
      var merged = {};
      var k;
      if (current) for (k in current) merged[k] = current[k];
      for (k in body) merged[k] = body[k];
      var nextList = previous.map(function (r) { return r.id === id ? fromApi(merged) : r; });
      list = nextList;
      emit();
      api("PATCH", base + "/" + encodeURIComponent(id), toPayload(merged)).then(function (json) {
        afterWrite(json, previous, nextList);
      });
      return nextList.slice();
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
