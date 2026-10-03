// Stub /api/geo/suggest. `kind` is the PROPOSED new field (server-derived from Search Box feature_type + poi_category + maki).
const ALL = [
  { mapbox_id:'a1', name:'Zurich Airport (ZRH)', address:'Flughafenstrasse, 8302 Kloten, Switzerland', context:'Kloten, Zürich', kind:'airport' },
  { mapbox_id:'a2', name:'Zürich Hauptbahnhof', address:'Bahnhofplatz, 8001 Zürich, Switzerland', context:'Zürich', kind:'station' },
  { mapbox_id:'a3', name:'Baur au Lac', address:'Talstrasse 1, 8001 Zürich, Switzerland', context:'Zürich', kind:'hotel' },
  { mapbox_id:'a4', name:'Zurich Bahnhofstrasse 21', address:'Bahnhofstrasse 21, 8001 Zürich, Switzerland', context:'Zürich', kind:'address' },
  { mapbox_id:'a5', name:'Zürich', address:'Canton of Zürich, Switzerland', context:'Switzerland', kind:'place' },
  { mapbox_id:'a6', name:'Zurich Zoo', address:'Zürichbergstrasse 221, 8044 Zürich, Switzerland', context:'Zürich', kind:'poi' },
];
module.exports = async function stub(page, mode) {
  await page.route('**/api/geo/suggest**', async (route) => {
    if (mode === 'slow') { await new Promise(r => setTimeout(r, 6000)); }
    const q = (new URL(route.request().url()).searchParams.get('q') || '').toLowerCase();
    const list = mode === 'none' ? [] : ALL;
    await route.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, suggestions:list }) });
  });
  await page.route('**/api/**', (route) => route.request().url().includes('/api/geo/') ? route.fallback() : route.fulfill({ status:200, contentType:'application/json', body:'{}' }));
};
module.exports.ALL = ALL;
