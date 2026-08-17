/* Vamos Taxi — the one review store.

   The home Reviews section reads from here and the ops Reviews screen writes to
   it, so a review is edited in one place and appears in the other. Persisted to
   localStorage under `vamosReviews` until the platform API exists; the shape below
   is the contract that API has to return.

   A review carries where it came from — Google, Tripadvisor, Trustpilot, or
   collected by us. `locked` records that provenance; ops can still correct every
   field, because a name pasted wrong is a name pasted wrong.

   No review in the seed is real. Every quote describes its own slot on purpose —
   real ones arrive with the platform connection. */
(function () {
  var KEY = 'vamosReviews';
  var VERSION = 1;

  var SOURCES = [
    { id: 'google', label: 'Google', imported: true },
    { id: 'tripadvisor', label: 'Tripadvisor', imported: true },
    { id: 'trustpilot', label: 'Trustpilot', imported: true },
    { id: 'manual', label: 'Collected by us', imported: false }
  ];

  var SEED = [
    { id: 'rv-1', source: 'google', name: 'First L.', role: 'Airport transfer, Zurich',
      text: 'One verbatim sentence from a real review sits here — pasted from the platform, never rewritten.',
      rating: 5, route: 'ZRH → Zurich city', vehicleClass: 'Economy', avatar: '',
      url: '', verified: true, published: true },
    { id: 'rv-2', source: 'tripadvisor', name: 'First L.', role: 'Ski transfer, Zermatt',
      text: 'Two or three sentences is the length this block is drawn for. Longer reviews are cut at the end and marked with an ellipsis; nothing inside the quote is edited, reordered or tidied up.',
      rating: 5, route: 'ZRH → Zermatt', vehicleClass: 'Van', avatar: '',
      url: '', verified: true, published: true },
    { id: 'rv-3', source: 'trustpilot', name: 'First L.', role: 'Corporate account',
      text: 'This is about the longest excerpt the measure holds before it is trimmed. A review that runs past it keeps its opening and loses only its tail, so the words a traveller chose first are the words that show…',
      rating: 5, route: 'Zurich → Basel EuroAirport', vehicleClass: 'Business', avatar: '',
      url: '', verified: true, published: true },
    { id: 'rv-4', source: 'google', name: 'First L.', role: 'Airport pickup, ZRH',
      text: 'German reviews land here too. Strings grow around 30 per cent and the block takes it without the card reflowing.',
      rating: 5, route: 'ZRH → Zurich city', vehicleClass: 'Business', avatar: '',
      url: '', verified: true, published: true },
    { id: 'rv-5', source: 'manual', name: 'First L.', role: 'Chauffeur by the hour',
      text: 'Whichever platform a review came from, that platform’s own mark sits at the top of the card — one review, one source, no borrowed logos.',
      rating: 5, route: 'Zurich, four hours', vehicleClass: 'Business', avatar: '',
      url: '', verified: false, published: true }
  ];

  function isImported(source) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === source) return SOURCES[i].imported;
    return false;
  }

  function clean(r, i) {
    var src = r && r.source && isImported(r.source) !== undefined ? r.source : 'manual';
    return {
      id: (r && r.id) || 'rv-' + Date.now() + '-' + i,
      source: src,
      name: (r && r.name) || '',
      role: (r && r.role) || '',
      text: (r && r.text) || '',
      rating: Math.max(0, Math.min(5, +(r && r.rating) || 0)),
      route: (r && r.route) || '',
      vehicleClass: (r && r.vehicleClass) || '',
      avatar: (r && r.avatar) || '',
      url: (r && r.url) || '',
      verified: !!(r && r.verified),
      published: r && r.published === false ? false : true,
      locked: isImported(src)
    };
  }

  var list = null;

  function read() {
    if (list) return list;
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    var rows = parsed && parsed.v === VERSION && parsed.rows && parsed.rows.length ? parsed.rows : SEED;
    list = rows.map(clean);
    return list;
  }

  function write(rows) {
    list = rows.map(clean);
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, rows: list })); } catch (e) {}
    emit();
    return list;
  }

  var subs = [];
  function emit() {
    var snapshot = read();
    subs.slice().forEach(function (fn) { try { fn(snapshot); } catch (e) {} });
    try {
      window.dispatchEvent(new CustomEvent('vamos:reviews', { detail: { rows: snapshot } }));
    } catch (e) {}
  }

  /* A second tab (the ops screen beside the site) writes the same key. */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    list = null;
    emit();
  });

  window.VamosReviews = {
    SOURCES: SOURCES,
    sourceLabel: function (id) {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i].label;
      return id || '';
    },
    isImported: isImported,
    all: function () { return read().slice(); },
    published: function () { return read().filter(function (r) { return r.published; }); },
    get: function (id) {
      var rows = read();
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
      return null;
    },
    blank: function () {
      return clean({ id: 'rv-' + Date.now(), source: 'manual', rating: 5, published: false }, 0);
    },
    save: function (rows) { return write(rows); },
    add: function (r) {
      var rows = read().slice();
      rows.unshift(clean(r || {}, rows.length));
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
    remove: function (id) {
      return write(read().filter(function (r) { return r.id !== id; }));
    },
    reorder: function (fromId, toId) {
      var rows = read().slice();
      var from = -1, to = -1;
      rows.forEach(function (r, i) { if (r.id === fromId) from = i; if (r.id === toId) to = i; });
      if (from < 0 || to < 0 || from === to) return rows;
      var moved = rows.splice(from, 1)[0];
      rows.splice(to, 0, moved);
      return write(rows);
    },
    move: function (id, dir) {
      var rows = read().slice();
      var i = -1;
      rows.forEach(function (r, n) { if (r.id === id) i = n; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= rows.length) return rows;
      var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
      return write(rows);
    },
    reset: function () { list = null; try { localStorage.removeItem(KEY); } catch (e) {} emit(); return read(); },
    onChange: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    }
  };
})();
