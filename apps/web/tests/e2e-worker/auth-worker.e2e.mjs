// Auth end-to-end against a real local Worker (wrangler dev) + real local Supabase.
// Usage: MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email SB_DB_CONTAINER=supabase_db_vamos-taxi-auth \
//        node auth-worker.e2e.mjs <label>
// Prints no secrets: mail links/codes are parsed in-process only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LABEL = process.argv[2] ?? "run";
const PORT = 4290;
const DASH_PORT = Number(process.env.DASH_PORT ?? 4291); // second instance of the same build with VAMOS_SURFACE=auto, so Host dashboard.localhost is honoured
const MAIL_ROOT = process.env.MAIL_ROOT;
const DB = process.env.SB_DB_CONTAINER ?? "supabase_db_vamos-taxi-auth";
const RUN = Date.now().toString(36);
const PW1 = "E2e-First-pass-1", PW2 = "E2e-Second-pass-2";
const out = [];
const seenCookies = [];
const rec = (n, ok, ev) => { out.push({ n, ok, ev }); console.log(`${ok === null ? "N/A " : ok ? "PASS" : "FAIL"} | ${n} | ${ev}`); };

const sql = (q) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", q]).toString().trim();

function req(method, url, { host = `localhost:${PORT}`, headers = {}, body, jar } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, `http://127.0.0.1:${host && host.startsWith('dashboard.') ? DASH_PORT : PORT}`);
    const external = u.hostname !== "localhost" && !(u.hostname === "127.0.0.1" && [String(PORT), String(DASH_PORT)].includes(u.port)) ? true : false;
    const h = { ...headers };
    if (!external) h.host = host;
    if (jar && !external) { const c = jar.header(); if (c) h.cookie = c; }
    let data;
    if (body !== undefined) { data = JSON.stringify(body); h["content-type"] = "application/json"; h["content-length"] = Buffer.byteLength(data); }
    const r = http.request({ host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname, port: u.port, path: u.pathname + u.search, method, headers: h }, (res) => {
      let buf = ""; res.on("data", (d) => (buf += d)); res.on("end", () => {
        const sc = res.headers["set-cookie"] ?? [];
        if (jar && !external) jar.absorb(sc);
        for (const c of sc) seenCookies.push(c);
        let json; try { json = JSON.parse(buf); } catch {}
        resolve({ status: res.statusCode, location: res.headers.location, setCookies: sc, json, text: buf });
      });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
class Jar {
  m = new Map();
  absorb(sc) { for (const c of sc) { const [nv, ...attrs] = c.split(";"); const i = nv.indexOf("="); const k = nv.slice(0, i).trim(), v = nv.slice(i + 1);
    const low = attrs.map((a) => a.trim().toLowerCase());
    const gone = low.includes("max-age=0") || low.some((a) => a.startsWith("expires=thu, 01 jan 1970")) || v === "";
    if (gone) this.m.delete(k); else this.m.set(k, v); } }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.m.keys()]; }
  has(re) { return this.names().some((n) => re.test(n)); }
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms)); // local GoTrue mails one address at most once per SMTP max_frequency (1s)
let ipn = 10;
const newIp = () => `10.20.${Math.floor(++ipn / 250)}.${ipn % 250}`;
const auth = (body, jar, opts = {}) => req("POST", "/api/auth", { jar, host: opts.host, headers: { origin: `http://${opts.host ?? "localhost:" + PORT}`, "cf-connecting-ip": opts.ip ?? "10.9.9.9" }, body });
const session = async (jar, host) => (await req("GET", "/api/auth/session", { jar, host })).json;

const files = () => { if (!fs.existsSync(MAIL_ROOT)) return []; const r = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".txt") && r.push(p); } }; walk(MAIL_ROOT); return r; };
const before = () => new Set(files());
async function newMail(seen, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const f = files().filter((x) => !seen.has(x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); if (f.length) return fs.readFileSync(f[0], "utf8"); await new Promise((r) => setTimeout(r, 250)); }
  return null;
}
const linkOf = (t) => (t.match(/https?:\/\/[^\s"<>]*\/auth\/v1\/verify[^\s"<>]*/) ?? [])[0]?.replace(/&amp;/g, "&");
const codeOf = (t) => (t.match(/\b(\d{6})\b/) ?? [])[1];

