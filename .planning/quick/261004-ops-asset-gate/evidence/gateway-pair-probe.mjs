// Two-Worker probe: the gateway (apps/web/dashboard-gateway.ts, unchanged) in front of the lab Worker built from this
// branch, as live runs it: /app/ops/* goes through the gateway to the `Dashboard` entrypoint (surface "dashboard").
//   node gateway-pair-probe.mjs  (gateway pair on 127.0.0.1:4719, lab public Worker on localhost:4710)
// Reads the lab admin from admin.txt and the lab stack keys from sb.env at run time; prints no password, token or
// cookie value. Lab copy only: it makes one throwaway customer in the lab stack.
import fs from "node:fs";
import crypto from "node:crypto";

const GW = "http://127.0.0.1:4719";
const PUB = "http://localhost:4710";
const STATE = `${process.env.HOME}/.vamos-scratch/lab-gate`;
const kv = (file) => Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter((l) => l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const admin = kv(`${STATE}/admin.txt`);
const sb = kv(`${STATE}/sb.env`);

const results = [];
function line(id, ok, evidence) {
  results.push({ id, status: ok ? "PASS" : "FAIL", evidence });
  console.log(`${ok ? "PASS" : "FAIL"} | ${id} | ${evidence}`);
}
const GATED = ["/app/ops/OpsDetail.dc.html", "/app/ops/ops.dc.html", "/app/ops/ops-login.dc.html", "/app/ops/OpsSettings.dc.html", "/app/ops/OpsBoard.dc.html"];
const OPEN = ["/app/ops/support.js", "/app/ops/AuthForm.dc.html"];

async function get(base, path, cookie, extra = {}) {
  const headers = { ...extra };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + path, { headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  return { status: res.status, cache: res.headers.get("cache-control"), len: body.length, body, setCookie: res.headers.getSetCookie() };
}
/** Session cookies from Set-Cookie lines: name=value pairs, empty values dropped. */
function jar(setCookie) {
  return setCookie.map((c) => c.split(";")[0]).filter((p) => /^vt-auth(\.\d+)?=./.test(p)).join("; ");
}
async function signIn(base, origin, email, password) {
  const res = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ mode: "signin", method: "password", email, password, locale: "en" }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: body?.ok === true, reason: body?.reason ?? null, cookie: jar(res.headers.getSetCookie()) };
}
async function gatedAll(cookie, extra) {
  const out = [];
  for (const p of GATED) { const r = await get(GW, p, cookie, extra); out.push(`${p.split("/").pop()} ${r.status}/${r.len}B/${r.cache}`); }
  return out;
}

// G-1 signed out through the gateway
{
  const gated = await gatedAll();
  const open = [];
  for (const p of OPEN) { const r = await get(GW, p); open.push(`${p.split("/").pop()} ${r.status}/${r.len}B`); }
  line("GW1 signed out: screen files 404, sign-in files 200",
    gated.every((s) => / 404\/0B\/private, no-store$/.test(s)) && open.every((s) => / 200\/[1-9]/.test(s)), [...gated, ...open].join("; "));
}
{
  const gated = await gatedAll(undefined, { "x-vamos-dc-asset": "1" });
  line("GW2 signed out + forged x-vamos-dc-asset: still 404", gated.every((s) => / 404\//.test(s)), gated.join("; "));
}
{
  const t0 = Date.now();
  const r = await get(GW, "/login");
  line("GW3 /login through the gateway renders (ops-login.dc.html read from ASSETS, no self-fetch)",
    r.status === 200 && r.body.includes('<base href="/app/ops/">') && r.body.includes('dc-import name="AuthForm"'),
    `status ${r.status}, ${r.len} B, ${Date.now() - t0} ms, cache ${r.cache}`);
}
// G-2 admin through the gateway
const adm = await signIn(GW, "http://dashboard.localhost:4719", admin.email, admin.password);
line("GW4 admin password sign-in through the gateway", adm.ok && adm.cookie.length > 0, `status ${adm.status} ok=${adm.ok} vt-auth cookie=${adm.cookie.length > 0}`);
{
  const d = await get(GW, "/dashboard", adm.cookie);
  line("GW5 admin /dashboard: the console shell (ops.dc.html from ASSETS)", d.status === 200 && d.body.includes('dc-import name="OpsSidebar"'), `status ${d.status}, ${d.len} B`);
  const b = await get(GW, "/bookings", adm.cookie);
  line("GW6 admin /bookings: the console shell", b.status === 200 && b.body.includes('dc-import name="OpsBoard"'), `status ${b.status}, ${b.len} B`);
  const files = [];
  for (const p of [...GATED, ...OPEN, "/app/ops/OpsSidebar.dc.html", "/app/ops/OpsTable.dc.html", "/app/ops/ActionsMenu.dc.html"]) {
    const r = await get(GW, p, adm.cookie);
    files.push(`${p.split("/").pop()} ${r.status}/${r.len}B/${r.cache}`);
  }
  const gatedOk = files.slice(0, GATED.length).every((s) => / 200\/[1-9]\d*B\/private, no-store$/.test(s));
  line("GW7 admin: every screen file 200, private no-store", gatedOk && files.every((s) => / 200\//.test(s)), files.join("; "));
}
// G-3 a customer's vt-auth cookie (made on the public host) sent to the dashboard gateway
{
  const email = `gate-customer-${crypto.randomBytes(4).toString("hex")}@example.com`;
  const password = crypto.randomBytes(18).toString("base64url");
  const h = { apikey: sb.SERVICE_ROLE_KEY, authorization: `Bearer ${sb.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  const made = await fetch(`${sb.API_URL}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, password, email_confirm: true }) });
  const cust = await signIn(PUB, "http://localhost:4710", email, password);
  const files = await gatedAll(cust.cookie);
  const doc = await get(GW, "/dashboard", cust.cookie);
  line("GW8 customer vt-auth cookie on the dashboard: screen files 404, /dashboard to /login",
    made.status < 300 && cust.ok && cust.cookie.length > 0 && files.every((s) => / 404\//.test(s)) && doc.status === 307,
    `customer made ${made.status}; public sign-in ok=${cust.ok}; ${files.join("; ")}; /dashboard ${doc.status}`);
}
// G-4 sign out, then the files are closed again
{
  const out = await fetch(GW + "/api/auth", { method: "POST", headers: { "content-type": "application/json", origin: "http://dashboard.localhost:4719", cookie: adm.cookie }, body: JSON.stringify({ action: "signout" }) });
  // After sign-out the browser holds no session: no cookie. A copy of the old cookie kept from before sign-out is
  // also tried: its access token is still unexpired, but Supabase Auth no longer knows the session.
  const files = await gatedAll();
  const stale = await gatedAll(adm.cookie);
  line("GW9 after sign-out: screen files 404 again (no cookie, and the old cookie replayed)",
    files.every((s) => / 404\//.test(s)) && stale.every((s) => / 404\//.test(s)),
    `signout ${out.status}; no cookie: ${files.join("; ")}; old cookie: ${stale.join("; ")}`);
}
fs.writeFileSync(new URL("./gateway-pair-results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
