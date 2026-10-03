// 26.5 plan 10 (owner decision D-16): an unpaid booking is never continued on another device.
// Scenarios (a)-(d) on the real Worker build (wrangler dev, port 4290) against a real local
// Supabase, with separate cookie jars standing for separate browsers.
//   MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email SB_DB_CONTAINER=supabase_db_vamos-taxi-265 \
//   SB_API_PORT=61321 SB_ANON_KEY=... SB_SERVICE_KEY=... node other-device.e2e.mjs <label>
// Local only. Prints no secrets: mail links, codes, tokens and access tokens are parsed in-process.
// Seeding is done as `postgres` through `docker exec psql` (or the native stack's psql when SB_DB_URL is set), local only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";

const LABEL = process.argv[2] ?? "run";
const PORT = Number(process.env.E2E_PORT ?? 4290);
const MAIL_ROOT = process.env.MAIL_ROOT;
const DB = process.env.SB_DB_CONTAINER ?? "supabase_db_vamos-taxi-auth";
const API = `http://127.0.0.1:${process.env.SB_API_PORT ?? "57321"}`;
const ANON = process.env.SB_ANON_KEY ?? "";
const SERVICE = process.env.SB_SERVICE_KEY ?? "";
const RUN = Date.now().toString(36);
const out = [];
const rec = (n, ok, ev) => { out.push({ n, ok, ev }); console.log(`${ok === null ? "N/A " : ok ? "PASS" : "FAIL"} | ${n} | ${ev}`); };

// Native (Docker-free) stack: SB_DB_URL set -> the stack's own psql; else `docker exec` into $DB.
const nativePsql = () => {
  if (process.env.SB_PSQL) return process.env.SB_PSQL;
  const base = path.join(os.homedir(), ".supabase/cache/stack/slim-services/postgres");
  const found = fs.readdirSync(base).flatMap((v) => fs.readdirSync(path.join(base, v)).map((p) => path.join(base, v, p, "bin/psql"))).filter((f) => fs.existsSync(f));
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
};
const psql = (extra, input) => process.env.SB_DB_URL
  ? execFileSync(nativePsql(), [process.env.SB_DB_URL, "-At", "-v", "ON_ERROR_STOP=1", ...extra], { input }).toString().trim()
  : execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", ...extra], { input }).toString().trim();
const sql = (q) => psql(["-c", q]);
const sqlFile = (text) => psql([], text);

class Jar {
  m = new Map();
  absorb(sc) { for (const c of sc) { const [nv, ...attrs] = c.split(";"); const i = nv.indexOf("="); const k = nv.slice(0, i).trim(), v = nv.slice(i + 1);
    const low = attrs.map((a) => a.trim().toLowerCase());
    const gone = low.includes("max-age=0") || low.some((a) => a.startsWith("expires=thu, 01 jan 1970")) || v === "";
    if (gone) this.m.delete(k); else this.m.set(k, v); } }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.m.keys()]; }
  has(re) { return this.names().some((n) => re.test(n)); }
  set(k, v) { this.m.set(k, v); }
}

