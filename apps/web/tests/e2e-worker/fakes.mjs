// 26.5 plan 07: local stand-ins for the two outside services the checkout routes call.
// Started by run.sh next to the Worker. Local only, no real Stripe, no real Turnstile, nothing printed.
//   /__turnstile/turnstile/v0/siteverify : always success unless the token is "fail"; echoes action, hostname "localhost"
//   /__stripe/v1/checkout/sessions[...]  : a minimal Checkout Session store (create, retrieve, expire)
// run.sh prepends a fetch rewrite to the built worker.js so api.stripe.com and challenges.cloudflare.com
// reach this server (see run.sh). The build output only, never the source.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.E2E_FAKE_PORT ?? 4297);
const sessions = new Map(); // id -> session
const byKey = new Map(); // idempotency key -> id
const stats = { turnstile: 0, sessionsCreated: 0, refunds: 0, mapbox: 0, resend: 0 };
const mails = []; // 26.2 P6: what the Resend stand-in was handed (to, subject, text/html), newest last

// Stripe's form encoding: a[b][0][c]=v  ->  nested object
function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else o = o[p] ??= {};
    });
  }
  return out;
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "request-id": "req_e2e_fake" });
  res.end(JSON.stringify(body));
};


// ---- 26.2 P6: local stand-ins for Mapbox (Search Box, Geocoding, Directions) and Resend (added next to the Stripe and Turnstile ones) ----
// Places are the ones of trip-change.local-fixture.ts (same ids, coordinates, airport and city facts); a query picks them by substring.
// "Dubai" is a real place far outside the Europe box the site books; its route is a no-route answer.
const PLACES = {
  "mb-oerlikon": { name: "Zurich Oerlikon", address: "Oerlikon, 8050 Zurich", lng: 8.5442, lat: 47.4115, canton: "ZH", cityId: "city-zurich", cityName: "Zurich", airport: false },
  "mb-zrh": { name: "Zurich Airport", address: "Flughafenstrasse, 8058 Kloten", lng: 8.5624, lat: 47.4504, canton: "ZH", cityId: "city-kloten", cityName: "Kloten", airport: true },
  "mb-zug": { name: "Zug station", address: "Bahnhofplatz, 6300 Zug", lng: 8.5152, lat: 47.1737, canton: "ZG", cityId: "city-zug", cityName: "Zug", airport: false },
  "mb-wallisellen": { name: "Wallisellen", address: "8304 Wallisellen", lng: 8.5967, lat: 47.4148, canton: "ZH", cityId: "city-wallisellen", cityName: "Wallisellen", airport: false },
  "mb-dubai": { name: "Dubai Mall", address: "Financial Centre Road, Dubai", lng: 55.27, lat: 25.2, canton: null, cityId: "city-dubai", cityName: "Dubai", airport: false },
};
const QUERY_TO_ID = [[/zurich airport|zrh|kloten/i, "mb-zrh"], [/zug/i, "mb-zug"], [/walli/i, "mb-wallisellen"], [/dubai/i, "mb-dubai"], [/oerlikon/i, "mb-oerlikon"]];
const featureOf = (id, p) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  properties: {
    mapbox_id: id, name: p.name, full_address: p.address, place_formatted: p.address,
    ...(p.airport ? { poi_category: ["airport"], maki: "airport" } : {}),
    context: { ...(p.canton ? { region: { region_code: p.canton, region_code_full: "CH-" + p.canton } } : {}), place: { mapbox_id: p.cityId, name: p.cityName } },
  },
});
// Same numbers as the fixture: to or from Zug 42517 m / 3300 s, Wallisellen 6210 m / 660 s, otherwise 31417 m / 2400 s.
function directionsFor(coordPath) {
  const pts = coordPath.split(";").map((c) => c.split(",").map(Number));
  const near = (pt, id) => Math.abs(pt[0] - PLACES[id].lng) < 1e-4 && Math.abs(pt[1] - PLACES[id].lat) < 1e-4;
  if (pts.some((pt) => near(pt, "mb-dubai") || pt[0] > 40)) return { code: "NoRoute", routes: [] };
  const zug = pts.some((pt) => near(pt, "mb-zug")), wal = pts.some((pt) => near(pt, "mb-wallisellen"));
  const distance = zug ? 42517 : wal ? 6210 : 31417, duration = zug ? 3300 : wal ? 660 : 2400;
  return { code: "Ok", routes: [{ distance, duration, geometry: { type: "LineString", coordinates: pts } }], waypoints: [] };
}

