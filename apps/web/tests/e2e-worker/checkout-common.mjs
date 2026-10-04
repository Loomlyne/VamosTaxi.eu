// Shared helpers of the 26.5 Worker e2e files (checkout-account.e2e.mjs, checkout-german.e2e.mjs).
// Local only: the isolated Supabase stack, the local Worker, the stand-in servers of fakes.mjs.
// Nothing here prints a secret. Mail links, codes and tokens are parsed in-process.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { canonicalJson, signHmac, base64urlEncode } from "../../lib/crypto/hmac.ts";

export const PORT = Number(process.env.E2E_PORT ?? 4290);
export const FAKE_PORT = Number(process.env.E2E_FAKE_PORT ?? 4297);
export const MAIL_ROOT = process.env.MAIL_ROOT;
export const DB = process.env.SB_DB_CONTAINER ?? "supabase_db_vamos-taxi-auth";
export const API = `http://127.0.0.1:${process.env.SB_API_PORT ?? "57321"}`;
export const ANON = process.env.SB_ANON_KEY ?? "";
export const SERVICE = process.env.SB_SERVICE_KEY ?? "";
export const RUN = Date.now().toString(36);
// Same value as mkcfg.mjs phase2 writes to the local Worker. A stand-in, not a real secret.
export const LOCK_SECRET = "e2e-local-lock-secret-0123456789abcdef";
export const ORIGIN = { origin: `http://localhost:${PORT}` };

export const out = [];
export const rec = (n, ok, ev) => {
  out.push({ n, ok, ev });
  console.log(`${ok === null ? "N/A " : ok ? "PASS" : "FAIL"} | ${n} | ${ev}`);
};
export const finish = (file) => {
  fs.writeFileSync(file ?? "/dev/null", JSON.stringify({ out }, null, 1));
  process.exit(out.some((x) => x.ok === false) ? 1 : 0);
};

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
export const sql = (q) => psql(["-c", q]);
export const sqlFile = (text) => psql([], text);

export class Jar {
  m = new Map();
  absorb(sc) {
    for (const c of sc) {
      const [nv, ...attrs] = c.split(";");
      const i = nv.indexOf("=");
      const k = nv.slice(0, i).trim(), v = nv.slice(i + 1);
      const low = attrs.map((a) => a.trim().toLowerCase());
      const gone = low.includes("max-age=0") || low.some((a) => a.startsWith("expires=thu, 01 jan 1970")) || v === "";
      if (gone) this.m.delete(k); else this.m.set(k, v);
    }
  }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.m.keys()]; }
  has(re) { return this.names().some((n) => re.test(n)); }
  set(k, v) { this.m.set(k, v); }
}

export function req(method, url, { headers = {}, body, jar, raw } = {}) {
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
        resolve({ status: res.statusCode, location: res.headers.location, setCookies: sc, json, text: buf, ms: 0, headers: res.headers });
      });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

// The local rate limiter keeps its counters in .wrangler/e2e between runs and windows are aligned to the wall-clock
// minute, so every run starts from its own random block of addresses.
let ipn = 100 + Math.floor(Math.random() * 100) * 250;
export const newIp = () => `10.${40 + Math.floor(ipn / 62500) % 200}.${Math.floor(++ipn / 250) % 250}.${ipn % 250}`;
export const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/** Miniflare's rate limiter counts in fixed windows aligned to the wall clock (epoch = floor(now / period)). A burst that
 *  crosses a minute boundary starts a new count, so a burst test first waits for a window with `needMs` left. */
export async function freshWindow(needMs = 20000, periodMs = 60000) {
  const left = periodMs - (Date.now() % periodMs);
  if (left < needMs) await nap(left + 300);
}

export async function timed(fn) { const t = Date.now(); const r = await fn(); r.ms = Date.now() - t; return r; }