function req(method, url, { headers = {}, body, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, `http://127.0.0.1:${PORT}`);
    const local = u.port === String(PORT);
    const h = { ...headers };
    if (local) h.host = `localhost:${PORT}`;
    if (jar && local) { const c = jar.header(); if (c) h.cookie = c; }
    let data;
    if (body !== undefined) { data = JSON.stringify(body); h["content-type"] = "application/json"; h["content-length"] = Buffer.byteLength(data); }
    const r = http.request({ host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname, port: u.port, path: u.pathname + u.search, method, headers: h }, (res) => {
      let buf = ""; res.on("data", (d) => (buf += d)); res.on("end", () => {
        const sc = res.headers["set-cookie"] ?? [];
        if (jar && local) jar.absorb(sc);
        let json; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, location: res.headers.location, setCookies: sc, json, text: buf });
      });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const ORIGIN = { origin: `http://localhost:${PORT}` };
let ipn = 40;
const newIp = () => `10.30.${Math.floor(++ipn / 250)}.${ipn % 250}`;
const auth = (body, jar) => req("POST", "/api/auth", { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body });

const files = () => { if (!fs.existsSync(MAIL_ROOT)) return []; const r = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".txt") && r.push(p); } }; walk(MAIL_ROOT); return r; };
async function newMail(seen, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const f = files().filter((x) => !seen.has(x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); if (f.length) return fs.readFileSync(f[0], "utf8"); await new Promise((r) => setTimeout(r, 250)); }
  return null;
}
const linkOf = (t) => (t.match(/https?:\/\/[^\s"<>]*(?:\/auth\/v1\/verify|\/(?:sign-in|login)\/confirm)[^\s"<>]*/) ?? [])[0]?.replace(/&amp;/g, "&");
async function follow(link, jar) {
  const cu = new URL(link);
  if (/\/(?:sign-in|login)\/confirm$/.test(cu.pathname)) { // F12: the confirm page, then its button
    const body = Object.fromEntries(["token_hash", "type", "e", "next", "nextb"].map((k) => [k, cu.searchParams.get(k)]).filter(([, v]) => v));
    await req("GET", cu.pathname + cu.search, { jar });
    await req("POST", "/api/auth/callback", { jar, headers: { origin: `http://localhost:${PORT}`, "cf-connecting-ip": "10.77.7.7" }, body });
    return;
  }
  let url = link;
  for (let i = 0; i < 6; i++) {
    const r = await req("GET", url, { jar });
    if (!r.location) break;
    url = r.location.startsWith("http") ? r.location.replace(/^https?:\/\/localhost(:\d+)?/, `http://localhost:${PORT}`) : r.location;
    if (!url.startsWith("http")) url = `http://localhost:${PORT}${url}`;
  }
}

// ---- seed ------------------------------------------------------------------------------------
const b64u = (b) => b.toString("base64url");
const tok = () => { const raw = crypto.randomBytes(32); return { raw: b64u(raw), hex: crypto.createHash("sha256").update(raw).digest("hex") }; };
const RA = tok(), RS = tok(), RQ = tok();
const EMAIL = `e2e-od-${RUN}@example.com`;
const P_NAME = "Pat Otherdevice", P_PHONE = "+41795550101", P_COMPANY = "Otherdevice Holding AG", P_NOTE = "gate-code-4711", P_COUPON = `ODCPN${RUN.toUpperCase()}`;
const XQ = crypto.randomUUID(), SQ = crypto.randomUUID(), QQ = crypto.randomUUID();
const TRIP = "from=Zurich%20Airport&to=Zurich%20HB&when=2099-09-06T10%3A00&pax=1&bags=0";

