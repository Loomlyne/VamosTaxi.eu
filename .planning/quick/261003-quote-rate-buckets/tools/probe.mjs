// Local Worker proof for quick 261003: lookups no longer spend the /api/quote counter.
// Usage: BASE=http://127.0.0.1:4861 node probe.mjs [lookups]
// No cookie is sent, so every call is on the bare (per-IP) buckets — the live state while
// VAMOS_QS_SECRET is unset. The quote body uses coords places without a session, so the
// pipeline refuses at resolve_coordinates (after the rate-limit step) and never reaches
// Mapbox or the database: any answer other than 429 means the rate limit let it through.
const BASE = process.env.BASE ?? "http://127.0.0.1:4861";
const N = Number(process.argv[2] ?? 10);
const session = crypto.randomUUID();

const out = { lookups: [], quotes: [] };
for (let i = 0; i < N; i++) {
  const r = await fetch(`${BASE}/api/geo/suggest?q=Z&session_token=${session}&locale=en`);
  out.lookups.push(r.status);
}
const body = {
  locale: "en",
  display_currency: "CHF",
  mode: "one_way",
  pickup: { kind: "coords", lng: 8.5492, lat: 47.4582, text: "Zurich Airport" },
  dropoff: { kind: "coords", lng: 8.5402, lat: 47.3779, text: "Zurich Main Station" },
  legs: [{ leg_seq: 1, scheduled_local: "2026-12-01T10:30" }],
  pax: 2,
  bags: 1,
};
for (let i = 0; i < 6; i++) {
  const r = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.ORIGIN ?? BASE },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  out.quotes.push(`${r.status}:${j?.error ?? j?.code ?? "?"}`);
}
console.log(JSON.stringify(out));