http.createServer((req, res) => {
  let buf = "";
  req.on("data", (d) => (buf += d));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__stats") return json(res, 200, stats);
    if (u.pathname === "/__turnstile/turnstile/v0/siteverify") {
      stats.turnstile++;
      const f = parseForm(buf);
      if (f.response === "fail") return json(res, 200, { success: false, "error-codes": ["invalid-input-response"] });
      return json(res, 200, { success: true, action: f.action ?? "", hostname: "localhost", challenge_ts: new Date().toISOString() });
    }
    const m = /^\/__stripe\/v1\/checkout\/sessions(?:\/([^/]+)(\/expire)?)?$/.exec(u.pathname);
    if (m) {
      const [, id, expire] = m;
      if (!id && req.method === "POST") {
        const key = req.headers["idempotency-key"];
        if (key && byKey.has(key)) return json(res, 200, sessions.get(byKey.get(key)));
        const f = parseForm(buf);
        const sid = "cs_test_e2e_" + crypto.randomBytes(8).toString("hex");
        const amount = Number(f.line_items?.["0"]?.price_data?.unit_amount);
        const s = {
          id: sid, object: "checkout.session", livemode: false,
          url: `https://checkout.stripe.com/c/pay/${sid}`,
          status: "open", payment_status: "unpaid", mode: "payment",
          currency: "chf", amount_total: amount, amount_subtotal: amount,
          customer_email: f.customer_email ?? null, client_reference_id: f.client_reference_id ?? null,
          metadata: f.metadata ?? {}, expires_at: Number(f.expires_at) || Math.floor(Date.now() / 1000) + 1860,
          payment_intent: { id: "pi_test_e2e_" + crypto.randomBytes(8).toString("hex"), object: "payment_intent", metadata: {} },
        };
        sessions.set(sid, s); if (key) byKey.set(key, sid); stats.sessionsCreated++;
        return json(res, 200, s);
      }
      const s = id && sessions.get(id);
      if (!s) return json(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such checkout.session" } });
      if (expire && req.method === "POST") { s.status = "expired"; return json(res, 200, s); }
      return json(res, 200, s);
    }
    // ---- Stripe: refunds and the session list (26.2 P6 evidence: a cheaper change must send no refund) ----
    if (u.pathname === "/__stripe/v1/refunds" && req.method === "POST") {
      stats.refunds++;
      const f = parseForm(buf);
      return json(res, 200, { id: "re_test_e2e_" + crypto.randomBytes(6).toString("hex"), object: "refund", status: "succeeded", amount: Number(f.amount) || null, currency: "chf", payment_intent: f.payment_intent ?? null, metadata: f.metadata ?? {} });
    }
    if (u.pathname === "/__sessions") {
      return json(res, 200, [...sessions.values()].map((s) => ({ id: s.id, status: s.status, amount_total: s.amount_total, metadata: s.metadata, customer_email: s.customer_email })));
    }
    // ---- Mapbox ----
    let mm;
    if ((mm = /^\/__mapbox\/search\/searchbox\/v1\/suggest$/.exec(u.pathname))) {
      stats.mapbox++;
      const q = u.searchParams.get("q") ?? "";
      const ids = [...new Set(QUERY_TO_ID.filter(([re]) => re.test(q)).map(([, id]) => id))];
      return json(res, 200, { suggestions: ids.map((id) => ({ mapbox_id: id, name: PLACES[id].name, full_address: PLACES[id].address, place_formatted: PLACES[id].address, feature_type: "poi" })), attribution: "e2e" });
    }
    if ((mm = /^\/__mapbox\/search\/searchbox\/v1\/retrieve\/([^/]+)$/.exec(u.pathname))) {
      stats.mapbox++;
      const id = decodeURIComponent(mm[1]);
      return json(res, 200, { type: "FeatureCollection", features: PLACES[id] ? [featureOf(id, PLACES[id])] : [] });
    }
    if (u.pathname === "/__mapbox/search/geocode/v6/reverse") { stats.mapbox++; return json(res, 200, { type: "FeatureCollection", features: [] }); }
    if ((mm = /^\/__mapbox\/directions\/v5\/mapbox\/driving\/(.+)$/.exec(u.pathname))) { stats.mapbox++; return json(res, 200, directionsFor(decodeURIComponent(mm[1]))); }
    if (u.pathname.startsWith("/__mapbox/v4/")) { stats.mapbox++; return json(res, 200, { type: "FeatureCollection", features: [] }); } // tilequery (only after NoRoute)
    // ---- Resend: POST /emails stores what it was handed; GET /__mails lists it (subject and recipient, short text) ----
    if (u.pathname === "/__resend/emails" && req.method === "POST") {
      stats.resend++;
      let b = {}; try { b = JSON.parse(buf); } catch {}
      const to = Array.isArray(b.to) ? b.to : [b.to];
      const id = "re_fake_" + crypto.randomBytes(6).toString("hex");
      mails.push({ id, at: new Date().toISOString(), to: to.map(String), subject: String(b.subject ?? ""), text: String(b.text ?? ""), html: String(b.html ?? "") });
      return json(res, 200, { id });
    }
    if (u.pathname === "/__mails") return json(res, 200, mails);
    json(res, 404, { error: { type: "invalid_request_error", message: "fake: unknown path" } });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fakes on ${PORT}`));