const created = await req("POST", `${API}/auth/v1/admin/users`, {
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` }, body: { email: EMAIL, email_confirm: true },
});
if (created.status >= 300) { console.log(`seed: admin user create failed ${created.status}`); process.exit(2); }

sqlFile(`
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('od-${RUN}', 3, 3);
insert into public.coupons (code, kind, percent) values ('${P_COUPON}', 'percent', 1);
insert into public.rate_versions (slug, label) values ('od-rv-${RUN}', 'other-device e2e fixture');
insert into public.settings_versions (slug, label) values ('od-pol-${RUN}', 'other-device e2e fixture');

-- P: pending, no pay link, all contact data; S: pending, staff pay link sent; Q: paid.
insert into public.bookings (contact_name, contact_email, contact_phone, company_name, company_address, company_vat, note, quote_id, status, checkout_trip_query, pay_link_sent_at) values
 ('${P_NAME}', '${EMAIL}', '${P_PHONE}', '${P_COMPANY}', 'Bahnhofstr 1', 'CHE-1', '${P_NOTE}', '${XQ}', 'pending', '${TRIP}', null),
 ('Sam Staffpay', '${EMAIL}', '+41795550102', '', '', '', '', '${SQ}', 'pending', '${TRIP}', now()),
 ('Quinn Paid', '${EMAIL}', '+41795550103', '', '', '', '', '${QQ}', 'paid', '${TRIP}', null);

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'Zurich Airport', 'Zurich HB', now() + interval '30 days', to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc where b.contact_email = '${EMAIL}' and vc.slug = 'od-${RUN}';

insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code)
select b.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@od', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":1000}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60, 'city_waiting_minutes', 15, 'settings_version_id', 1, 'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '2 hours', now() + interval '2 hours', 1000, 0, 0, 1000, (case when b.quote_id = '${XQ}' then (select id from public.coupons where code = '${P_COUPON}') end), (case when b.quote_id = '${XQ}' then '${P_COUPON}' end)
  from public.bookings b, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where b.contact_email = '${EMAIL}' and vc.slug = 'od-${RUN}' and rv.slug = 'od-rv-${RUN}' and sv.slug = 'od-pol-${RUN}';

update public.bookings b set price_snapshot_id = s.id, price_total_rappen = 1000 from public.price_snapshots s where s.booking_id = b.id and b.contact_email = '${EMAIL}';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
select b.id, decode('${RA.hex}', 'hex'), now() + interval '1 day', 'manage' from public.bookings b where b.quote_id = '${XQ}';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
select b.id, decode('${RS.hex}', 'hex'), now() + interval '1 day', 'pay' from public.bookings b where b.quote_id = '${SQ}';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
select b.id, decode('${RQ.hex}', 'hex'), now() + interval '1 day', 'manage' from public.bookings b where b.quote_id = '${QQ}';
`);
const refOf = (q) => sql(`select reference from public.bookings where quote_id = '${q}'`);
const P_REF = refOf(XQ), S_REF = refOf(SQ), Q_REF = refOf(QQ);
const P_BOOKING_ID = sql(`select id from public.bookings where quote_id = '${XQ}'`);
const P_STRINGS = [P_NAME, EMAIL, P_PHONE.replace(/^\+/, ""), P_COMPANY, P_NOTE, P_COUPON, P_REF, P_BOOKING_ID];
const leaks = (text) => P_STRINGS.filter((s) => text.includes(s) || text.includes(encodeURIComponent(s)));

// ---- (a) second browser, pasted link ----------------------------------------------------------
const jarA = new Jar(); jarA.set("vt_manage", RA.raw);
let r = await req("GET", `/api/checkout/resume?quote=${XQ}`, { jar: jarA });
rec("A0 same device with vt_manage: resume returns the booking", (r.json?.state === "expired" || r.json?.state === "open") && r.json?.contact?.email === EMAIL, `status ${r.status} state=${r.json?.state} contact.email matches=${r.json?.contact?.email === EMAIL}`);

const jarB = new Jar();
r = await req("GET", `/api/checkout/resume?quote=${XQ}`, { jar: jarB });
rec("a1 second browser: resume answers exactly none", r.status === 200 && r.text === JSON.stringify({ state: "none" }), `status ${r.status} body=${r.text.slice(0, 60)}`);

const pasted = `/checkout?${TRIP}&resume=${XQ}&pay=1`;
r = await req("GET", pasted, { jar: jarB });
let hops = [r.status];
for (let i = 0; i < 3 && r.location; i++) { r = await req("GET", r.location.startsWith("http") ? r.location.replace(/^https?:\/\/[^/]+/, "") : r.location, { jar: jarB }); hops.push(r.status); }
rec("a2 second browser: pasted checkout link shows no contact data of the first", r.status === 200 && leaks(r.text).length === 0, `hops=${hops.join(">")} leaked=${leaks(r.text).length}`);

r = await req("POST", "/api/checkout/intent", { jar: jarB, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body: {
  quote_id: XQ, lock: "v1.forged.forged", vehicle_class: "economy", extra_codes: [], coupon: null,
  contact: { name: "Other Person", email: `other-${RUN}@example.com`, phone: "+41790000000" }, locale: "en", display_currency: "CHF",
  company_name: "", driver_note: "", supersedes: P_BOOKING_ID, idempotency_key: `od-${RUN}`,
  trip: { from: "Zurich Airport", to: "Zurich HB", when: "2099-09-06T10:00", pax: 1, bags: 0 } } });
const pStatus = sql(`select status from public.bookings where quote_id = '${XQ}'`);
rec("a3 second browser: intent with a forged lock (and supersedes) is refused, first booking untouched", r.status >= 400 && r.status < 500 && r.json?.code !== "invalid_request" && leaks(r.text).length === 0 && !/https:\/\/checkout\.stripe/.test(r.text) && pStatus === "pending", `status ${r.status} code=${r.json?.code} leaked=${leaks(r.text).length} first booking status=${pStatus}`);

// ---- (b) second browser signs in as the same customer ----------------------------------------
let seen = new Set(files());
await auth({ mode: "signin", method: "magic", email: EMAIL }, jarB);
const mail = await newMail(seen); const link = mail && linkOf(mail);
if (link) await follow(link, jarB);
const sess = await req("GET", "/api/auth/session", { jar: jarB });
sql(`update public.customers set full_name = 'Pat Profile', phone = '+41795550199' where email = '${EMAIL}' or user_id in (select id from auth.users where email = '${EMAIL}')`);
r = await req("GET", "/api/checkout/me", { jar: jarB });
const keys = Object.keys(r.json ?? {});
const okKeys = keys.every((k) => ["signed_in", "email", "first_name", "last_name", "phone"].includes(k));
rec("b1 second browser signed in: /api/checkout/me is profile only", sess.json?.signedIn === true && r.json?.signed_in === true && okKeys && leaks(r.text.replace(EMAIL, "")).length === 0 && ![P_REF, P_COMPANY, P_NOTE, P_COUPON].some((s) => r.text.includes(s)), `signedIn=${sess.json?.signedIn} keys=${keys.join(",")} leaked(non-email)=${leaks(r.text.replace(EMAIL, "")).length}`);

r = await req("GET", `/api/checkout/resume?quote=${XQ}`, { jar: jarB });
rec("b2 signed in: resume still answers exactly none", r.text === JSON.stringify({ state: "none" }), `status ${r.status} body=${r.text.slice(0, 60)}`);

r = await req("GET", "/api/account/bookings", { jar: jarB });
const linked = sql(`select customer_id is not null from public.bookings where quote_id = '${XQ}'`);
rec("b3 signed in: account list hides the pending row (also after linking), shows the pay-link row", r.status === 200 && !r.text.includes(P_REF) && r.text.includes(S_REF), `status ${r.status} P listed=${r.text.includes(P_REF)} S listed=${r.text.includes(S_REF)} Q listed=${r.text.includes(Q_REF)}; P customer_id set after list=${linked}`);

r = await req("GET", `/api/account/bookings/details?ref=${encodeURIComponent(P_REF)}`, { jar: jarB });
rec("b4 signed in: account details of the pending reference is 404", r.status === 404 && leaks(r.text).length === 0, `status ${r.status}`);

// b5: Data API with B's own access token (parsed in-process, never printed)
let access = "";
try {
  const chunks = [...jarB.m].filter(([k]) => /^sb-.*-auth-token(\.\d+)?$/.test(k)).sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([, v]) => decodeURIComponent(v));
  let joined = chunks.join("");
  if (joined.startsWith("base64-")) joined = Buffer.from(joined.slice(7), "base64url").toString("utf8");
  access = JSON.parse(joined).access_token ?? "";
} catch { access = ""; }
if (!access) rec("b5 Data API as the customer: unpaid row absent", false, "could not read the session access token from the cookie");
else {
  r = await req("GET", `${API}/rest/v1/bookings?select=reference,status`, { headers: { apikey: ANON, authorization: `Bearer ${access}` } });
  const refs = Array.isArray(r.json) ? r.json.map((x) => x.reference) : [];
  rec("b5 Data API as the customer: unpaid row absent, pay-link and paid rows present (G1)", r.status === 200 && !refs.includes(P_REF) && refs.includes(S_REF) && refs.includes(Q_REF), `status ${r.status} P present=${refs.includes(P_REF)} S present=${refs.includes(S_REF)} Q present=${refs.includes(Q_REF)} rows=${refs.length}`);
}

// ---- (c) paid booking opens anywhere ------------------------------------------------------------
const jarC = new Jar();
r = await req("GET", `/api/manage/booking?token=${RQ.raw}`, { jar: jarC });
rec("c1 fresh browser: paid booking opens from its manage link and sets vt_manage", r.status === 200 && r.json?.ok !== false && r.text.includes(Q_REF) && jarC.has(/^vt_manage$/), `status ${r.status} reference present=${r.text.includes(Q_REF)} vt_manage set=${jarC.has(/^vt_manage$/)}`);
r = await req("GET", `/api/checkout/resume?quote=${QQ}`, { jar: jarC });
rec("c2 same browser: resume of the paid quote answers paid with the reference", r.json?.state === "paid" && r.json?.reference === Q_REF, `status ${r.status} state=${r.json?.state} reference matches=${r.json?.reference === Q_REF}`);
const jarC2 = new Jar();
r = await req("GET", `/api/manage/booking?token=${RA.raw}`, { jar: jarC2 });
rec("c3 fresh browser: an unpaid booking's manage token answers 404 and sets no vt_manage", r.status === 404 && !jarC2.has(/^vt_manage$/) && leaks(r.text).length === 0, `status ${r.status} vt_manage set=${jarC2.has(/^vt_manage$/)}`);

// ---- (d) staff pay link on a device with no cookie ------------------------------------------------
const jarD = new Jar();
r = await req("GET", `/checkout/pay/${RS.raw}`, { jar: jarD });
let dh = [r.status];
for (let i = 0; i < 3 && r.location; i++) { r = await req("GET", r.location.startsWith("http") ? r.location.replace(/^https?:\/\/[^/]+/, "") : r.location, { jar: jarD }); dh.push(r.status); }
rec("d1 fresh browser: staff pay-link page opens", r.status === 200, `hops=${dh.join(">")}`);
r = await req("POST", "/api/checkout/pay-link/open", { jar: jarD, headers: ORIGIN, body: { token: RS.raw } });
// Without a Stripe test key in the local Worker the accepted link stops at the Stripe step
// ("STRIPE_SECRET_KEY is not bound" in the Worker log). An unknown token is refused earlier, so the
// two answers differ: that difference is the proof that the link itself was accepted with no cookie.
const publicLog = path.join(path.dirname(MAIL_ROOT), "..", "e2e-public.log");
const readLog = () => (fs.existsSync(publicLog) ? fs.readFileSync(publicLog, "utf8") : "");
let logText = readLog();
for (let i = 0; i < 12 && !logText.includes("STRIPE_SECRET_KEY is not bound"); i++) { await new Promise((x) => setTimeout(x, 500)); logText = readLog(); }
const unknown = await req("POST", "/api/checkout/pay-link/open", { jar: new Jar(), headers: ORIGIN, body: { token: b64u(crypto.randomBytes(32)) } });
const stoppedAtStripe = r.status === 500 && logText.includes("STRIPE_SECRET_KEY is not bound");
if (r.status === 200 && r.json?.ok === true && /^https?:\/\//.test(r.json?.url ?? "")) rec("d2 fresh browser: pay-link open returns a Stripe URL", true, `status 200 hosted url present, reference matches=${r.json?.reference === S_REF}`);
else if (stoppedAtStripe && unknown.status !== 500) rec("d2 fresh browser: pay-link open accepts the staff link with no cookie", null, `N/A for the Stripe leg (no Stripe test key in the local Worker): valid token status 500 = "STRIPE_SECRET_KEY is not bound" in the Worker log, after the link lookups; unknown token status ${unknown.status} code=${unknown.json?.code ?? unknown.json?.state ?? "none"}`);
else rec("d2 fresh browser: pay-link open", false, `status ${r.status} code=${r.json?.code ?? r.json?.state}; unknown token status ${unknown.status}; stopped at Stripe=${stoppedAtStripe}`);

fs.writeFileSync(process.env.OUT ?? "/dev/null", JSON.stringify({ label: LABEL, out }, null, 1));
process.exit(out.some((x) => x.ok === false) ? 1 : 0);
