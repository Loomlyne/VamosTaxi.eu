// Local stand-in for api.mapbox.com (Van luxury 12 job, scratch only). Two city places, a fixed 30 km route.
import http from "node:http";

const PORT = Number(process.env.MAP_FAKE_PORT ?? 4498);
const PLACES = {
  "fake.zrh-hb": { name: "Zurich HB", full_address: "Bahnhofplatz, 8001 Zurich", lng: 8.540192, lat: 47.378177, city: ["fake.place.zurich", "Zurich"], region: "ZH" },
  "fake.zug": { name: "Zug Bahnhof", full_address: "Bahnhofplatz, 6300 Zug", lng: 8.515, lat: 47.1736, city: ["fake.place.zug", "Zug"], region: "ZG" },
};
const stats = { suggest: 0, retrieve: 0, directions: 0, other: 0 };
const json = (res, body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/^\/__mapbox/, "");
  if (p === "/__stats") return json(res, stats);
  if (p.startsWith("/search/searchbox/v1/suggest")) {
    stats.suggest++;
    const q = (u.searchParams.get("q") || "").toLowerCase();
    const hits = Object.entries(PLACES).filter(([, v]) => !q || v.name.toLowerCase().includes(q.slice(0, 3)));
    return json(res, { suggestions: (hits.length ? hits : Object.entries(PLACES)).map(([id, v]) => ({ mapbox_id: id, name: v.name, full_address: v.full_address, place_formatted: v.full_address })) });
  }
  if (p.startsWith("/search/searchbox/v1/retrieve/")) {
    stats.retrieve++;
    const id = decodeURIComponent(p.split("/").pop());
    const v = PLACES[id];
    if (!v) return json(res, { features: [] });
    return json(res, { features: [{ geometry: { type: "Point", coordinates: [v.lng, v.lat] }, properties: { mapbox_id: id, name: v.name, full_address: v.full_address, context: { place: { mapbox_id: v.city[0], name: v.city[1] }, region: { region_code: v.region, name: v.region } } } }] });
  }
  if (p.startsWith("/directions/v5/mapbox/driving/")) {
    stats.directions++;
    const coords = decodeURIComponent(p.split("/").pop()).split(";").map((s) => s.split(",").map(Number));
    return json(res, { code: "Ok", routes: [{ distance: 30000, duration: 1800, geometry: { type: "LineString", coordinates: coords } }] });
  }
  stats.other++;
  return json(res, { features: [] });
}).listen(PORT, "127.0.0.1");
