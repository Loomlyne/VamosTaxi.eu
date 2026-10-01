/* Vamos Taxi — the one console store.

   Every ops screen reads and writes here: vehicles, chauffeurs, bookings,
   customers, coupons, fixed routes, per-class distance rates, surcharges, plus
   the settings and profile singletons.

   In-scope collections hydrate from /api/staff JSON and start empty (D-35).
   404/network stays []. Bookings hydrate GET /api/staff/bookings.
   Rate-book collections bind GET/PUT/DELETE /api/staff/rate-book, never
   /api/staff/<name> aliases.

   Write contract: never mint cu-/cp-/FR- ids. Empty id → POST. UUID or
   numeric id → PATCH/DELETE except coupons (bigint PK): OpsTable mints a
   UUID for new rows, so only a numeric id PATCHes; a UUID draft POSTs.
   Bookings write bookingId (UUID), display id stays VT-…. Failed writes
   return { ok:false, code } and the overlay must stay open.

   Draft fare-book verbs: publish / discard / saveDraftVat hit
   /api/staff/rate-versions/:id/{publish,discard} and PUT rate-book for VAT.
   OpsPricing does not call Preview or test unpaid. Never sets public preferDraft. */
(function () {
  // 261001-chauffeur-car: the shell's helmet runs this file twice (parser, then the dc-runtime). A
  // second store replaced the first while screens were still subscribed to it, so a list could
  // stay empty (main's Chauffeurs: 6 of 12 offline loads, found on the rejected Cars branch).
  // Keep the first store, as vamos-ops-bar.js already does.
  if (window.VamosOps) return;
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
    if (data && typeof data === "object") {
      if (
        (data.versionId != null || data.version_id != null) &&
        (Array.isArray(data.routes) || Array.isArray(data.rates)) &&
        !Array.isArray(data[name])
      ) {
        return [];
      }
      return [data];
    }
    return [];
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }
  function isNumericId(value) {
    return /^\d+$/.test(String(value || "").trim());
  }
  function isMintedId(value) {
    return /^(cu|cp|fr|s|b|rp)-/i.test(String(value || ""));
  }
  function isWriteId(value) {
    return isUuid(value) || isNumericId(value);
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
        if (ok && json.data && Array.isArray(json.data.classes)) {
          CLASSES = json.data.classes.slice();
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
    var readyPromise = null;
    var base = "/api/staff/" + name;

    var pollTimer = null;
    var POLL_MS = 3000;
    function schedulePoll() {
      clearTimeout(pollTimer);
      pollTimer = null;
      if (name !== "bookings") return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      pollTimer = setTimeout(function () {
        loaded = false;
        readyPromise = null;
        hydrate();
      }, POLL_MS);
    }
    function onVisible() {
      if (name !== "bookings") return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        clearTimeout(pollTimer);
        pollTimer = null;
        return;
      }
      loaded = false;
      readyPromise = null;
      hydrate();
    }
    if (name === "bookings" && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
    }
    function hydrate() {
      if (loaded) return Promise.resolve();
      if (pending && readyPromise) return readyPromise;
      pending = true;
      readyPromise = api("GET", base).then(function (json) {
        pending = false;
        loaded = true;
        list = pickRows(json, name).map(clean);
        emit(name);
        schedulePoll();
      });
      return readyPromise;
    }

    function findRow(id) {
      var sid = String(id || "");
      var i;
      for (i = 0; i < list.length; i++) {
        if (String(list[i].id) === sid) return list[i];
        if (name === "bookings" && String(list[i].bookingId || "") === sid) return list[i];
      }
      return null;
    }

    function writeIdOf(id, rec) {
      var row = rec || findRow(id);
      if (name === "bookings") {
        var bid = row && row.bookingId;
        if (isUuid(bid)) return String(bid);
      }
      // coupons.id is bigint. A client UUID is a draft key, not a row.
      if (name === "coupons") {
        if (isNumericId(id)) return String(id);
        if (row && isNumericId(row.id)) return String(row.id);
        return "";
      }
      if (isWriteId(id)) return String(id);
      if (row && isWriteId(row.id)) return String(row.id);
      return "";
    }

    function persistable(rec) {
      var row = rec || {};
      var dropId = !row.id || isMintedId(row.id) || !isWriteId(row.id);
      if (name === "coupons" && row.id && !isNumericId(row.id)) dropId = true;
      if (dropId) {
        var copy = {};
        var k;
        for (k in row) copy[k] = row[k];
        delete copy.id;
        return copy;
      }
      return row;
    }

    function sameRow(a, b) {
      if (!a || !b) return false;
      if (String(a.id) && String(a.id) === String(b.id)) return true;
      if (name === "bookings" && a.bookingId && String(a.bookingId) === String(b.bookingId || b.id)) return true;
      if (name === "customers" && a.email && b.email && String(a.email).trim().toLowerCase() === String(b.email).trim().toLowerCase()) return true;
      return false;
    }

    function afterWrite(json, previous, nextList) {
      if (json && json.ok) {
        bookFetch.loaded = false;
        bookFetch.json = null;
        var data = json.data;
        var one = data && typeof data === "object" && !Array.isArray(data)
          && !Array.isArray(data[name]) && !Array.isArray(data.rows);
        var keys = one ? Object.keys(data) : [];
        var stub = one && keys.every(function (k) {
          return k === "id" || k === "erased" || k === "status";
        });
        if (one && !stub) {
          var saved = clean(data);
          var next = previous.slice();
          var found = false;
          var i;
          for (i = 0; i < next.length; i++) {
            if (sameRow(next[i], saved) || (name === "bookings" && isUuid(saved.id) && String(next[i].bookingId) === String(saved.id))) {
              next[i] = Object.assign({}, next[i], saved);
              if (name === "bookings" && next[i].bookingId) next[i].id = previous[i] ? previous[i].id : next[i].id;
              found = true;
              break;
            }
          }
          if (!found) next.push(saved);
          list = next;
        } else if (!stub) {
          var rows = pickRows(json, name);
          list = rows.length ? rows.map(clean) : nextList;
        } else {
          list = nextList;
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
        return findRow(id);
      },
      blank: function (over) { return clean(over || {}); },
      save: function (rec) {
        if (!rec) return Promise.resolve({ ok: false, code: "missing-id" });
        return this.upsert(rec);
      },
      add: function (rec) {
        var previous = list.slice();
        var row = persistable(clean(rec || {}));
        if (name === "customers") row = customerWrite(row);
        if (name === "chauffeurs") row = chauffeurWrite(row);
        return api("POST", base, row).then(function (json) {
          var created = json && json.data && typeof json.data === "object" && !Array.isArray(json.data)
            ? clean(json.data)
            : row;
          afterWrite(json, previous, previous.concat([created]));
          return json;
        });
      },
      update: function (id, patch) {
        return hydrate().then(function () {
          var current = findRow(id) || findRow((patch && patch.bookingId) || "");
          var writeId = writeIdOf(id, current || patch);
          if (!writeId) {
            return { ok: false, code: "missing-id" };
          }
          var previous = list.slice();
          var mergedPatch = patch || {};
          if (name === "bookings" && mergedPatch.date && !mergedPatch.dateIso) {
            mergedPatch = Object.assign({}, mergedPatch, { dateIso: mergedPatch.date });
          }
          if (name === "customers") mergedPatch = customerWrite(mergedPatch);
          if (name === "chauffeurs") mergedPatch = chauffeurWrite(mergedPatch);
          return api("PATCH", base + "/" + encodeURIComponent(writeId), mergedPatch).then(function (json) {
            var next = previous.map(function (r) {
              if (!sameRow(r, current || { id: id, bookingId: writeId }) && String(r.id) !== String(id)) return r;
              var merged = {};
              var k;
              for (k in r) merged[k] = r[k];
              for (k in mergedPatch) merged[k] = mergedPatch[k];
              return clean(merged);
            });
            afterWrite(json, previous, next);
            return json;
          });
        });
      },
      upsert: function (rec) {
        var self = this;
        var row = clean(rec || {});
        var writeId = writeIdOf(row.id, row);
        if (!writeId) return this.add(row);
        if (name !== "chauffeurs") return this.update(writeId, row);
        return hydrate().then(function () {
          if (!findRow(writeId)) return self.add(row);
          return self.update(writeId, row);
        });
      },
      remove: function (id) {
        return hydrate().then(function () {
          var current = findRow(id);
          var writeId = writeIdOf(id, current);
          if (!writeId) {
            return { ok: false, code: "missing-id" };
          }
          var previous = list.slice();
          return api("DELETE", base + "/" + encodeURIComponent(writeId)).then(function (json) {
            afterWrite(json, previous, previous.filter(function (r) {
              return String(r.id) !== String(id) && String(r.bookingId || "") !== String(writeId) && String(r.id) !== String(writeId);
            }));
            return json;
          });
        });
      },
      reset: function () {
        clearTimeout(pollTimer);
        pollTimer = null;
        list = [];
        loaded = false;
        pending = false;
        readyPromise = null;
        emit(name);
        hydrate();
        return list.slice();
      },
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
      if (body.id && (isMintedId(body.id) || !isNumericId(body.id))) delete body.id;
      return api("PUT", putPath, body).then(function (json) {
        if (json && json.ok) {
          bookFetch.loaded = false;
          bookFetch.json = null;
          var named = pickRows(json, name);
          if (json.data && Array.isArray(json.data[name])) {
            list = named.map(clean);
          } else {
            var saved = json.data && typeof json.data === "object" && !Array.isArray(json.data)
              ? clean(json.data)
              : row;
            var next = previous.slice();
            var found = false;
            var i;
            for (i = 0; i < next.length; i++) {
              if (String(next[i].id) === String(saved.id)) { next[i] = saved; found = true; break; }
              if (name === "rates" && saved.vehicleClassId && String(next[i].vehicleClassId) === String(saved.vehicleClassId)) {
                next[i] = saved; found = true; break;
              }
            }
            if (!found) next.push(saved);
            list = next;
          }
        } else {
          list = previous;
        }
        emit(name);
        return json || { ok: false, code: "save-failed" };
      });
    }

    return {
      name: name,
      all: function () { hydrate(); return list.slice(); },
      get: function (id) {
        hydrate();
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
        return null;
      },
      blank: function (over) { return clean(over || {}); },
      save: function (rec) {
        if (rec) return upsert(rec);
        emit(name);
        return Promise.resolve({ ok: false, code: "missing-id" });
      },
      add: function (rec) { return upsert(rec); },
      update: function (id, patch) {
        var current = null;
        var i;
        for (i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) current = list[i];
        var merged = {};
        var k;
        if (current) for (k in current) merged[k] = current[k];
        for (k in patch) merged[k] = patch[k];
        merged.id = id;
        return upsert(merged);
      },
      upsert: function (rec) { return upsert(rec); },
      reorder: name === "rates" ? function (order) {
        var previous = list.slice();
        var rank = {};
        (order || []).forEach(function (item, i) {
          var id = item && (item.vehicleClassId || item.id);
          if (id) rank[String(id)] = i;
        });
        list = list.slice().map(function (r) {
          var copy = {};
          var k;
          for (k in r) copy[k] = r[k];
          var key = String(r.vehicleClassId || r.id || "");
          if (rank[key] != null) copy.sortOrder = rank[key];
          return copy;
        });
        emit(name);
        return api("PUT", putPath, { kind: kind, reorder: true, order: order || [] }).then(function (json) {
          if (json && json.ok && json.data && Array.isArray(json.data[name])) {
            bookFetch.loaded = false;
            bookFetch.json = null;
            list = pickRows(json, name).map(clean);
          } else if (!json || json.ok === false) {
            list = previous;
          }
          emit(name);
          return json || { ok: false, code: "save-failed" };
        });
      } : undefined,
      remove: function (id) {
        var previous = list.slice();
        var rec = null;
        var i;
        for (i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) rec = list[i];
        if (!rec) return Promise.resolve({ ok: false, code: "missing-id" });
        var body = { kind: kind, id: id };
        if (rec.from) body.from = rec.from;
        if (rec.to) body.to = rec.to;
        if (rec.originZoneId) body.originZoneId = rec.originZoneId;
        if (rec.destZoneId) body.destZoneId = rec.destZoneId;
        return api("DELETE", putPath + "?kind=" + encodeURIComponent(kind) + "&id=" + encodeURIComponent(String(id)), body).then(function (json) {
          if (!json || json.ok === false) {
            list = previous;
          } else {
            bookFetch.loaded = false;
            bookFetch.json = null;
            var rows = pickRows(json, name);
            list = rows.length ? rows.map(clean) : previous.filter(function (row) { return String(row.id) !== String(id); });
          }
          emit(name);
          return json || { ok: false, code: "save-failed" };
        });
      },
      reset: function () {
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
    var writePath = name === "profile" ? "/api/staff/profile" : path;

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
        return api("PATCH", writePath, patch).then(function (json) {
          if (json && json.ok && json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
            val = fromPayload(json.data) || {};
          } else {
            val = previous;
          }
          emit(name);
          return json || { ok: false, code: "save-failed" };
        });
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
  var CLASSES = [];
  var LOCATIONS = [
    "Zurich Airport (ZRH)", "Geneva Airport (GVA)", "Zurich city", "Dietikon",
    "Zermatt", "St. Moritz", "Chamonix", "Verbier"
  ];

  var VEHICLE_CLASSES = ["Economy", "Business", "Van luxury"];
  // D-14: live slugs and legacy names map onto the three classes (saden -> Economy,
  // mercedes-benz-v-class -> Business, van-luxury and a stored Van -> Van luxury);
  // any other unknown class (incl. the dropped First) becomes Economy.
  var KLASS_ALIASES = {
    "economy": "Economy", "saden": "Economy",
    "business": "Business", "mercedes-benz-v-class": "Business",
    "van": "Van luxury", "van-luxury": "Van luxury"
  };
  function cleanKlass(k) {
    if (VEHICLE_CLASSES.indexOf(k) !== -1) return k;
    var key = str(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return KLASS_ALIASES[key] || "Economy";
  }
  var VEHICLE_STATUS = ["service", "idle", "workshop"];
  function cleanVehicle(v) {
    v = v || {};
    return {
      id: str(v.id),
      klass: cleanKlass(v.klass),
      // 260930-dash-design: the class row itself, so a class the owner named reads its own name
      // (klass falls back to Economy for any slug outside the D-14 three).
      vehicleClassId: str(v.vehicleClassId || v.vehicle_class_id),
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
    var classId = str(c.vehicleClassId || c.vehicle_class_id);
    var vehicleId = str(c.defaultVehicleId || c.default_vehicle_id);
    if (!vehicleId) {
      var legacyVehicle = str(c.vehicle);
      if (legacyVehicle && legacyVehicle !== classId) vehicleId = legacyVehicle;
    }
    return {
      id: str(c.id),
      name: str(c.name || c.fullName || c.full_name), phone: str(c.phone), email: str(c.email),
      vehicle: vehicleId, defaultVehicleId: vehicleId,
      vehicleClassId: classId,
      vehicleClassName: str(c.vehicleClassName || c.className || c.vehicle_class_name),
      licence: str(c.licence || c.licenceNumber || c.licence_number),
      languages: Array.isArray(c.languages) ? c.languages.join(", ") : str(c.languages),
      status: CHAUFFEUR_STATUS.indexOf(c.status) === -1 ? "off" : c.status,
      photo: (str(c.photo || c.photoPath).indexOf("data:") === 0) ? "" : str(c.photo || c.photoPath),
      note: str(c.note),
      shiftWeekdays: Array.isArray(c.shiftWeekdays) ? c.shiftWeekdays : (Array.isArray(c.weekdays) ? c.weekdays : []),
      weekdays: Array.isArray(c.weekdays) ? c.weekdays : (Array.isArray(c.shiftWeekdays) ? c.shiftWeekdays : []),
      start: str(c.start || c.shiftStart),
      end: str(c.end || c.shiftEnd),
      shiftStart: str(c.shiftStart || c.start),
      shiftEnd: str(c.shiftEnd || c.end),
      leaveRanges: Array.isArray(c.leaveRanges) ? c.leaveRanges : []
    };
  }

  var BOOKING_STATUS = ["quote", "pending", "paid", "confirmed", "assigned", "completed", "cancelled", "refunded", "no-show"];
  /* The database enum says no_show; the console spells it "no-show". The two
     partial roll-ups are not offered in any status select, but a row that carries
     one keeps it: falling back to "pending" put an ended trip back on the board. */
  var BOOKING_STATUS_PASS = ["partially_cancelled", "partially_completed"];
  function bookingStatus(value) {
    if (value === "no_show") return "no-show";
    if (BOOKING_STATUS.indexOf(value) !== -1 || BOOKING_STATUS_PASS.indexOf(value) !== -1) return value;
    return "pending";
  }
  function cleanBooking(b) {
    b = b || {};
    return {
      id: str(b.id),
      time: str(b.time), date: str(b.date), customer: str(b.customer),
      pickup: str(b.pickup), dropoff: str(b.dropoff),
      klass: cleanKlass(b.klass),
      pax: num(b.pax, 1), bags: num(b.bags, 1),
      status: bookingStatus(b.status),
      chauffeur: str(b.chauffeur),
      driver: str(b.driver || b.chauffeur),
      chauffeurEmail: str(b.chauffeurEmail),
      assignedChauffeurId: str(b.assignedChauffeurId),
      assignedVehicleId: str(b.assignedVehicleId),
      vehicle: str(b.vehicle),
      flight: str(b.flight),
      // The admin's Mark arrival time; booking detail shows "Arrived HH:MM" from it.
      arrivedAt: str(b.arrivedAt),
      note: str(b.note),
      email: str(b.email),
      phone: str(b.phone),
      company: str(b.company),
      dateIso: str(b.dateIso || b.date),
      pickupAt: str(b.pickupAt),
      capturedAt: str(b.capturedAt),
      bookingId: str(b.bookingId),
      paid: !!b.paid,
      paidByCard: !!b.paidByCard,
      payLinkSent: !!b.payLinkSent,
      cardSession: !!b.cardSession,
      sessionExpiresAt: str(b.sessionExpiresAt),
      totalRappen: num(b.totalRappen, 0),
      extraRappen: num(b.extraRappen, 0),
      pendingEditId: str(b.pendingEditId),
      pendingEditActor: str(b.pendingEditActor),
      pendingEditQuoteRappen: num(b.pendingEditQuoteRappen, 0),
      pendingEditExtraSessionId: str(b.pendingEditExtraSessionId),
      durationMin: num(b.durationMin, 0),
      distanceKm: b.distanceKm == null || b.distanceKm === "" ? null : num(b.distanceKm, 0),
      couponCode: str(b.couponCode),
      extras: Array.isArray(b.extras) ? b.extras.map(str).filter(Boolean) : [],
      fareLines: Array.isArray(b.fareLines) ? b.fareLines : [],
      refundRappen: num(b.refundRappen, 0),
      // 26.1-18: refund review facts from the staff read model (D-07/D-24/D-25).
      refundStatus: str(b.refundStatus) || "none",
      refundOwedRappen: b.refundOwedRappen == null || b.refundOwedRappen === "" ? null : num(b.refundOwedRappen, 0),
      capturedRappen: num(b.capturedRappen, 0),
      tripPassed: b.tripPassed === true,
      dispute: b.dispute && typeof b.dispute === "object" && str(b.dispute.status)
        ? { status: str(b.dispute.status), reason: str(b.dispute.reason) }
        : null,
      stripeFeeRappen: b.stripeFeeRappen == null || b.stripeFeeRappen === "" ? null : num(b.stripeFeeRappen, 0),
      events: Array.isArray(b.events) ? b.events : []
    };
  }

  var CUSTOMER_TYPES = ["private", "corporate"];
  function cleanCustomer(c) {
    c = c || {};
    return {
      id: str(c.id),
      name: str(c.name || c.fullName), email: str(c.email), phone: str(c.phone),
      type: CUSTOMER_TYPES.indexOf(c.type) === -1 ? "private" : c.type,
      company: str(c.company), trips: num(c.trips != null ? c.trips : c.tripCount, 0), since: str(c.since), note: str(c.note)
    };
  }
  function customerWrite(c) {
    c = c || {};
    return {
      name: str(c.name || c.fullName),
      email: str(c.email),
      phone: str(c.phone)
    };
  }

  // languages is text[] of ISO codes. default_vehicle_id is uuid.
  // A display string or "" is 22P02. Empty vehicle id is null, never "".
  var LANG_TO_CODE = {
    german: "de", french: "fr", italian: "it", english: "en", arabic: "ar",
    de: "de", fr: "fr", it: "it", en: "en", ar: "ar",
    spanish: "es", es: "es", portuguese: "pt", pt: "pt",
    russian: "ru", ru: "ru", turkish: "tr", tr: "tr",
    albanian: "sq", sq: "sq", croatian: "hr", hr: "hr", polish: "pl", pl: "pl"
  };
  function languageCodes(value) {
    var raw = Array.isArray(value) ? value : String(value == null ? "" : value).split(/[,|]/);
    var out = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      var token = String(raw[i] || "").trim().toLowerCase();
      if (!token) continue;
      var code = LANG_TO_CODE[token] || "";
      if (!code || out.indexOf(code) !== -1) continue;
      out.push(code);
    }
    return out;
  }
  function uuidOrNull(value) {
    var s = str(value).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return null;
    return s;
  }
  function chauffeurWrite(c) {
    c = c || {};
    var classId = uuidOrNull(c.vehicleClassId);
    var vehicleId = uuidOrNull(c.defaultVehicleId);
    if (!vehicleId) {
      var legacy = uuidOrNull(c.vehicle);
      if (legacy && legacy !== classId) vehicleId = legacy;
    }
    var row = {};
    var k;
    for (k in c) row[k] = c[k];
    row.languages = languageCodes(c.languages);
    row.defaultVehicleId = vehicleId;
    row.vehicle = vehicleId;
    // Signed 2026-10-01: the driver form sends no class; without the key the server keeps the column.
    if (Object.prototype.hasOwnProperty.call(c, "vehicleClassId")) row.vehicleClassId = classId;
    return row;
  }

  var COUPON_KINDS = ["percent", "amount"];
  function cleanCoupon(c) {
    c = c || {};
    return {
      id: str(c.id),
      code: str(c.code).toUpperCase(),
      kind: COUPON_KINDS.indexOf(c.kind) === -1 ? "percent" : c.kind,
      value: str(c.value), uses: num(c.uses, 0), limit: num(c.limit, 0),
      cap: c.cap == null || c.cap === "" ? null : num(c.cap, 0),
      validFrom: str(c.validFrom || c.valid_from),
      expires: str(c.expires || c.validUntil || c.valid_until), active: c.active === false ? false : true, note: str(c.note)
    };
  }

  function cleanRoute(r) {
    r = r || {};
    var skip = {
      id: 1, from: 1, to: 1, originZoneId: 1, destZoneId: 1,
      fromMapbox: 1, toMapbox: 1, live: 1, prices: 1, routeLabel: 1
    };
    var out = {
      id: str(r.id),
      from: str(r.from), to: str(r.to),
      originZoneId: str(r.originZoneId), destZoneId: str(r.destZoneId),
      fromMapbox: r.fromMapbox && typeof r.fromMapbox === "object" ? r.fromMapbox : undefined,
      toMapbox: r.toMapbox && typeof r.toMapbox === "object" ? r.toMapbox : undefined,
      live: !!r.live,
      prices: {}
    };
    var prices = r.prices && typeof r.prices === "object" ? r.prices : {};
    var k;
    for (k in prices) {
      if (Object.prototype.hasOwnProperty.call(prices, k)) {
        out.prices[k] = cleanMoneySet(prices[k]);
        out[k] = out.prices[k];
      }
    }
    for (k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k) || skip[k] || out[k] !== undefined) continue;
      if (r[k] && typeof r[k] === "object" && !Array.isArray(r[k]) && (r[k].CHF !== undefined || r[k].chf !== undefined)) {
        out[k] = cleanMoneySet(r[k]);
        out.prices[k] = out[k];
      }
    }
    return out;
  }

  var RATE_DEFAULT_PAX = { Economy: 4, Business: 4, "Van luxury": 7 };
  function cleanRate(r) {
    r = r || {};
    var klass = str(r.klass || r.name);
    var photo = str(r.photo || r.photoPath);
    if (photo.indexOf("data:") === 0) photo = "";
    return {
      id: str(r.id),
      klass: klass,
      name: str(r.name || klass),
      vehicleClassId: str(r.vehicleClassId),
      vehicleClassSlug: str(r.vehicleClassSlug || r.slug),
      photo: photo,
      photoPath: photo,
      baseFare: cleanMoneySet(r.baseFare), perKm: cleanMoneySet(r.perKm), minFare: cleanMoneySet(r.minFare),
      airportStart: cleanMoneySet(r.airportStart),
      maxPax: num(r.maxPax, 3),
      maxBags: num(r.maxBags || r.luggageCapacity, 3),
      available: r.available === false ? false : true,
      hideFromPublic: !!r.hideFromPublic,
      hiddenReason: str(r.hiddenReason),
      sortOrder: r.sortOrder == null || r.sortOrder === "" ? 0 : num(r.sortOrder, 0)
    };
  }

  var SURCHARGE_KINDS = ["amount", "percent", "included"];
  // 26.2-p4 A5 (owner, 2026-09-30): the code never gives a row a type. `type` is only what the
  // Pricing page sends on save ("checkout_extra"), which the rate-book route reads.
  function cleanSurcharge(s) {
    s = s || {};
    return {
      id: str(s.id),
      label: str(s.label || s.code || s.name),
      name: str(s.name || s.labelEn || s.label),
      code: str(s.code || s.label),
      type: str(s.type),
      rule: str(s.rule),
      ruleId: str(s.ruleId),
      kind: SURCHARGE_KINDS.indexOf(s.kind) === -1 ? "amount" : s.kind,
      amounts: cleanMoneySet(s.amounts), pct: str(s.pct),
      labelEn: str(s.labelEn), labelDe: str(s.labelDe), labelFr: str(s.labelFr), labelAr: str(s.labelAr),
      machineLangs: Array.isArray(s.machineLangs) ? s.machineLangs.slice() : []
    };
  }

  function cleanBand(b) {
    b = b || {};
    return {
      id: str(b.id),
      fromKm: num(b.fromKm, 0),
      toKm: b.toKm === "" || b.toKm == null ? "" : num(b.toKm, 0),
      perKm: cleanMoneySet(b.perKm),
      klass: str(b.klass || b.vehicleClass),
      vehicleClassId: str(b.vehicleClassId)
    };
  }

  function cleanRegion(r) {
    r = r || {};
    return {
      id: str(r.id),
      zoneId: str(r.zoneId),
      zone: str(r.zone),
      percent: str(r.percent)
    };
  }

  function cleanRule(r) {
    r = r || {};
    var payload = r.payload;
    if (payload && typeof payload === "object") {
      try { payload = JSON.stringify(payload); } catch (e) { payload = ""; }
    }
    return {
      id: str(r.id),
      kind: str(r.kind || r.ruleKind),
      payload: str(payload)
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
    get CLASSES() { return CLASSES.slice(); },
    vehicles: restCollection("vehicles", cleanVehicle),
    chauffeurs: restCollection("chauffeurs", cleanChauffeur),
    bookings: restCollection("bookings", cleanBooking),
    customers: restCollection("customers", cleanCustomer),
    coupons: restCollection("coupons", cleanCoupon),
    routes: rateBookCollection("routes", "route", cleanRoute),
    rates: rateBookCollection("rates", "distance", cleanRate),
    surcharges: rateBookCollection("surcharges", "surcharge", cleanSurcharge),
    bands: rateBookCollection("bands", "band", cleanBand),
    regionPremiums: rateBookCollection("regionPremiums", "region", cleanRegion),
    rules: rateBookCollection("rules", "rule", cleanRule),
    settings: remoteSingleton("settings", "/api/staff/settings", settingsFromPayload),
    profile: remoteSingleton("profile", "/api/staff/me", profileFromMe),
    onAny: function (fn) { return subscribe(null, fn); },
    publish: function (id, extra) {
      if (id == null || id === "") return Promise.resolve({ ok: false, code: "missing-id" });
      return api("POST", "/api/staff/rate-versions/" + encodeURIComponent(String(id)) + "/publish", extra && typeof extra === "object" ? extra : undefined).then(function (json) {
        json = json || { ok: false, code: "unknown" };
        if (json.ok) {
          bookFetch.loaded = false;
          bookFetch.json = null;
          emit(null);
        }
        return json;
      });
    },
    discard: function (id) {
      if (id == null || id === "") return Promise.resolve({ ok: false, code: "missing-id" });
      return api("POST", "/api/staff/rate-versions/" + encodeURIComponent(String(id)) + "/discard").then(function (json) {
        json = json || { ok: false, code: "unknown" };
        if (json.ok) {
          bookFetch.loaded = false;
          bookFetch.json = null;
          emit(null);
        }
        return json;
      });
    },
    preview: function (body) {
      return api("POST", "/api/staff/rate-book/preview", body || {});
    },
    createTestUnpaid: function (body) {
      return api("POST", "/api/staff/rate-book/test-unpaid", body || {});
    },
    cloneIntoDraft: function (id) {
      if (id == null || id === "") return Promise.resolve({ ok: false, code: "missing-id" });
      return api("POST", "/api/staff/rate-versions/" + encodeURIComponent(String(id)) + "/clone").then(function (json) {
        json = json || { ok: false, code: "unknown" };
        if (json.ok) {
          bookFetch.loaded = false;
          bookFetch.json = null;
          emit(null);
        }
        return json;
      });
    },
    /* 26.1-19 D-15: delete a class. Nothing but draft rows references it -> deleted.
       Still in use -> { ok:false, code:"in-use" } without a reason; with a reason it is
       hidden everywhere. Callers re-read the rate book (rates.reset()). */
    deleteClass: function (id, reason) {
      if (id == null || id === "") return Promise.resolve({ ok: false, code: "missing-id" });
      var body = { id: String(id) };
      if (reason) body.reason = String(reason);
      return api("DELETE", "/api/staff/vehicle-classes?id=" + encodeURIComponent(String(id)), body).then(function (json) {
        json = json || { ok: false, code: "save-failed" };
        if (json.ok) {
          bookFetch.loaded = false;
          bookFetch.json = null;
        }
        return json;
      });
    },
    saveDraftVat: function (bps) {
      return api("PUT", "/api/staff/rate-book", {
        kind: "rule",
        ruleKind: "vat",
        vat_rate_bps: bps,
        payload: { vat_rate_bps: bps }
      });
    },
    resetAll: function () {
      ["vehicles", "chauffeurs", "bookings", "customers", "coupons", "routes", "rates", "surcharges", "bands", "regionPremiums", "rules", "settings", "profile"]
        .forEach(function (k) { window.VamosOps[k].reset(); });
    }
  };
})();
