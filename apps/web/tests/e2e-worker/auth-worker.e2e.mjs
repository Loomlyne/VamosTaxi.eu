// Auth end-to-end against a real local Worker (wrangler dev) + real local Supabase.
// Usage: MAIL_ROOT=<tree>/apps/web/.wrangler/tmp/email SB_DB_CONTAINER=supabase_db_vamos-taxi-auth \
//        node auth-worker.e2e.mjs <label>
// Prints no secrets: mail links/codes are parsed in-process only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const LABEL = process.argv[2] ?? "run";
const PORT = Number(process.env.E2E_PORT ?? 4290);
const DASH_PORT = Number(process.env.E2E_DASH_PORT ?? process.env.DASH_PORT ?? 4291); // second instance of the same build with VAMOS_SURFACE=auto, so Host dashboard.localhost is honoured
const MAIL_ROOT = process.env.MAIL_ROOT;
const DB = process.env.SB_DB_CONTAINER ?? "supabase_db_vamos-taxi-auth";
const RUN = Date.now().toString(36);
const PW1 = "E2e-First-pass-1", PW2 = "E2e-Second-pass-2";
const out = [];
const seenCookies = [];
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
const sessionF = async (jar, host) => (await req("GET", "/api/auth/session?finish=1", { jar, host })).json; // 27.1: asks finishRequired

const files = () => { if (!fs.existsSync(MAIL_ROOT)) return []; const r = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith(".txt") && r.push(p); } }; walk(MAIL_ROOT); return r; };
const before = () => new Set(files());
async function newMail(seen, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const f = files().filter((x) => !seen.has(x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); if (f.length) return fs.readFileSync(f[0], "utf8"); await new Promise((r) => setTimeout(r, 250)); }
  return null;
}
const linkOf = (t) => (t.match(/https?:\/\/[^\s"<>]*(?:\/auth\/v1\/verify|\/(?:sign-in|login)\/confirm)[^\s"<>]*/) ?? [])[0]?.replace(/&amp;/g, "&");
const codeOf = (t) => (t.match(/\b(\d{6})\b/) ?? [])[1];

