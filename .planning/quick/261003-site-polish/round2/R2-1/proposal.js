/* R2-1 picture helper. Decorates the REAL rendered rows (real data, real hover/active) and builds the
   loading / empty / popular states. Logic here is the spec for the coder (see proposal.md). */
(function () {
  const SVG = {
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    'train-front': '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  };
  const wrap = (p) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>');
  const iconUrl = (n) => SVG[n] ? wrap(SVG[n]) : '/assets/icons/' + n + '.svg';
  const AR = document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl';
  const L = AR ? { Airport: 'مطار', Hotel: 'فندق', Station: 'محطة', Address: 'عنوان', City: 'مدينة', Place: 'مكان', results: 'نتائج البحث', popular: 'الأكثر طلبًا', none: 'لم نجد أماكن لـ', tip: 'جرّب الشارع والمدينة أو اسم فندق أو رمز مطار.' }
    : { Airport: 'Airport', Hotel: 'Hotel', Station: 'Station', Address: 'Address', City: 'City', Place: 'Place', results: 'Search results', popular: 'Popular', none: 'No places found for', tip: 'Try the street and city, a hotel name or an airport code.' };
  const KIND = {
    airport: { icon: 'plane', label: L.Airport }, hotel: { icon: 'bed', label: L.Hotel }, station: { icon: 'train-front', label: L.Station },
    address: { icon: 'map-pin', label: L.Address }, place: { icon: 'map', label: L.City }, poi: { icon: 'map-pin', label: L.Place },
  };
  const BY_NAME = {
    'Zurich Airport (ZRH)': ['airport', '8302 Kloten, Switzerland'], 'Zürich Hauptbahnhof': ['station', '8001 Zürich, Switzerland'],
    'Baur au Lac': ['hotel', 'Talstrasse 1, 8001 Zürich'], 'Zurich Bahnhofstrasse 21': ['address', '8001 Zürich, Switzerland'],
    'Zurich': ['place', 'Switzerland'], 'Zürich': ['place', 'Switzerland'], 'Zurich Zoo': ['poi', 'Zürichbergstrasse 221, 8044 Zürich'],
  };
  const ic = (n, s) => '<span style="display:inline-block;width:' + s + 'px;height:' + s + 'px;background:currentColor;-webkit-mask:url(\'' + iconUrl(n) + '\') center/contain no-repeat;mask:url(\'' + iconUrl(n) + '\') center/contain no-repeat"></span>';
  const flat = (c) => c.normalize('NFD')[0].toLowerCase();
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  /** Match highlight: case- and accent-insensitive; every typed word marks the start of a word in the name. */
  function hl(name, q) {
    const n = Array.from(name).map(flat).join('');
    const words = q.trim().split(/\s+/).filter(Boolean).map((w) => Array.from(w).map(flat).join(''));
    const mark = new Array(name.length).fill(false);
    words.forEach((w) => { let i = -1; while ((i = n.indexOf(w, i + 1)) !== -1) { if (i === 0 || /[\s\-(,'’]/.test(n[i - 1])) for (let k = 0; k < w.length; k++) mark[i + k] = true; } });
    let out = '', open = false;
    Array.from(name).forEach((c, i) => { if (mark[i] && !open) { out += '<span data-sug-hit>'; open = true; } if (!mark[i] && open) { out += '</span>'; open = false; } out += esc(c); });
    return out + (open ? '</span>' : '');
  }
  function rowHtml(name, sub, kind, q, sel) {
    const k = KIND[kind];
    return '<div data-sug-row="1" role="option" aria-selected="' + (sel ? 'true' : 'false') + '"><span data-sug-tile="1" aria-hidden="true">' + ic(k.icon, 18) + '</span><span data-sug-text="1" data-vt-no-i18n><span data-sug-name="1">' + hl(name, q) + '</span><span data-sug-sub="1">' + esc(sub) + '</span></span><span data-sug-kind="1">' + k.label + '</span></div>';
  }
  window.__r21 = function (state, q) {
    q = q || '';
    const box = document.querySelector('[data-bs-sug]') || document.querySelector('[data-sug]');
    if (!box) return;
    const active = state && state.indexOf('active') === 0 ? Math.max(0, +state.split(':')[1] || 0) : -1;
    if (!state || state === 'list' || state === 'hover' || state.indexOf('active') === 0) {
      const rows = box.querySelectorAll('[data-sug-row]');
      rows.forEach((r, i) => {
        const nm0 = r.querySelector('[data-sug-name]').textContent;
        const ORDER = ['Zurich Airport (ZRH)', 'Zurich Bahnhofstrasse 21', 'Zurich Zoo', 'Zürich Hauptbahnhof', 'Baur au Lac', 'Zürich'];
        const nm = BY_NAME[nm0] ? nm0 : ORDER[i]; const m = BY_NAME[nm]; if (!m) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = rowHtml(nm, m[1], m[0], q, i === active);
        r.replaceWith(tmp.firstChild);
      });
      const hd = box.querySelector('[data-sug-head]'); if (hd) hd.textContent = L.results;
      return;
    }
    const head = (t) => '<span data-sug-head="1">' + t + '</span>';
    let html = '';
    if (state === 'loading') html = head(L.results) + '<div data-sug-skel="1"><i></i><span><i></i><i></i></span></div><div data-sug-skel="1"><i></i><span><i></i><i></i></span></div><div data-sug-skel="1"><i></i><span><i></i><i></i></span></div>';
    if (state === 'empty') html = '<div data-sug-empty="1"><span data-sug-tile="1" aria-hidden="true">' + ic('search', 18) + '</span><div><b>' + L.none + ' “' + esc(q) + '”</b><span>' + L.tip + '</span></div></div>';
    if (state === 'popular') html = head(L.popular) + rowHtml('Zurich Airport (ZRH), Terminal 2', 'Kloten · meet & greet in arrivals', 'airport', '', false) + rowHtml('Geneva Airport (GVA)', 'Grand-Saconnex · arrivals', 'airport', '', false) + rowHtml('Basel EuroAirport (BSL)', 'Saint-Louis · arrivals', 'airport', '', false) + rowHtml('Zurich HB', 'Main station · city centre', 'station', '', false);
    box.innerHTML = html;
  };
})();
