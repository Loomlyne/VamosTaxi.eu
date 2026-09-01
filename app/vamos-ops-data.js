/* Vamos Taxi — the one console store.

   Every ops screen reads and writes here: vehicles, chauffeurs, bookings,
   customers, coupons, fixed routes, per-class distance rates, surcharges, plus
   the settings and profile singletons.

   In-scope collections hydrate from /api/staff JSON and start empty (D-35).
   404/network stays []. Bookings stay empty with no write route (Phase 8).
   Rate-book collections bind GET/PUT /api/staff/rate-book, never
   /api/staff/<name> aliases. */
(function () {
  var subs = [];

  function emit(name) {
    subs.slice().forEach(function (s) { if (!s.name || s.name === name) { try { s.fn(name); } catch (e) {} } });
    try { window.dispatchEvent(new CustomEvent("vamos:ops", { detail: { collection: name } })); } catch (e) {}
  }

  function api(method, path, body) {
    var client = window.VamosOpsApi;
    if (!client || typeof client.request !== "function") {
      return Promise.resolve({ ok: false, code: "network" });
    }
    return client.request(method, path, body);
  }

  function pickRows(json, name) {
    if (!json || json.ok === false) return [];
    var data = json.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[name])) return data[name];
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }

  function subscribe(name, fn) {
    var s = { name: name, fn: fn };
    subs.push(s);
    return function () { subs = subs.filter(function (x) { return x !== s; }); };
  }

  function restCollection(name, clean) {
    var list = [];
    var pending = false;
    var loaded = false;
    var base = "/api/staff/" + name;

    function hydrate() {
      if (pending || loaded) return;
      pending = true;
      api("GET", base).then(function (json) {
        pending = false;
        loaded = true;
        list = pickRows(json, name).map(clean);
        emit(name);
      });
    }

    function afterWrite(json, previous, nextList) {
      if (json && json.ok) {
        var rows = pickRows(json, name);
        list = rows.length ? rows.map(clean) : nextList;
      } else {
        list = previous;
      }
      emit(name);
    }

    return {
      name: name,
      all: function () { hydrate(); return list.slice(); },
      get: function (id) {
        hydrate();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
      },
      blank: function (over) { return clean(over || {}); },
      save: function () { emit(name); return list.slice(); },
      add: function (rec) {
        var previous = list.slice();
        var row = clean(rec || {});
        api("POST", base, row).then(function (json) {
          var created = json && json.data && typeof json.data === "object" && !Array.isArray(json.data)
            ? clean(json.data)
            : row;
          afterWrite(json, previous, previous.concat([created]));
        });
        return previous.slice();
      },
      update: function (id, patch) {
        var previous = list.slice();
        api("PATCH", base + "/" + encodeURIComponent(id), patch).then(function (json) {
          var next = previous.map(function (r) {
            if (r.id !== id) return r;
            var merged = {};
            var k;
            for (k in r) merged[k] = r[k];
            for (k in patch) merged[k] = patch[k];
            return clean(merged);
          });
          afterWrite(json, previous, next);
        });
        return previous.slice();
      },
      upsert: function (rec) {
        var row = clean(rec || {});
        var i;
        for (i = 0; i < list.length; i++) if (list[i].id === row.id) return this.update(row.id, row);
        return this.add(row);
      },
      remove: function (id) {
        var previous = list.slice();
        api("DELETE", base + "/" + encodeURIComponent(id)).then(function (json) {
          afterWrite(json, previous, previous.filter(function (r) { return r.id !== id; }));
        });
        return previous.slice();
      },
      reset: function () { list = []; loaded = false; pending = false; emit(name); hydrate(); return list.slice(); },
      onChange: function (fn) { return subscribe(name, fn); }
    };
  }

  function rateBookCollection(name, kind, clean) {
    var list = [];
    var pending = false;
    var loaded = false;
    var getPath = "/api/staff/rate-book?versionId=";
    var putPath = "/api/staff/rate-book";

    function hydrate() {
      if (pending || loaded) return;
      pending = true;
      api("GET", getPath).then(function (json) {
        pending = false;
        loaded = true;
        list = pickRows(json, name).map(clean);
        emit(name);
      });
    }

    function upsert(rec) {
      var previous = list.slice();
      var row = clean(rec || {});
      var body = {};
      var k;
      for (k in row) body[k] = row[k];
      body.kind = kind;
      api("PUT", putPath, body).then(function (json) {
        if (json && json.ok) {
          var saved = json.data && typeof json.data === "object" && !Array.isArray(json.data)
            ? clean(json.data)
            : row;
          var next = previous.slice();
          var found = false;
          var i;
          for (i = 0; i < next.length; i++) {
            if (next[i].id === saved.id) { next[i] = saved; found = true; break; }
          }
          if (!found) next.push(saved);
          list = next;
        } else {
          list = previous;
        }
        emit(name);
      });
      return previous.slice();
    }

    return {
      name: name,
      all: function () { hydrate(); return list.slice(); },
      get: function (id) {
        hydrate();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
      },
      blank: function (over) { return clean(over || {}); },
      save: function () { emit(name); return list.slice(); },
      add: function (rec) { return upsert(rec); },
      update: function (id, patch) {
        var current = null;
        var i;
        for (i = 0; i < list.length; i++) if (list[i].id === id) current = list[i];
        var merged = {};
        var k;
        if (current) for (k in current) merged[k] = current[k];
        for (k in patch) merged[k] = patch[k];
        merged.id = id;
        return upsert(merged);
      },
      upsert: function (rec) { return upsert(rec); },
      remove: function () { emit(name); return list.slice(); },
      reset: function () { list = []; loaded = false; pending = false; emit(name); hydrate(); return list.slice(); },
      onChange: function (fn) { return subscribe(name, fn); }
    };
  }

  function emptyBookings(clean) {
    return {
      name: "bookings",
      all: function () { return []; },
      get: function () { return null; },
      blank: function (over) { return clean(over || {}); },
      save: function () { return []; },
      add: function () { return []; },
      update: function () { return []; },
      upsert: function () { return []; },
      remove: function () { return []; },
      reset: function () { emit("bookings"); return []; },
      onChange: function (fn) { return subscribe("bookings", fn); }
    };
  }

  function remoteSingleton(name, path, fromPayload) {
    var val = {};
    var pending = false;
    var loaded = false;

    function copy() {
      var c = {};
      var k;
      for (k in val) c[k] = val[k];
      return c;
    }

    function hydrate() {
      if (pending || loaded) return;
      pending = true;
      api("GET", path).then(function (json) {
        pending = false;
        loaded = true;
        if (json && json.ok && json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
          val = fromPayload(json.data) || {};
        } else {
          val = {};
        }
        emit(name);
      });
    }

    return {
      name: name,
      get: function () { hydrate(); return copy(); },
      update: function (patch) {
        var previous = copy();
        api("PUT", path, patch).then(function (json) {
          if (json && json.ok && json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
            val = fromPayload(json.data) || {};
          } else {
            val = previous;
          }
          emit(name);
        });
        return previous;
      },
      reset: function () { val = {}; loaded = false; pending = false; emit(name); hydrate(); return copy(); },
      onChange: function (fn) { return subscribe(name, fn); }
    };
  }

  function id(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; }

  var CURRENCIES = ["CHF", "EUR", "USD", "AED"];
  function cleanMoneySet(v, fallback) {
    v = v || {};
    var out = {};
    CURRENCIES.forEach(function (c) { out[c] = str(v[c]) || fallback || ""; });
    return out;
  }

  var LOCATIONS = [
    "Zurich Airport (ZRH)", "Geneva Airport (GVA)", "Zurich city", "Dietikon",
    "Zermatt", "St. Moritz", "Chamonix", "Verbier"
  ];

  var VEHICLE_CLASSES = ["Economy", "Business", "Van"];
  var VEHICLE_STATUS = ["service", "idle", "workshop"];
  function cleanVehicle(v) {
    v = v || {};
    return {
      id: str(v.id) || id("v"),
      klass: VEHICLE_CLASSES.indexOf(v.klass) === -1 ? "Economy" : v.klass,
      model: str(v.model), plate: str(v.plate), year: str(v.year),
      seats: num(v.seats, 3), bags: num(v.bags, 3),
      status: VEHICLE_STATUS.indexOf(v.status) === -1 ? "service" : v.status,
      photo: (str(v.photo || v.photoPath).indexOf("data:") === 0) ? "" : str(v.photo || v.photoPath),
      note: str(v.note)
    };
  }

  var CHAUFFEUR_STATUS = ["shift", "off", "leave"];
  function cleanChauffeur(c) {
    c = c || {};
    return {
      id: str(c.id) || id("c"),
      name: str(c.name), phone: str(c.phone), email: str(c.email),
      vehicle: str(c.vehicle), licence: str(c.licence), languages: str(c.languages),
      status: CHAUFFEUR_STATUS.indexOf(c.status) === -1 ? "off" : c.status,
      photo: (str(c.photo || c.photoPath).indexOf("data:") === 0) ? "" : str(c.photo || c.photoPath),
      note: str(c.note)
    };
  }

  var BOOKING_STATUS = ["quote", "pending", "paid", "confirmed", "assigned", "completed", "cancelled", "refunded", "no-show"];
  function cleanBooking(b) {
    b = b || {};
    return {
      id: str(b.id),
      time: str(b.time), date: str(b.date), customer: str(b.customer),
      pickup: str(b.pickup), dropoff: str(b.dropoff),
      klass: VEHICLE_CLASSES.indexOf(b.klass) === -1 ? "Economy" : b.klass,
      pax: num(b.pax, 1), bags: num(b.bags, 1),
      status: BOOKING_STATUS.indexOf(b.status) === -1 ? "pending" : b.status,
      chauffeur: str(b.chauffeur), flight: str(b.flight), note: str(b.note)
    };
  }

  var CUSTOMER_TYPES = ["private", "corporate"];
  function cleanCustomer(c) {
    c = c || {};
    return {
      id: str(c.id) || id("cu"),
      name: str(c.name), email: str(c.email), phone: str(c.phone),
      type: CUSTOMER_TYPES.indexOf(c.type) === -1 ? "private" : c.type,
      company: str(c.company), trips: num(c.trips, 0), since: str(c.since), note: str(c.note)
    };
  }

  var COUPON_KINDS = ["percent", "amount"];
  function cleanCoupon(c) {
    c = c || {};
    return {
      id: str(c.id) || id("cp"),
      code: str(c.code).toUpperCase(),
      kind: COUPON_KINDS.indexOf(c.kind) === -1 ? "percent" : c.kind,
      value: str(c.value), uses: num(c.uses, 0), limit: num(c.limit, 0),
      expires: str(c.expires), active: c.active === false ? false : true, note: str(c.note)
    };
  }

  function cleanRoute(r) {
    r = r || {};
    return {
      id: str(r.id) || id("FR"),
      from: str(r.from), to: str(r.to),
      economy: cleanMoneySet(r.economy), business: cleanMoneySet(r.business), van: cleanMoneySet(r.van),
      live: !!r.live
    };
  }

  var RATE_DEFAULT_PAX = { Economy: 3, Business: 3, Van: 8 };
  function cleanRate(r) {
    r = r || {};
    var klass = VEHICLE_CLASSES.indexOf(r.klass) === -1 ? "Economy" : r.klass;
    return {
      id: str(r.id) || klass,
      klass: klass,
      baseFare: cleanMoneySet(r.baseFare), perKm: cleanMoneySet(r.perKm), minFare: cleanMoneySet(r.minFare),
      maxPax: num(r.maxPax, RATE_DEFAULT_PAX[klass] || 3),
      available: r.available === false ? false : true
    };
  }

  var SURCHARGE_KINDS = ["amount", "percent", "included"];
  function cleanSurcharge(s) {
    s = s || {};
    return {
      id: str(s.id) || id("S"),
      label: str(s.label), rule: str(s.rule),
      kind: SURCHARGE_KINDS.indexOf(s.kind) === -1 ? "amount" : s.kind,
      amounts: cleanMoneySet(s.amounts), pct: str(s.pct)
    };
  }

  function settingsFromPayload(data) {
    var out = {};
    var k;
    for (k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
    }
    return out;
  }

  function profileFromMe(data) {
    return {
      name: str(data.fullName || data.name),
      role: str(data.role),
      email: str(data.email),
      phone: str(data.phone),
      lang: str(data.lang),
      avatar: str(data.avatarPath || data.avatar),
      twoFactor: !!data.twoFactor,
      digest: !!data.digest,
      passkey: !!data.passkey,
      userId: str(data.userId)
    };
  }

  window.VamosOps = {
    VEHICLE_CLASSES: VEHICLE_CLASSES,
    VEHICLE_STATUS: VEHICLE_STATUS,
    CHAUFFEUR_STATUS: CHAUFFEUR_STATUS,
    BOOKING_STATUS: BOOKING_STATUS,
    CUSTOMER_TYPES: CUSTOMER_TYPES,
    COUPON_KINDS: COUPON_KINDS,
    SURCHARGE_KINDS: SURCHARGE_KINDS,
    CURRENCIES: CURRENCIES,
    LOCATIONS: LOCATIONS,
    vehicles: restCollection("vehicles", cleanVehicle),
    chauffeurs: restCollection("chauffeurs", cleanChauffeur),
    bookings: emptyBookings(cleanBooking),
    customers: restCollection("customers", cleanCustomer),
    coupons: restCollection("coupons", cleanCoupon),
    routes: rateBookCollection("routes", "route", cleanRoute),
    rates: rateBookCollection("rates", "distance", cleanRate),
    surcharges: rateBookCollection("surcharges", "surcharge", cleanSurcharge),
    settings: remoteSingleton("settings", "/api/staff/settings", settingsFromPayload),
    profile: remoteSingleton("profile", "/api/staff/me", profileFromMe),
    onAny: function (fn) { return subscribe(null, fn); },
    resetAll: function () {
      ["vehicles", "chauffeurs", "bookings", "customers", "coupons", "routes", "rates", "surcharges", "settings", "profile"]
        .forEach(function (k) { window.VamosOps[k].reset(); });
    }
  };
})();