// follow a mail link: Supabase verify -> 303 -> app callback -> 302 ...
async function follow(link, jar, host) {
  const cu = new URL(link);
  if (/\/(?:sign-in|login)\/confirm$/.test(cu.pathname)) { // F12: the confirm page, then its button
    const page = await req("GET", cu.pathname + cu.search, { jar, host: cu.host });
    const body = Object.fromEntries(["token_hash", "type", "e", "next", "nextb"].map((k) => [k, cu.searchParams.get(k)]).filter(([, v]) => v));
    const post = await req("POST", "/api/auth/callback", { jar, host: cu.host, headers: { origin: `http://${cu.host}`, "cf-connecting-ip": newIp() }, body });
    return { hops: [`GET ${page.status}`, `POST ${post.status}`], final: post.json?.target ?? "" };
  }
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
const agreements = (e) => Number(sql(`select count(*) from public.account_agreement_records where lower(email)=lower('${e}')`));
const meta = (e, k) => sql(`select coalesce(raw_user_meta_data->>'${k}', '') from auth.users where email='${e}'`);

const A = `e2e-a-${RUN}@example.com`, B = `e2e-b-${RUN}@example.com`, D = `e2e-d-${RUN}@example.com`, U = `e2e-unknown-${RUN}@example.com`, U2 = `e2e-unknown2-${RUN}@example.com`;
const jarA = new Jar();

// 1a0 sign-up without the tick is refused: no account, no account_agreement_records row (27 D-03a)
let seen = before();
{
  const N1 = `e2e-notick-${RUN}@example.com`, N2 = `e2e-notick2-${RUN}@example.com`;
  const rp = await auth({ mode: "signup", method: "password", email: N1, password: PW1, firstName: "N", lastName: "One" }, new Jar(), { ip: newIp() });
  const rm = await auth({ mode: "signup", method: "magic", email: N2, firstName: "N", lastName: "Two" }, new Jar(), { ip: newIp() });
  const mailN = await newMail(seen, 2500);
  const okBody = (x) => x.status === 400 && x.json?.reason === "consent-required";
  rec("1a0 sign-up without the tick is refused", okBody(rp) && okBody(rm) && !mailN && users(N1) === 0 && users(N2) === 0 && agreements(N1) === 0 && agreements(N2) === 0,
    `password ${rp.status} ${JSON.stringify(rp.json)}; magic ${rm.status} ${JSON.stringify(rm.json)}; mail=${!!mailN}; auth.users=${users(N1)}+${users(N2)}; agreement rows=${agreements(N1)}+${agreements(N2)}`);
}

// 1 sign up
seen = before();
let r = await auth({ mode: "signup", method: "password", email: A, password: PW1, firstName: "E", lastName: "Two", phone: "+41 79 000 00 00", consent: true, locale: "de" }, jarA, { ip: newIp() });
const su = `status ${r.status} stage=${r.json?.stage ?? JSON.stringify(r.json)?.slice(0, 60)}`;
let mail = await newMail(seen);
const rowsAfter = users(A);
const hasVerifier = jarA.has(/code-verifier/);
const agrA = sql(`select count(*) from public.account_agreement_records where lower(email)=lower('${A}') and surface='sign-up' and choice='create' and record_kind='consent' and text_version='2026-09-29' and locale='de'`);
let link = mail && linkOf(mail);
rec("1a signup: response + mail + auth.users row + one agreement record + optional phone kept on the account (27.1)", !!mail && rowsAfter === 1 && agrA === "1" && agreements(A) === 1 && meta(A, "phone") === "+41790000000"
  && sql(`select count(*) from public.account_finish_pending p join auth.users u on u.id=p.user_id where u.email='${A}'`) === "0", `${su}; mail=${!!mail}; auth.users=${rowsAfter}; code-verifier cookie=${hasVerifier}; agreement rows=${agreements(A)} matching=${agrA}; phone kept=${meta(A, "phone") === "+41790000000"}; finish mark=${sql(`select count(*) from public.account_finish_pending p join auth.users u on u.id=p.user_id where u.email='${A}'`)}`);
if (link) {
  const f = await follow(link, jarA);
  const s = await session(jarA);
  const cust = sql(`select count(*) from public.customers c join auth.users u on u.id=c.user_id where u.email='${A}'`);
  const cons = sql(`select count(*) from public.consent_log l join public.customers c on c.id=l.customer_id join auth.users u on u.id=c.user_id where u.email='${A}'`);
  rec("1b confirm link -> callback -> session/customer, no consent row (27 D-01)", f.hops.join(">").includes("POST 200") && s?.signedIn === true && cust === "1" && Number(cons) === 0,
    `hops=${f.hops.join(">")} final=${f.final} sb-auth-token cookie=${jarA.has(/^sb-.*-auth-token/)}; session.signedIn=${s?.signedIn}; customers=${cust}; consent_log=${cons}; agreement rows=${agreements(A)}`);
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

// 3b-3f sign-in link for an unknown address (27.1 / 27 D-37, replaces the D-36 line): the link makes the account, then it
// must finish (name, optional phone, the tick) before it is used.
{
  const known3 = r; // check 3's request for the known address A
  const UL = `e2e-newlink-${Date.now()}@example.com`;
  const seen3b = before();
  const t3b = Date.now();
  const r3b = await auth({ mode: "signin", method: "magic", email: UL }, new Jar(), { ip: newIp() });
  const ms3b = Date.now() - t3b;
  const mail3b = await newMail(seen3b, 8000);
  const link3b = mail3b && linkOf(mail3b);
  const sealed = !!link3b && /\/sign-in\/confirm\?/.test(link3b) && new URL(link3b).searchParams.has("e") && !/\/auth\/v1\/verify/.test(mail3b);
  rec("3b sign-in link for a new address: same answer as a known one, a sealed confirm mail, one unconfirmed account, no record (27 D-37)",
    r3b.status === known3.status && JSON.stringify(r3b.json) === JSON.stringify(known3.json) && sealed && users(UL) === 1 && agreements(UL) === 0
      && sql(`select count(*) from auth.users where email='${UL}' and email_confirmed_at is null`) === "1" && ms3b >= 1200,
    `took ${ms3b} ms; status ${r3b.status} vs known ${known3.status}; body equal=${JSON.stringify(r3b.json) === JSON.stringify(known3.json)}; mail=${!!mail3b} sealed confirm link=${sealed}; auth.users=${users(UL)}; agreement rows=${agreements(UL)}`);

  const jarL = new Jar();
  let f3 = link3b ? await follow(link3b, jarL) : { hops: [], final: "" };
  const s3c = await sessionF(jarL);
  const me3c = (await req("GET", "/api/checkout/me", { jar: jarL })).json;
  rec("3c confirm button signs in and lands on the finish step; the session and /api/checkout/me say it must finish",
    f3.hops.join(">").includes("POST 200") && f3.final === "/sign-up?state=finish" && s3c?.signedIn === true && s3c?.finishRequired === true
      && JSON.stringify(me3c) === JSON.stringify({ signed_in: true, finish_required: true }),
    `hops=${f3.hops.join(">")} target=${f3.final}; signedIn=${s3c?.signedIn} finishRequired=${s3c?.finishRequired}; checkout/me=${JSON.stringify(me3c)}`);

  const r3d = await auth({ action: "finish-account", firstName: "Mia", lastName: "Keller" }, jarL, { ip: newIp() });
  rec("3d finish without the tick: 400 consent-required, no record, no name written",
    r3d.status === 400 && r3d.json?.reason === "consent-required" && agreements(UL) === 0 && meta(UL, "first_name") === "",
    `${r3d.status} ${JSON.stringify(r3d.json)}; agreement rows=${agreements(UL)}; first_name=${JSON.stringify(meta(UL, "first_name"))}`);

  const r3e = await auth({ action: "finish-account", firstName: "Mia", lastName: "Keller", phone: "+41 79 000 00 00", consent: true, locale: "fr" }, jarL, { ip: newIp() });
  const row3e = sql(`select count(*) from public.account_agreement_records where lower(email)=lower('${UL}') and surface='sign-up' and choice='create' and record_kind='consent' and text_version='2026-09-29' and locale='fr'`);
  const s3e = await sessionF(jarL);
  const me3e = (await req("GET", "/api/checkout/me", { jar: jarL })).json;
  const again = await auth({ action: "finish-account", firstName: "Mia", lastName: "Keller", consent: true }, jarL, { ip: newIp() });
  rec("3e finish with the tick: exactly one sign-up record, names and phone saved, finished; a second press writes nothing",
    r3e.status === 200 && r3e.json?.ok === true && row3e === "1" && agreements(UL) === 1 && meta(UL, "full_name") === "Mia Keller" && meta(UL, "phone") === "+41790000000"
      && sql(`select full_name || '|' || phone from public.customers where email='${UL}'`) === "Mia Keller|+41790000000"
      && s3e?.finishRequired === false && s3e?.signedIn === true && again.status === 200 && agreements(UL) === 1
      && me3e?.signed_in === true && me3e?.finish_required === undefined && me3e?.first_name === "Mia",
    `${r3e.status} ${JSON.stringify(r3e.json)}; matching row=${row3e}; rows=${agreements(UL)}; full_name=${meta(UL, "full_name")}; phone kept=${meta(UL, "phone") === "+41790000000"}; customer row=${sql(`select full_name || '|' || phone from public.customers where email='${UL}'`)}; finishRequired=${s3e?.finishRequired}; second press ${again.status}, rows=${agreements(UL)}; checkout/me after=${JSON.stringify(me3e)?.slice(0, 80)}`);

  await nap(1500);
  const UC = `e2e-newcode-${Date.now()}@example.com`;
  const seen3f = before();
  await auth({ mode: "signin", method: "magic", email: UC }, new Jar(), { ip: newIp() });
  const mail3f = await newMail(seen3f, 8000);
  const code3f = mail3f && codeOf(mail3f);
  const jarC = new Jar();
  const r3f = code3f ? await auth({ mode: "verify-code", email: UC, code: code3f }, jarC, { ip: newIp() }) : { status: 0, json: null };
  const s3f = await sessionF(jarC);
  rec("3f the 6-digit code for a new address answers finish: true",
    r3f.status === 200 && r3f.json?.ok === true && r3f.json?.finish === true && s3f?.finishRequired === true,
    `code in mail=${!!code3f}; verify-code ${r3f.status} ${JSON.stringify(r3f.json)}; finishRequired=${s3f?.finishRequired}`);

  // 3h: a link for a new address, then a ticked /sign-up for the same address before the link is used: not asked twice.
  await nap(1500);
  const UH = `e2e-linkthensignup-${Date.now()}@example.com`;
  const seenH = before();
  await auth({ mode: "signin", method: "magic", email: UH }, new Jar(), { ip: newIp() });
  const mailH = await newMail(seenH, 8000);
  const markedH = sql(`select count(*) from public.account_finish_pending p join auth.users u on u.id=p.user_id where u.email='${UH}' and p.finished_at is null`);
  await nap(1500);
  const seenH2 = before();
  const rH = await auth({ mode: "signup", method: "password", email: UH, password: PW1, firstName: "H", lastName: "Two", consent: true }, new Jar(), { ip: newIp() });
  // The sign-up sends a fresh confirm link (the earlier link's token is replaced); that is the one a person uses.
  const mailH2 = await newMail(seenH2, 8000);
  const linkH = (mailH2 && linkOf(mailH2)) || (mailH && linkOf(mailH));
  const jarH = new Jar();
  const fH = linkH ? await follow(linkH, jarH) : { hops: [], final: "" };
  const sH = await sessionF(jarH);
  rec("3h link then a ticked /sign-up for the same address: signed in without a second tick",
    markedH === "1" && agreements(UH) === 1 && sH?.signedIn === true && sH?.finishRequired === false && !fH.final.includes("state=finish"),
    `marked=${markedH}; signup ${rH.status}; second mail=${!!mailH2}; records=${agreements(UH)}; target=${fH.final}; signedIn=${sH?.signedIn} finishRequired=${sH?.finishRequired}`);

  // 3i: a past guest booking (checkout 'informed' row, no account) is not a tick: the link account must finish.
  await nap(1500);
  const UG = `e2e-pastguest-${Date.now()}@example.com`;
  sql(`insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('checkout', '${UG}', 'guest', 'informed', '2026-09-29', 'en')`);
  const seenG = before();
  await auth({ mode: "signin", method: "magic", email: UG }, new Jar(), { ip: newIp() });
  const mailG = await newMail(seenG, 8000);
  const jarG = new Jar();
  const fG = mailG && linkOf(mailG) ? await follow(linkOf(mailG), jarG) : { hops: [], final: "" };
  const sG = await sessionF(jarG);
  rec("3i a past guest who signs in by link for the first time is asked to finish (a guest row is not a tick)",
    fG.final === "/sign-up?state=finish" && sG?.finishRequired === true,
    `target=${fG.final}; finishRequired=${sG?.finishRequired}`);

  // An account made by a password sign-up (A, check 1) is never asked.
  const jarK = new Jar();
  await auth({ mode: "signin", method: "password", email: A, password: PW1 }, jarK, { ip: newIp() });
  const sK = await sessionF(jarK);
  rec("3g a sign-up account is never asked to finish", sK?.signedIn === true && sK?.finishRequired === false, `signedIn=${sK?.signedIn} finishRequired=${sK?.finishRequired}`);
}

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
await auth({ mode: "signup", method: "password", email: B, password: PW1, firstName: "B", lastName: "Two", consent: true }, jar6, { ip: newIp() });
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
r = await auth({ mode: "signup", method: "password", email: U2, password: PW1, firstName: "U", lastName: "Two", consent: true }, new Jar(), { host: DH, ip: newIp() });
const s8 = `pw signup on dashboard: ${r.status}, auth.users=${users(U2)}, agreement rows=${agreements(U2)}`;
rec("8 dashboard host", r.status && users(U) === 0 && users(U2) === 0 && agreements(U2) === 0 && r8a.includes("403") && !jar8.has(/^sb-.*-auth-token/), `${r8a}; ${m8}; ${s8}`);

// 7 rate limit (last: same ip bucket)
// The local limiter (miniflare) counts in fixed windows aligned to the wall-clock minute and keeps its state in .wrangler/e2e:
// a burst that crosses a minute boundary restarts the count. That was the flip of this line between runs.
{ const left = 60000 - (Date.now() % 60000); if (left < 20000) await nap(left + 300); }
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
