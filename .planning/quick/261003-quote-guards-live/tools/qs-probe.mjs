// Quick 261003 quote-guards-live, owner decision B: on the local Worker with a dev VAMOS_QS_SECRET,
//  1. GET / (DC mock home) and GET /checkout hand a new visitor a signed vamos_qs cookie;
//  2. with that cookie quotes 1-8 pass the rate limit (verified bucket 8/60) and the 9th is 429;
//  3. without it quotes 1-4 pass and the 5th-8th are 429 (bare bucket 4/60, the live state today).
// Every quote carries Cloudflare's public test token; TURNSTILE_SECRET_KEY is the always-pass test
// secret, so the challenge step (3rd quote on) passes through REAL siteverify and only the limiter decides.
// Usage: BASE=http://localhost:4710 node qs-probe.mjs > evidence/qs-probe.json
const BASE = process.env.BASE ?? "http://localhost:4710";
const out = { base: BASE, at: new Date().toISOString(), pages: {}, withCookie: [], withoutCookie: [] };

function qsOf(res) {
  const all = res.headers.getSetCookie?.() ?? [];
  const c = all.find((x) => x.startsWith("vamos_qs="));
  return c ? { value: c.split(";")[0].slice("vamos_qs=".length), attrs: c.split(";").slice(1).map((s) => s.trim()).join("; ") } : null;
}

for (const path of ["/", "/checkout?from=Zurich%20Airport&to=Zug%20station"]) {
  const r = await fetch(BASE + path, { headers: { accept: "text/html" }, redirect: "manual" });
  const qs = qsOf(r);
  out.pages[path] = { status: r.status, vamos_qs: qs ? { signed: /^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/.test(qs.value), attrs: qs.attrs } : null, cacheControl: r.headers.get("cache-control") };
}
const r0 = await fetch(BASE + "/", { headers: { accept: "text/html" } });
const cookie = qsOf(r0)?.value;
// a second visit with the cookie gets no new one
const again = await fetch(BASE + "/", { headers: { accept: "text/html", cookie: `vamos_qs=${cookie}` } });
out.pages["/ (second visit with cookie)"] = { status: again.status, vamos_qs: qsOf(again), cacheControl: again.headers.get("cache-control") };

const body = {
  locale: "en",
  display_currency: "CHF",
  mode: "one_way",
  pickup: { kind: "coords", lng: 8.5492, lat: 47.4582, text: "Zurich Airport" },
  dropoff: { kind: "coords", lng: 8.5152, lat: 47.1737, text: "Zug station" },
  legs: [{ leg_seq: 1, scheduled_local: "2026-12-01T10:30" }],
  pax: 2,
  bags: 1,
  turnstile_token: "XXXX.DUMMY.TOKEN.XXXX",
};
async function quote(withCookie) {
  const headers = { "content-type": "application/json", origin: BASE };
  if (withCookie) headers.cookie = `vamos_qs=${cookie}`;
  const r = await fetch(BASE + "/api/quote", { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return `${r.status}:${j?.ok === true ? "priced" : j?.error ?? j?.code ?? "?"}`;
}
for (let i = 0; i < 9; i++) out.withCookie.push(await quote(true));
for (let i = 0; i < 8; i++) out.withoutCookie.push(await quote(false));
console.log(JSON.stringify(out, null, 1));