// ---- mail (the Send Email Hook writes to the local mail capture) ----
export const files = () => {
  if (!fs.existsSync(MAIL_ROOT)) return [];
  const r = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".txt") && r.push(p); } };
  walk(MAIL_ROOT);
  return r;
};
export const before = () => new Set(files());
export async function newMail(seen, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = files().filter((x) => !seen.has(x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (f.length) return fs.readFileSync(f[0], "utf8");
    await nap(250);
  }
  return null;
}
export const mailCount = (seen) => files().filter((x) => !seen.has(x)).length;
// The mail text is quoted-printable-free in the local capture; a link is either the Supabase verify URL or the app callback.
export const linkOf = (t) => (t.match(/https?:\/\/[^\s"<>]*(?:\/auth\/v1\/verify|\/(?:sign-in|login)\/confirm)[^\s"<>]*/) ?? [])[0]?.replace(/&amp;/g, "&");
export const codeOf = (t) => (t.match(/\b(\d{6})\b/) ?? [])[1];
export const subjectOf = (t) => (t.match(/^subject:\s*(.+)$/im) ?? [])[1]?.trim() ?? "";
export const linkType = (link) => { try { return new URL(link).searchParams.get("type"); } catch { return null; } };

/** F12: seal an address into a link exactly as lib/auth/sealed-address.ts does (HKDF from the hook secret, AES-GCM, token_hash as AAD). */
export async function sealE(email, tokenHash, secret = fs.readFileSync(process.env.E2E_HOOK_SECRET_FILE, "utf8").trim()) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("vamos-f12-sealed-address-v1") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(tokenHash) }, key, enc.encode(email.trim().toLowerCase())));
  return Buffer.from([...iv, ...ct]).toString("base64url");
}

/** F12: the confirm page is opened (GET spends nothing) and its button is pressed (POST /api/auth/callback). */
export async function pressConfirm(link, jar) {
  const cu = new URL(link);
  const page = await req("GET", `http://localhost:${PORT}${cu.pathname}${cu.search}`, { jar });
  const body = Object.fromEntries(["token_hash", "type", "e", "next", "nextb"].map((k) => [k, cu.searchParams.get(k)]).filter(([, v]) => v));
  const post = await req("POST", `http://localhost:${PORT}/api/auth/callback`, { jar, headers: { ...ORIGIN, "cf-connecting-ip": newIp() }, body });
  return { page, post };
}

/** Follow a mail link (Supabase verify -> 303 -> app callback -> 302 ..., or the F12 confirm page + button). Returns hops and the final path+query. */
export async function follow(link, jar) {
  if (/\/(?:sign-in|login)\/confirm$/.test(new URL(link).pathname)) {
    const { page, post } = await pressConfirm(link, jar);
    return { hops: [`GET ${page.status}`, `POST ${post.status}`], finalPath: post.json?.target ?? "", last: post };
  }
  const hops = []; let url = link; let last = null;
  for (let i = 0; i < 8; i++) {
    const r = await req("GET", url, { jar });
    hops.push(r.status); last = r;
    if (!r.location) break;
    url = r.location.startsWith("http") ? r.location.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, (m, h, p) => (p && Number(p.slice(1)) !== PORT && h === "127.0.0.1" ? m : `http://localhost:${PORT}`)) : `http://localhost:${PORT}${r.location}`;
  }
  const finalUrl = new URL(url);
  return { hops, finalPath: finalUrl.pathname + finalUrl.search, last };
}

