/* Vamos Taxi — the one console store.

   Every ops screen reads and writes here: vehicles, chauffeurs, bookings,
   customers, coupons, fixed routes, per-class distance rates, surcharges, plus
   the settings and profile singletons.

   In-scope collections hydrate from /api/staff JSON and start empty (D-35).
   404/network stays []. Bookings hydrate GET /api/staff/bookings.
   Rate-book collections bind GET/PUT/DELETE /api/staff/rate-book, never
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
    if (data && typeof data === "object") return [data];
    return [];
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  var bookFetch = { pending: false, loaded: false, json: null, waiters: [] };
  function fetchRateBook() {
    if (bookFetch.loaded) return Promise.resolve(bookFetch.json);
    return new Promise(function (resolve) {
      bookFetch.waiters.push(resolve);
      if (bookFetch.pending) return;
      bookFetch.pending = true;
      api("GET", "/api/staff/rate-book").then(function (json) {
        bookFetch.pending = false;
        var ok = !!(json && json.ok !== false);
        bookFetch.loaded = ok;
        bookFetch.json = json;
        if (ok && json.data && Array.isArray(json.data.zones)) {
          ZONES = json.data.zones.slice();
        }
        var w = bookFetch.waiters.slice();
        bookFetch.waiters = [];
        w.forEach(function (fn) { fn(json); });
      });
    });
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

    var pollTimer = null;
    function hydrate() {
      if (pending || loaded) return;
      pending = true;
      api("GET", base).then(function (json) {
        pending = false;
        loaded = true;
        list = pickRows(json, name).map(clean);
        emit(name);
        if (name === "bookings") {
          clearTimeout(pollTimer);
          pollTimer = setTimeout(function () {
            loaded = false;
            hydrate();
          }, 15000);
        }
      });
    }

    function afterWrite(json, previous, nextList) {
      if (json && json.ok) {
        var data = json.data;
        var one = data && typeof data === "object" && !Array.isArray(data)
          && !Array.isArray(data[name]) && !Array.isArray(data.rows);
        if (one) {
          var saved = clean(data);
          var next = previous.slice();
          var found = false;
          var i;
          for (i = 0; i < next.length; i++) {
            if (next[i].id === saved.id) { next[i] = saved; found = true; break; }
          }
          if (!found) next.push(saved);
          list = next;
        } else {
          var rows = pickRows(json, name);
          list = rows.length ? rows.map(clean) : nextList;
        }
      } else {
        list = previous;
      }
      emit(name);
      return json;
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
      save: function (rec) {
        if (!rec) return Promise.resolve({ ok: false, code: "missing-id" });
        return this.upsert(rec);
      },
      add: function (rec) {
        var previous = list.slice();
        var row = clean(rec || {});
        if (row.id && !isUuid(row.id)) {
          return Promise.resolve({ ok: false, code: "missing-id" });
        }
        return api("POST", base, row).then(function (json) {
          var created = json && json.data && typeof json.data === "object" && !Array.isArray(json.data)
            ? clean(json.data)
            : row;
          afterWrite(json, previous, previous.concat([created]));
          return json;
        });
      },
      update: function (id, patch) {
        if (!isUuid(id)) {
          return Promise.resolve({ ok: false, code: "missing-id" });
        }
        var previous = list.slice();
        return api("PATCH", base + "/" + encodeURIComponent(id), patch).then(function (json) {
          var next = previous.map(function (r) {
            if (r.id !== id) return r;
            var merged = {};
            var k;
            for (k in r) merged[k] = r[k];
            for (k in patch) merged[k] = patch[k];
            return clean(merged);
          });
          afterWrite(json, previous, next);
          return json;
        });
      },
      upsert: function (rec) {
        var row = clean(rec || {});
        if (!row.id) return this.add(row);
        if (!isUuid(row.id)) {
          return Promise.resolve({ ok: false, code: "missing-id" });
        }
        return this.update(row.id, row);
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
    var putPath = "/api/staff/rate-book";

    function hydrate() {
      if (pending || loaded) return;
      pending = true;
      fetchRateBook().then(function (json) {
        pending = false;
        if (!json || json.ok === false) {
          loaded = false;
          return;
        }
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
      save: function (rec) {
        if (rec) return upsert(rec);
        emit(name);
        return list.slice();
      },
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
      remove: function (id) {
        var previous = list.slice();
        var rec = null;
        var i;
        for (i = 0; i < list.length; i++) if (list[i].id === id) rec = list[i];
        if (!rec) return previous;
        var body = { kind: kind, id: id };
        if (rec.from) body.from = rec.from;
        if (rec.to) body.to = rec.to;
        if (rec.originZoneId) body.originZoneId = rec.originZoneId;
        if (rec.destZoneId) body.destZoneId = rec.destZoneId;
        list = list.filter(function (row) { return row.id !== id; });
        emit(name);
        api("DELETE", putPath + "?kind=" + encodeURIComponent(kind) + "&id=" + encodeURIComponent(String(id)), body).then(function (json) {
          if (!json || json.ok === false) {
            list = previous;
          } else {
            var rows = pickRows(json, name);
            if (rows.length) list = rows.map(clean);
          }
          emit(name);
        });
        return list.slice();
      },
      reset: function () {
        clearTimeout(pollTimer);
        bookFetch.loaded = false;
        bookFetch.json = null;
        list = [];
        loaded = false;
        pending = false;
        emit(name);
        hydrate();
        return list.slice();
      },
      onChange: function (fn) { return subscribe(name, fn); }
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
      apply: function (patch) {
        if (!patch || typeof patch !== "object") return copy();
        var k;
        for (k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) val[k] = patch[k];
        }
        emit(name);
        return copy();
      },
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

  var ZONES = [];
  var LOCATIONS = [
    "Zurich Airport (ZRH)", "Geneva Airport (GVA)", "Zurich city", "Dietikon",
    "Zermatt", "St. Moritz", "Chamonix", "Verbier"
  ];

  var VEHICLE_CLASSES = ["Economy", "Business", "First", "Van"];
  var VEHICLE_STATUS = ["service", "idle", "workshop"];
  function cleanVehicle(v) {
    v = v || {};
    return {
      id: str(v.id),
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
    var vehicleId = str(c.vehicle || c.defaultVehicleId);
    return {
      id: str(c.id),
      name: str(c.name || c.fullName), phone: str(c.phone), email: str(c.email),
      vehicle: vehicleId, defaultVehicleId: str(c.defaultVehicleId || c.vehicle),
      licence: str(c.licence || c.licenceNumber),
      languages: Array.isArray(c.languages) ? c.languages.join(", ") : str(c.languages),
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
      chauffeur: str(b.chauffeur),
      driver: str(b.driver || b.chauffeur),
      chauffeurEmail: str(b.chauffeurEmail),
      assignedChauffeurId: str(b.assignedChauffeurId),
      assignedVehicleId: str(b.assignedVehicleId),
      vehicle: str(b.vehicle),
      flight: str(b.flight),
      note: str(b.note),
      email: str(b.email),
      phone: str(b.phone),
      company: str(b.company),
      dateIso: str(b.dateIso),
      pickupAt: str(b.pickupAt),
      capturedAt: str(b.capturedAt),
      bookingId: str(b.bookingId),
      paid: !!b.paid,
      paidByCard: !!b.paidByCard,
      payLinkSent: !!b.payLinkSent,
      cardSession: !!b.cardSession,
      sessionExpiresAt: str(b.sessionExpiresAt),
      totalRappen: num(b.totalRappen, 0),
      refundRappen: num(b.refundRappen, 0),
      stripeFeeRappen: b.stripeFeeRappen == null || b.stripeFeeRappen === "" ? null : num(b.stripeFeeRappen, 0),
      events: Array.isArray(b.events) ? b.events : []
    };
  }

  var CUSTOMER_TYPES = ["private", "corporate"];
  function cleanCustomer(c) {
    c = c || {};
    return {
      id: str(c.id) || id("cu"),
      name: str(c.name || c.fullName), email: str(c.email), phone: str(c.phone),
      type: CUSTOMER_TYPES.indexOf(c.type) === -1 ? "private" : c.type,
      company: str(c.company), trips: num(c.trips != null ? c.trips : c.tripCount, 0), since: str(c.since), note: str(c.note)
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
      originZoneId: str(r.originZoneId), destZoneId: str(r.destZoneId),
      economy: cleanMoneySet(r.economy), business: cleanMoneySet(r.business), first: cleanMoneySet(r.first), van: cleanMoneySet(r.van),
      live: !!r.live
    };
  }

  var RATE_DEFAULT_PAX = { Economy: 4, Business: 4, First: 4, Van: 7 };
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

  function cleanBand(b) {
    b = b || {};
    return {
      id: str(b.id) || id("B"),
      fromKm: num(b.fromKm, 0),
      toKm: b.toKm === "" || b.toKm == null ? "" : num(b.toKm, 0),
      perKm: cleanMoneySet(b.perKm)
    };
  }

  function cleanRegion(r) {
    r = r || {};
    return {
      id: str(r.id) || id("RP"),
      zoneId: str(r.zoneId),
      zone: str(r.zone),
      percent: str(r.percent)
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
    get ZONES() { return ZONES.slice(); },
    vehicles: restCollection("vehicles", cleanVehicle),
    chauffeurs: restCollection("chauffeurs", cleanChauffeur),
    bookings: restCollection('bookings', cleanBooking),
    customers: restCollection("customers", cleanCustomer),
    coupons: restCollection("coupons", cleanCoupon),
    routes: rateBookCollection("routes", "route", cleanRoute),
    rates: rateBookCollection("rates", "distance", cleanRate),
    surcharges: rateBookCollection("surcharges", "surcharge", cleanSurcharge),
    bands: rateBookCollection("bands", "band", cleanBand),
    regionPremiums: rateBookCollection("regionPremiums", "region", cleanRegion),
    settings: remoteSingleton("settings", "/api/staff/settings", settingsFromPayload),
    profile: remoteSingleton("profile", "/api/staff/me", profileFromMe),
    onAny: function (fn) { return subscribe(null, fn); },
    resetAll: function () {
      ["vehicles", "chauffeurs", "bookings", "customers", "coupons", "routes", "rates", "surcharges", "bands", "regionPremiums", "settings", "profile"]
        .forEach(function (k) { window.VamosOps[k].reset(); });
    }
  };
})();