// follow a mail link: Supabase verify -> 303 -> app callback -> 302 ...
async function follow(link, jar, host) {
  const hops = []; let url = link;
  for (let i = 0; i < 6; i++) {
    const r = await req("GET", url, { jar, host });
    hops.push(r.status); if (!r.location) break;
    url = r.location.startsWith("http") ? r.location.replace(/^https?:\/\/localhost(:\d+)?/, `http://localhost:${PORT}`) : r.location;
    if (/^https?:\/\/127\.0\.0\.1:57321/.test(url) === false && !url.startsWith("http")) url = `http://localhost:${PORT}${url}`;
  }
  return { hops, final: url.replace(/[?#].*/, "") };
}

const users = (e) => Number(sql(`select count(*) from auth.users where email='${e}'`));

const A = `e2e-a-${RUN}@example.com`, B = `e2e-b-${RUN}@example.com`, D = `e2e-d-${RUN}@example.com`, U = `e2e-unknown-${RUN}@example.com`, U2 = `e2e-unknown2-${RUN}@example.com`;
const jarA = new Jar();

// 1 sign up
let seen = before();
let r = await auth({ mode: "signup", method: "password", email: A, password: PW1, firstName: "E", lastName: "Two" }, jarA, { ip: newIp() });
const su = `status ${r.status} stage=${r.json?.stage ?? JSON.stringify(r.json)?.slice(0, 60)}`;
let mail = await newMail(seen);
const rowsAfter = users(A);
const hasVerifier = jarA.has(/code-verifier/);
let link = mail && linkOf(mail);
rec("1a signup: response + mail + auth.users row", !!mail && rowsAfter === 1, `${su}; mail=${!!mail}; auth.users=${rowsAfter}; code-verifier cookie=${hasVerifier}`);
if (link) {
  const f = await follow(link, jarA);
  const s = await session(jarA);
  const cust = sql(`select count(*) from public.customers c join auth.users u on u.id=c.user_id where u.email='${A}'`);
  const cons = sql(`select count(*) from public.consent_log l join public.customers c on c.id=l.customer_id join auth.users u on u.id=c.user_id where u.email='${A}'`);
  rec("1b confirm link -> callback -> session/customer, no consent row (27 D-01)", f.hops.join(">").includes("302") && s?.signedIn === true && cust === "1" && Number(cons) === 0,
    `hops=${f.hops.join(">")} final=${f.final} sb-auth-token cookie=${jarA.has(/^sb-.*-auth-token/)}; session.signedIn=${s?.signedIn}; customers=${cust}; consent_log=${cons}`);
} else rec("1b confirm link", false, "no mail/link");

// 2 password sign-in / sign out
const jar2 = new Jar();
r = await auth({ mode: "signin", method: "password", email: A, password: PW1 }, jar2, { ip: newIp() });
let s = await session(jar2);
const in2 = r.status === 200 && s?.signedIn === true;
r = await auth({ action: "signout" }, jar2, { ip: newIp() });
s = await session(jar2);
rec("2 password sign-in then sign-out", in2 && s?.signedIn === false, `signin->signedIn=${in2}; after signout status ${r.status} signedIn=${s?.signedIn}; token cookie left=${jar2.has(/^sb-.*-auth-token/)}`);

// 3 magic link
const jar3 = new Jar(); seen = before();
r = await auth({ mode: "signin", method: "magic", email: A }, jar3, { ip: newIp() });
mail = await newMail(seen); link = mail && linkOf(mail);
const mailCode = mail && codeOf(mail);
if (link) { const f = await follow(link, jar3); s = await session(jar3);
  rec("3 magic link", s?.signedIn === true, `request ${r.status}; hops=${f.hops.join(">")} final=${f.final}; verifier=${jar3.has(/code-verifier/)}; signedIn=${s?.signedIn}`);
} else rec("3 magic link", false, `request ${r.status}; no mail`);

// 4 e-mail code (fresh request, code from mail)
await nap(1500); const jar4 = new Jar(); seen = before();
r = await auth({ mode: "signin", method: "magic", email: A }, jar4, { ip: newIp() });
mail = await newMail(seen); const code = mail && codeOf(mail);
if (code) { r = await auth({ mode: "verify-code", email: A, code }, jar4, { ip: newIp() }); s = await session(jar4);
  rec("4 e-mail code", r.status === 200 && s?.signedIn === true, `verify-code status ${r.status} body=${JSON.stringify(r.json)}; signedIn=${s?.signedIn}`);
} else rec("4 e-mail code", false, "no code in mail");

// 5 reset
await nap(1500); const jar5 = new Jar(); seen = before();
r = await auth({ mode: "forgot", email: A }, jar5, { ip: newIp() });
mail = await newMail(seen); link = mail && linkOf(mail);
if (link) { const f = await follow(link, jar5); s = await session(jar5);
  const up = await auth({ action: "update-password", password: PW2 }, jar5, { ip: newIp() });
  await auth({ action: "signout" }, jar5, { ip: newIp() });
  const jarN = new Jar(); await auth({ mode: "signin", method: "password", email: A, password: PW2 }, jarN, { ip: newIp() });
  const sN = await session(jarN);
  const old = new Jar(); const ro = await auth({ mode: "signin", method: "password", email: A, password: PW1 }, old, { ip: newIp() });
  rec("5 reset flow", s?.signedIn === true && sN?.signedIn === true, `forgot ${r.status}; hops=${f.hops.join(">")} final=${f.final}; signedIn=${s?.signedIn}; update-password ${up.status} ${JSON.stringify(up.json)}; new pw signIn=${sN?.signedIn}; old pw signedIn=${(await session(old))?.signedIn}`);
} else rec("5 reset flow", false, `forgot ${r.status}; no mail`);

// 6 unconfirmed
seen = before(); const jar6 = new Jar();
await auth({ mode: "signup", method: "password", email: B, password: PW1, firstName: "B", lastName: "Two" }, jar6, { ip: newIp() });
await newMail(seen);
r = await auth({ mode: "signin", method: "password", email: B, password: PW1 }, new Jar(), { ip: newIp() });
const nc = `status ${r.status} ${JSON.stringify(r.json)}`;
await nap(1500); seen = before();
const rs = await auth({ mode: "resend-confirmation", email: B }, jar6, { ip: newIp() });
const m2 = await newMail(seen);
rec("6 unconfirmed sign-in + resend", r.json?.reason === "email-not-confirmed" && !!m2, `signin ${nc}; resend ${rs.status} ${JSON.stringify(rs.json)}; new mail=${!!m2}`);

// 8 dashboard host
const DH = `dashboard.localhost:${DASH_PORT}`;
const jar8 = new Jar();
r = await auth({ mode: "signin", method: "password", email: A, password: PW2 }, jar8, { host: DH, ip: newIp() });
s = await session(jar8, DH);
const r8a = `customer pw signin on dashboard: ${r.status} ${JSON.stringify(r.json)}; token cookie left=${jar8.has(/^sb-.*-auth-token/)}; signedIn=${s?.signedIn}`;
r = await auth({ mode: "signin", method: "magic", email: U }, new Jar(), { host: DH, ip: newIp() });
const m8 = `magic unknown on dashboard: ${r.status}, auth.users=${users(U)}`;
r = await auth({ mode: "signup", method: "password", email: U2, password: PW1, firstName: "U", lastName: "Two" }, new Jar(), { host: DH, ip: newIp() });
const s8 = `pw signup on dashboard: ${r.status}, auth.users=${users(U2)}`;
rec("8 dashboard host", r.status && users(U) === 0 && users(U2) === 0 && r8a.includes("403") && !jar8.has(/^sb-.*-auth-token/), `${r8a}; ${m8}; ${s8}`);

// 7 rate limit (last: same ip bucket)
const ip7 = newIp(); const codes = [];
for (let i = 0; i < 11; i++) { const x = await auth({ mode: "signin", method: "password", email: A, password: "wrong-pass-" + i }, new Jar(), { ip: ip7 }); codes.push(x.status); }
rec("7 rate limit (11 wrong tries, same IP)", codes.at(-1) === 429, `statuses=${codes.join(",")}`);

// 9 cookie attributes
const attrs = new Map();
for (const c of seenCookies) { const parts = c.split(";").map((x) => x.trim()); const name = parts[0].split("=")[0].replace(/\.\d+$/, ".N");
  const flags = parts.slice(1).map((x) => x.replace(/=.*/, (m) => (/^(path|samesite)=/i.test(x) ? m : "=…")).toLowerCase()).sort().join(" ");
  attrs.set(`${name} | ${flags}`, (attrs.get(`${name} | ${flags}`) ?? 0) + 1); }
// vt_reauth is the staff re-auth cookie (cleared on sign-out), not a Supabase cookie: Strict + Secure by design.
const bad = [...attrs.keys()].filter((k) => !k.startsWith("vt_reauth") && (/domain=/.test(k) || !/path=\//.test(k) || !/samesite=lax/.test(k)));
console.log("COOKIE ATTR SETS:"); for (const [k, n] of attrs) console.log(`  ${n}x ${k}`);
rec("9 cookie attributes (no Domain, Path=/, SameSite=Lax)", bad.length === 0, `${attrs.size} distinct sets; violations=${bad.length}${bad.length ? " e.g. " + bad[0] : ""}; Secure present=${[...attrs.keys()].some((k) => / secure/.test(k))}`);

fs.writeFileSync(process.env.OUT ?? `/dev/null`, JSON.stringify({ label: LABEL, out }, null, 1));
