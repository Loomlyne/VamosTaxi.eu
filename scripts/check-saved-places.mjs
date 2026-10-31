#!/usr/bin/env node
// Every saved place on the home box against Mapbox, through the site's own read-only /api/geo routes.
// Fails if an id no longer resolves or lands over 1.5 km from the row's coordinates.
// Run by hand: node scripts/check-saved-places.mjs [https://vamostaxi.site]
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "https://vamostaxi.site";
const html = readFileSync(new URL("../app/home/home.dc.html", import.meta.url), "utf8");
const rows = [...html.matchAll(/\{ id:'(\w+)', n:'([^']+)'.*?lat:([\d.]+), lon:([\d.]+).*?mapbox_id:'([^']+)'/g)].map((m) => ({
  id: m[1],
  name: m[2],
  lat: Number(m[3]),
  lng: Number(m[4]),
  mapboxId: m[5],
}));
const kmBetween = (a, b) => {
  const rad = Math.PI / 180;
  return 6371 * Math.hypot((b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) * rad) / 2), (b.lat - a.lat) * rad);
};
const session = crypto.randomUUID();
await fetch(`${base}/api/geo/suggest?q=zurich&session_token=${session}&locale=en`);
let failed = rows.length === 0 ? 1 : 0;
for (const row of rows) {
  const res = await fetch(`${base}/api/geo/retrieve?mapbox_id=${row.mapboxId}&session_token=${session}&locale=en`);
  const place = (await res.json().catch(() => ({}))).place;
  const km = place ? kmBetween(row, place) : null;
  const ok = km !== null && km <= 1.5;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${row.id.padEnd(9)} ${km === null ? "not resolved" : `${km.toFixed(2)} km`}  ${place?.name ?? ""}`);
  await new Promise((done) => setTimeout(done, 900));
}
console.log(`${rows.length} rows, ${failed} failed`);
process.exit(failed ? 1 : 0);
