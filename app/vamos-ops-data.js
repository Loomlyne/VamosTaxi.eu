/* Vamos Taxi — the one console store.

   Every ops screen reads and writes here: vehicles, chauffeurs, bookings,
   customers, coupons, fixed routes, per-class distance rates, surcharges, plus
   the settings and profile singletons. Persisted to localStorage until the
   platform API exists; the shapes below are the contract that API has to return.

   Nothing in the seed is real data. Plates, phone numbers and every CHF amount are
   placeholders in the house pattern (design system §2 — never invent a price).

   VamosOps.vehicles.all() / .get(id) / .add(rec) / .update(id, patch)
                   .remove(id) / .save(rows) / .onChange(fn) / .reset()
   VamosOps.settings.get() / .update(patch) / .onChange(fn)                       */
(function () {
  var VERSION = 2;
  var subs = [];

  function emit(name) {
    subs.slice().forEach(function (s) { if (!s.name || s.name === name) { try { s.fn(name); } catch (e) {} } });
    try { window.dispatchEvent(new CustomEvent('vamos:ops', { detail: { collection: name } })); } catch (e) {}
  }

  function collection(name, key, seed, clean) {
    var list = null;
    function read() {
      if (list) return list;
      var raw = null;
      try { raw = localStorage.getItem(key); } catch (e) {}
      var parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
      var rows = parsed && parsed.v === VERSION && parsed.rows ? parsed.rows : seed;
      list = rows.map(clean);
      return list;
    }
    function write(rows) {
      list = rows.map(clean);
      try { localStorage.setItem(key, JSON.stringify({ v: VERSION, rows: list })); } catch (e) {}
      emit(name);
      return list;
    }
    window.addEventListener('storage', function (e) { if (e.key === key) { list = null; emit(name); } });
    return {
      name: name,
      all: function () { return read().slice(); },
      get: function (id) {
        var rows = read();
        for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
        return null;
      },
      blank: function (over) { return clean(over || {}); },
      save: function (rows) { return write(rows); },
      add: function (rec) {
        var rows = read().slice();
        rows.push(clean(rec || {}));
        return write(rows);
      },
      update: function (id, patch) {
        return write(read().map(function (r) {
          if (r.id !== id) return r;
          var next = {}; for (var k in r) next[k] = r[k];
          for (var p in patch) next[p] = patch[p];
          return next;
        }));
      },
      /* One call for both, so a screen's save handler never has to branch. */
      upsert: function (rec) {
        var rows = read();
        for (var i = 0; i < rows.length; i++) if (rows[i].id === rec.id) return this.update(rec.id, rec);
        return this.add(rec);
      },
      remove: function (id) { return write(read().filter(function (r) { return r.id !== id; })); },
      reset: function () { list = null; try { localStorage.removeItem(key); } catch (e) {} emit(name); return read(); },
      onChange: function (fn) {
        var s = { name: name, fn: fn };
        subs.push(s);
        return function () { subs = subs.filter(function (x) { return x !== s; }); };
      }
    };
  }

  function singleton(name, key, seed) {
    var val = null;
    function read() {
      if (val) return val;
      var raw = null;
      try { raw = localStorage.getItem(key); } catch (e) {}
      var parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
      var base = parsed && parsed.v === VERSION && parsed.row ? parsed.row : {};
      val = {}; for (var k in seed) val[k] = base[k] === undefined ? seed[k] : base[k];
      return val;
    }
    window.addEventListener('storage', function (e) { if (e.key === key) { val = null; emit(name); } });
    return {
      name: name,
      get: function () { var o = read(), c = {}; for (var k in o) c[k] = o[k]; return c; },
      update: function (patch) {
        var o = read();
        for (var p in patch) o[p] = patch[p];
        try { localStorage.setItem(key, JSON.stringify({ v: VERSION, row: o })); } catch (e) {}
        emit(name);
        return this.get();
      },
      reset: function () { val = null; try { localStorage.removeItem(key); } catch (e) {} emit(name); return this.get(); },
      onChange: function (fn) {
        var s = { name: name, fn: fn };
        subs.push(s);
        return function () { subs = subs.filter(function (x) { return x !== s; }); };
      }
    };
  }

  function id(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; }

  /* ── Currencies ────────────────────────────────────────────────────────── */
  /* Pricing surfaces store one figure per currency rather than one figure that
     the display layer relabels (contrast VamosLocale.money(), which only swaps
     the mark) — dispatch can genuinely price a route differently in EUR than
     in CHF. Every figure is still a placeholder (design system §2). */
  var CURRENCIES = ['CHF', 'EUR', 'USD', 'AED'];
  function cleanMoneySet(v, fallback) {
    v = v || {};
    var out = {};
    CURRENCIES.forEach(function (c) { out[c] = str(v[c]) || fallback || ''; });
    return out;
  }
  function moneySet(v) { var o = {}; CURRENCIES.forEach(function (c) { o[c] = v; }); return o; }

  /* ── Locations ─────────────────────────────────────────────────────────── */
  /* The fixed set of pickup/drop-off names fixed routes are built from — a
     picker over known places, the same idea as the booking widget's location
     field, sized to what dispatch actually runs today. */
  var LOCATIONS = [
    'Zurich Airport (ZRH)', 'Geneva Airport (GVA)', 'Zurich city', 'Dietikon',
    'Zermatt', 'St. Moritz', 'Chamonix', 'Verbier'
  ];

  /* ── Vehicles ──────────────────────────────────────────────────────────── */
  var VEHICLE_CLASSES = ['Economy', 'Business', 'First', 'Van'];
  var VEHICLE_STATUS = ['service', 'idle', 'workshop'];
  var VEHICLES = [
    { id:'v1', klass:'Economy', model:'Sedan or similar', plate:'ZH 000 001', seats:3, bags:3, year:'0000', status:'service' },
    { id:'v2', klass:'Economy', model:'Sedan or similar', plate:'ZH 000 002', seats:3, bags:3, year:'0000', status:'service' },
    { id:'v3', klass:'Business', model:'Executive sedan', plate:'ZH 000 003', seats:3, bags:3, year:'0000', status:'service' },
    { id:'v4', klass:'Business', model:'Executive sedan', plate:'ZH 000 004', seats:3, bags:3, year:'0000', status:'idle' },
    { id:'v5', klass:'First', model:'S-Class or similar', plate:'ZH 000 005', seats:3, bags:2, year:'0000', status:'workshop' },
    { id:'v6', klass:'Van', model:'Minivan or similar', plate:'ZH 000 006', seats:7, bags:8, year:'0000', status:'service' }
  ];
  function cleanVehicle(v) {
    v = v || {};
    return {
      id: str(v.id) || id('v'),
      klass: VEHICLE_CLASSES.indexOf(v.klass) === -1 ? 'Economy' : v.klass,
      model: str(v.model), plate: str(v.plate), year: str(v.year),
      seats: num(v.seats, 3), bags: num(v.bags, 3),
      status: VEHICLE_STATUS.indexOf(v.status) === -1 ? 'service' : v.status,
      note: str(v.note)
    };
  }

  /* ── Chauffeurs ────────────────────────────────────────────────────────── */
  var CHAUFFEUR_STATUS = ['shift', 'off', 'leave'];
  var CHAUFFEURS = [
    { id:'c1', name:'Chauffeur 1', phone:'+41 00 000 00 00', email:'', vehicle:'v1', licence:'CH 000 000', languages:'German, English', status:'shift' },
    { id:'c2', name:'Chauffeur 2', phone:'+41 00 000 00 00', email:'', vehicle:'v2', licence:'CH 000 000', languages:'German, English', status:'shift' },
    { id:'c3', name:'Chauffeur 3', phone:'+41 00 000 00 00', email:'', vehicle:'v3', licence:'CH 000 000', languages:'French, English', status:'shift' },
    { id:'c4', name:'Chauffeur 4', phone:'+41 00 000 00 00', email:'', vehicle:'v6', licence:'CH 000 000', languages:'Arabic, English', status:'off' },
    { id:'c5', name:'Chauffeur 5', phone:'+41 00 000 00 00', email:'', vehicle:'', licence:'CH 000 000', languages:'German', status:'off' }
  ];
  function cleanChauffeur(c) {
    c = c || {};
    return {
      id: str(c.id) || id('c'),
      name: str(c.name), phone: str(c.phone), email: str(c.email),
      vehicle: str(c.vehicle), licence: str(c.licence), languages: str(c.languages),
      status: CHAUFFEUR_STATUS.indexOf(c.status) === -1 ? 'off' : c.status,
      note: str(c.note)
    };
  }

  /* ── Bookings ──────────────────────────────────────────────────────────── */
  var BOOKING_STATUS = ['quote', 'pending', 'paid', 'confirmed', 'assigned', 'completed', 'cancelled', 'refunded', 'no-show'];
  var BOOKINGS = [
    { id:'VT-4821', time:'08:15', date:'Fri 14 Aug', customer:'Traveller 1', pickup:'Zurich Airport (ZRH), Terminal 2', dropoff:'Bleicherstrasse 16, 8953 Dietikon', klass:'Business', pax:2, bags:2, status:'assigned', chauffeur:'c2' },
    { id:'VT-4822', time:'09:40', date:'Fri 14 Aug', customer:'Traveller 2', pickup:'Zurich HB, Bahnhofplatz', dropoff:'Zurich Airport (ZRH), Terminal 1', klass:'Economy', pax:1, bags:1, status:'paid', chauffeur:'' },
    { id:'VT-4823', time:'11:05', date:'Fri 14 Aug', customer:'Traveller 3', pickup:'Dietikon, Bahnhofstrasse', dropoff:'Zermatt, Bahnhofplatz', klass:'Van', pax:6, bags:8, status:'pending', chauffeur:'' },
    { id:'VT-4824', time:'14:30', date:'Fri 14 Aug', customer:'Traveller 4', pickup:'Zurich Airport (ZRH), Terminal 2', dropoff:'St. Moritz, Via Serlas', klass:'Business', pax:2, bags:3, status:'confirmed', chauffeur:'' },
    { id:'VT-4825', time:'17:50', date:'Fri 14 Aug', customer:'Traveller 5', pickup:'Baden, Kurplatz', dropoff:'Zurich Airport (ZRH), Terminal 1', klass:'Economy', pax:3, bags:3, status:'paid', chauffeur:'c1' },
    { id:'VT-4829', time:'21:00', date:'Fri 14 Aug', customer:'Traveller 6', pickup:'Zurich, City', dropoff:'Zurich Airport (ZRH), Terminal 1', klass:'Economy', pax:1, bags:1, status:'assigned', chauffeur:'c1' },
    { id:'VT-4818', time:'06:20', date:'Fri 14 Aug', customer:'Traveller 7', pickup:'Uster, Zürichstrasse', dropoff:'Zurich Airport (ZRH), Terminal 2', klass:'Business', pax:1, bags:2, status:'completed', chauffeur:'c3' },
    { id:'VT-4826', time:'07:30', date:'Sat 15 Aug', customer:'Traveller 8', pickup:'Zurich Airport (ZRH), Terminal 1', dropoff:'Baden, Kurplatz', klass:'Economy', pax:2, bags:2, status:'confirmed', chauffeur:'' },
    { id:'VT-4827', time:'10:00', date:'Sat 15 Aug', customer:'Traveller 9', pickup:'Zurich, City', dropoff:'Zurich Airport (ZRH), Terminal 2', klass:'Business', pax:2, bags:2, status:'paid', chauffeur:'c3' },
    { id:'VT-4828', time:'13:20', date:'Sat 15 Aug', customer:'Traveller 10', pickup:'Zurich Airport (ZRH), Terminal 2', dropoff:'Verbier, Place Centrale', klass:'Van', pax:5, bags:6, status:'pending', chauffeur:'' },
    { id:'VT-4830', time:'08:00', date:'Thu 13 Aug', customer:'Traveller 11', pickup:'Zurich Airport (ZRH), Terminal 2', dropoff:'Zurich, City', klass:'Business', pax:2, bags:2, status:'completed', chauffeur:'c2' },
    { id:'VT-4812', time:'19:15', date:'Thu 13 Aug', customer:'Traveller 12', pickup:'Zurich Airport (ZRH), Terminal 2', dropoff:'Verbier, Place Centrale', klass:'Van', pax:5, bags:6, status:'cancelled', chauffeur:'' }
  ];
  function cleanBooking(b) {
    b = b || {};
    return {
      id: str(b.id) || 'VT-' + Math.floor(1000 + Math.random() * 8999),
      time: str(b.time), date: str(b.date), customer: str(b.customer),
      pickup: str(b.pickup), dropoff: str(b.dropoff),
      klass: VEHICLE_CLASSES.indexOf(b.klass) === -1 ? 'Economy' : b.klass,
      pax: num(b.pax, 1), bags: num(b.bags, 1),
      status: BOOKING_STATUS.indexOf(b.status) === -1 ? 'pending' : b.status,
      chauffeur: str(b.chauffeur), flight: str(b.flight), note: str(b.note)
    };
  }

  /* ── Customers ─────────────────────────────────────────────────────────── */
  var CUSTOMER_TYPES = ['private', 'corporate'];
  var CUSTOMERS = [
    { id:'cu1', name:'Traveller 1', email:'traveller1@example.com', phone:'+41 00 000 00 00', type:'private', company:'', trips:4, since:'0000', note:'' },
    { id:'cu2', name:'Traveller 2', email:'traveller2@example.com', phone:'+41 00 000 00 00', type:'private', company:'', trips:1, since:'0000', note:'' },
    { id:'cu3', name:'Traveller 3', email:'accounts@example.com', phone:'+41 00 000 00 00', type:'corporate', company:'Corporate account 1', trips:22, since:'0000', note:'Invoiced monthly' },
    { id:'cu4', name:'Traveller 4', email:'traveller4@example.com', phone:'+41 00 000 00 00', type:'private', company:'', trips:2, since:'0000', note:'' },
    { id:'cu5', name:'Traveller 5', email:'travel@example.com', phone:'+41 00 000 00 00', type:'corporate', company:'Corporate account 2', trips:9, since:'0000', note:'' }
  ];
  function cleanCustomer(c) {
    c = c || {};
    return {
      id: str(c.id) || id('cu'),
      name: str(c.name), email: str(c.email), phone: str(c.phone),
      type: CUSTOMER_TYPES.indexOf(c.type) === -1 ? 'private' : c.type,
      company: str(c.company), trips: num(c.trips, 0), since: str(c.since), note: str(c.note)
    };
  }

  /* ── Coupons ───────────────────────────────────────────────────────────── */
  var COUPON_KINDS = ['percent', 'amount'];
  var COUPONS = [
    { id:'cp1', code:'WELCOME', kind:'percent', value:'00', uses:0, limit:100, expires:'0000-00-00', active:true, note:'First booking only' },
    { id:'cp2', code:'CORPORATE', kind:'percent', value:'00', uses:0, limit:0, expires:'', active:true, note:'Corporate accounts' },
    { id:'cp3', code:'SKI', kind:'amount', value:'00', uses:0, limit:50, expires:'0000-00-00', active:false, note:'Ski season routes' }
  ];
  function cleanCoupon(c) {
    c = c || {};
    return {
      id: str(c.id) || id('cp'),
      code: str(c.code).toUpperCase(),
      kind: COUPON_KINDS.indexOf(c.kind) === -1 ? 'percent' : c.kind,
      value: str(c.value), uses: num(c.uses, 0), limit: num(c.limit, 0),
      expires: str(c.expires), active: c.active === false ? false : true, note: str(c.note)
    };
  }

  /* ── Fixed routes ──────────────────────────────────────────────────────── */
  /* economy/business/van are a value per currency (cleanMoneySet), not one value
     the display layer relabels — a class that isn't offered on a route reads
     empty in every currency, offered reads '000' as a placeholder in every
     currency, and dispatch fills each currency in on its own from there. */
  function priceSet(offered) { return moneySet(offered ? '000' : ''); }
  var ROUTES = [
    { id:'FR-01', from:'Zurich Airport (ZRH)', to:'Zurich city', economy:priceSet(true), business:priceSet(true), van:priceSet(true), live:true },
    { id:'FR-02', from:'Zurich Airport (ZRH)', to:'Dietikon', economy:priceSet(true), business:priceSet(true), van:priceSet(true), live:true },
    { id:'FR-03', from:'Zurich Airport (ZRH)', to:'Zermatt', economy:priceSet(false), business:priceSet(true), van:priceSet(true), live:false },
    { id:'FR-04', from:'Zurich Airport (ZRH)', to:'St. Moritz', economy:priceSet(false), business:priceSet(true), van:priceSet(true), live:false },
    { id:'FR-05', from:'Geneva Airport (GVA)', to:'Chamonix', economy:priceSet(false), business:priceSet(true), van:priceSet(true), live:false },
    { id:'FR-06', from:'Zurich Airport (ZRH)', to:'Verbier', economy:priceSet(false), business:priceSet(true), van:priceSet(true), live:false }
  ];
  function cleanRoute(r) {
    r = r || {};
    return {
      id: str(r.id) || id('FR'),
      from: str(r.from), to: str(r.to),
      economy: cleanMoneySet(r.economy), business: cleanMoneySet(r.business), van: cleanMoneySet(r.van),
      live: !!r.live
    };
  }

  /* ── Class rates (distance rules) ─────────────────────────────────────── */
  var RATE_DEFAULT_PAX = { Economy: 3, Business: 3, First: 3, Van: 8 };
  var RATES = VEHICLE_CLASSES.map(function (k) {
    return { id: k, klass: k, baseFare: moneySet('000'), perKm: moneySet('0.00'), minFare: moneySet('000'), maxPax: RATE_DEFAULT_PAX[k] || 3, available: true };
  });
  function cleanRate(r) {
    r = r || {};
    var klass = VEHICLE_CLASSES.indexOf(r.klass) === -1 ? 'Economy' : r.klass;
    return {
      id: str(r.id) || klass,
      klass: klass,
      baseFare: cleanMoneySet(r.baseFare, '000'), perKm: cleanMoneySet(r.perKm, '0.00'), minFare: cleanMoneySet(r.minFare, '000'),
      maxPax: num(r.maxPax, RATE_DEFAULT_PAX[klass] || 3),
      available: r.available === false ? false : true
    };
  }

  /* ── Surcharges ────────────────────────────────────────────────────────── */
  /* kind decides which of the other two fields is live: 'amount' reads amounts
     (one figure per currency), 'percent' reads pct (currency-agnostic — a
     percentage of the fare needs no mark of its own), 'included' reads neither. */
  var SURCHARGE_KINDS = ['amount', 'percent', 'included'];
  var SURCHARGES = [
    { id:'S1', label:'Airport pickup', rule:'Applied when pickup is inside an airport zone', kind:'amount', amounts:moneySet('00'), pct:'00' },
    { id:'S2', label:'Night surcharge', rule:'22:00 – 06:00', kind:'percent', amounts:moneySet('00'), pct:'00' },
    { id:'S3', label:'Waiting, airport', rule:'First 60 minutes included, then per 15 min', kind:'amount', amounts:moneySet('00'), pct:'00' },
    { id:'S4', label:'Waiting, city', rule:'First 15 minutes included, then per 15 min', kind:'amount', amounts:moneySet('00'), pct:'00' },
    { id:'S5', label:'Additional stop', rule:'Per stop, inside route corridor', kind:'amount', amounts:moneySet('00'), pct:'00' },
    { id:'S6', label:'Child seat', rule:'Per seat, per journey', kind:'amount', amounts:moneySet('00'), pct:'00' },
    { id:'S7', label:'Meet and greet, arrivals', rule:'Included in every airport pickup', kind:'included', amounts:moneySet(''), pct:'' },
    { id:'S8', label:'Ski or board rack', rule:'Fitted on request, ski season', kind:'amount', amounts:moneySet('00'), pct:'00' }
  ];
  function cleanSurcharge(s) {
    s = s || {};
    return {
      id: str(s.id) || id('S'),
      label: str(s.label), rule: str(s.rule),
      kind: SURCHARGE_KINDS.indexOf(s.kind) === -1 ? 'amount' : s.kind,
      amounts: cleanMoneySet(s.amounts, '00'), pct: str(s.pct) || '00'
    };
  }

  /* ── Singletons ────────────────────────────────────────────────────────── */
  var SETTINGS = {
    company: 'Vamos Taxi GmbH',
    address: 'Bleicherstrasse 16, 8953 Dietikon ZH',
    uid: 'CH-020.4.077.792-7',
    phone: '+41 79 626 70 82',
    email: 'info@vamostaxi.eu',
    defaultLang: 'en',
    defaultCur: 'CHF',
    minAdvance: '',
    cancelWindow: '',
    airportWait: '60',
    cityWait: '15',
    cash: true, card: true, twint: true, invoice: true,
    emailConfirm: true, emailReminder: true, smsReminder: false, opsAlerts: true
  };
  var PROFILE = {
    name: 'Dispatch',
    role: 'Admin role',
    email: 'dispatch@vamostaxi.eu',
    phone: '+41 00 000 00 00',
    lang: 'en',
    avatar: '',
    twoFactor: false,
    digest: true,
    passkey: false
  };

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
    vehicles: collection('vehicles', 'vamosOpsVehicles', VEHICLES, cleanVehicle),
    chauffeurs: collection('chauffeurs', 'vamosOpsChauffeurs', CHAUFFEURS, cleanChauffeur),
    bookings: collection('bookings', 'vamosOpsBookings', BOOKINGS, cleanBooking),
    customers: collection('customers', 'vamosOpsCustomers', CUSTOMERS, cleanCustomer),
    coupons: collection('coupons', 'vamosOpsCoupons', COUPONS, cleanCoupon),
    routes: collection('routes', 'vamosOpsRoutes', ROUTES, cleanRoute),
    rates: collection('rates', 'vamosOpsRates', RATES, cleanRate),
    surcharges: collection('surcharges', 'vamosOpsSurcharges', SURCHARGES, cleanSurcharge),
    settings: singleton('settings', 'vamosOpsSettings', SETTINGS),
    profile: singleton('profile', 'vamosOpsProfile', PROFILE),
    /* Any collection or singleton changing wakes every screen that asks for it. */
    onAny: function (fn) {
      var s = { name: null, fn: fn };
      subs.push(s);
      return function () { subs = subs.filter(function (x) { return x !== s; }); };
    },
    resetAll: function () {
      ['vehicles', 'chauffeurs', 'bookings', 'customers', 'coupons', 'routes', 'rates', 'surcharges', 'settings', 'profile']
        .forEach(function (k) { window.VamosOps[k].reset(); });
    }
  };
})();