// ---- admin API of the local stack ----
export const admin = (method, p, body) =>
  req(method, `${API}${p}`, { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` }, body });
export async function createAuthUser(email, meta = {}, confirmed = true) {
  const r = await admin("POST", "/auth/v1/admin/users", { email, email_confirm: confirmed, user_metadata: meta });
  if (r.status >= 300) throw new Error(`admin createUser ${r.status}`);
  return r.json.id ?? r.json.user?.id;
}
export const authUserCount = (email) => Number(sql(`select count(*) from auth.users where email='${email}'`));
export const confirmedAt = (email) => sql(`select coalesce(email_confirmed_at::text,'') from auth.users where email='${email}'`);

// ---- the fixture the real checkout routes need (rate book, settings, flags) ----
export const CLASS_SLUG = "e2e265";
export function ensureFixture({ guestSwitch }) {
  sqlFile(`
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('${CLASS_SLUG}', 3, 3) on conflict (slug) do nothing;
insert into public.rate_versions (slug, label) values ('e2e265-rv', 'e2e fixture') on conflict do nothing;
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
 select rv.id, vc.id, 3, 1, 2, 3 from public.rate_versions rv, public.vehicle_classes vc where rv.slug='e2e265-rv' and vc.slug='${CLASS_SLUG}'
 and not exists (select 1 from public.distance_rates d where d.rate_version_id=rv.id);
update public.rate_versions set status='live' where slug='e2e265-rv' and status <> 'live';
insert into public.settings_versions (slug,label,free_cancel_hours,modification_deadline_hours,min_advance_minutes,airport_waiting_minutes,city_waiting_minutes,manage_link_validity_days,quote_lock_minutes,checkout_window_minutes,cancellation_tiers,policy_doc_slug)
 select 'e2e265-pol-${RUN}','e2e fixture',24,24,180,60,15,30,1440,1440,cancellation_tiers,policy_doc_slug from public.settings_versions where slug='launch-baseline';
update public.settings set public_chf = true where id = 1;
`);
  setGuestSwitch(guestSwitch);
}
export const setGuestSwitch = (on) => sql(`update public.settings set guest_accounts_live = ${on ? "true" : "false"} where id = 1`);

/** A signed lock for one quote, minted the way the quote route does (same canonical JSON and HMAC). */
export async function mintQuote({ pax = 1, bags = 0, totalRappen = 600 } = {}) {
  const rv = Number(sql("select id from rate_versions where slug='e2e265-rv'"));
  const sv = Number(sql("select id from settings_versions order by effective_from desc, id desc limit 1"));
  const now = new Date();
  const day = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const when = `${day}T10:00`;
  const quoteId = crypto.randomUUID();
  const payload = {
    v: 1, quote_id: quoteId, exp: new Date(now.getTime() + 45 * 60000).toISOString(), engine_version: "quote-engine@e2e265",
    rate_version_id: rv, settings_version_id: sv, computed_at: now.toISOString(), display_currency: "CHF", mode: "one_way", pax, bags,
    extras: null, coupon: null, class_totals: [{ slug: CLASS_SLUG, total_rappen: totalRappen }],
    legs: [{ leg_seq: 1, pickup: { lng: 8.549167, lat: 47.458056, text: "ZRH Airport" }, dropoff: { lng: 8.540192, lat: 47.378177, text: "Zurich HB" },
      scheduled_local: when, distance_m: 12500, duration_s: 1500, origin_zone_id: null, dest_zone_id: null, waypoints: [], flight_no: null, landing_source: null }],
  };
  const b = base64urlEncode(new TextEncoder().encode(canonicalJson(payload)));
  const lock = `v1.${b}.${await signHmac(LOCK_SECRET, b)}`;
  return { quoteId, lock, when, payload };
}

/** The PAY body the checkout page sends (contact, trip, optional account block). */
export function intentBody(q, { email, locale = "en", account, name = "Gus Guest", idem } = {}) {
  return {
    quote_id: q.quoteId, lock: q.lock, vehicle_class: CLASS_SLUG, extra_codes: [],
    contact: { name, email, phone: "+41790000000" }, locale, display_currency: "CHF", company_name: "", driver_note: "",
    trip: { from: "ZRH Airport", fid: "mbx-a", to: "Zurich HB", tid: "mbx-b", when: q.when, pax: 1, bags: 0 },
    ...(account ? { account } : {}),
    idempotency_key: idem ?? `idem-${crypto.randomUUID()}`,
  };
}
export const payReq = (body, { jar, ip } = {}) =>
  req("POST", "/api/checkout/intent", { jar, headers: { ...ORIGIN, "cf-connecting-ip": ip ?? newIp() }, body });

export const agreementRows = (email) =>
  sql(`select coalesce(json_agg(json_build_object('surface',a.surface,'choice',a.choice,'kind',a.record_kind,'version',a.text_version,'locale',a.locale,'email',a.email,'booking',a.booking_id is not null)),'[]') from public.account_agreement_records a where lower(a.email)=lower('${email}')`);
export const consentLogCount = () => Number(sql("select count(*) from public.consent_log"));
export const sessionCookie = (setCookies) => setCookies.some((c) => /^sb-[^=]*-auth-token(\.\d+)?=/.test(c) && !/max-age=0/i.test(c));
