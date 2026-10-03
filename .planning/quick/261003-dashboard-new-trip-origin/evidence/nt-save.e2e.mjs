// Quick 261003: dashboard New trip "Save trip" in Chromium against the LOCAL dashboard Worker build, served on
// http://dashboard.localhost:<E2E_DASH_PORT> so the browser sends the dashboard Origin, as on live.
// Started next to tests/e2e-worker/p6-run.sh (P6_MODE=up): real Worker, real local Supabase stack, Stripe /
// Turnstile / Mapbox / Resend local stand-ins (tests/e2e-worker/fakes.mjs). Nothing in the page is stubbed except
// /api/fx (internet; crashes local wrangler). Local stack only; the admin password is generated and held in memory.
// Usage: LABEL=after|before P6_SEED=<p6-seed.json> SB_API_PORT=… SB_SERVICE_KEY=… E2E_DASH_PORT=… SB_DB_CONTAINER=… node nt-save.e2e.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, "../../../../apps/web/package.json"))("@playwright/test");

const LABEL = process.env.LABEL ?? "after";
const D = `http://dashboard.localhost:${process.env.E2E_DASH_PORT}`;
const API = `http://127.0.0.1:${process.env.SB_API_PORT}`;
const SERVICE = process.env.SB_SERVICE_KEY;
const S = JSON.parse(fs.readFileSync(process.env.P6_SEED, "utf8"));
const SHOTS = process.env.SHOTS ?? here;
const sql = (q) => execFileSync("docker", ["exec", "-i", process.env.SB_DB_CONTAINER, "psql", "-U", "postgres", "-At", "-c", q]).toString().trim();
const out = [];
const rec = (n, ok, ev) => { out.push({ n, ok, ev }); console.log(`${ok ? "PASS" : "FAIL"} | ${LABEL} | ${n} | ${ev}`); };
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const adminPw = crypto.randomBytes(12).toString("base64url") + "Aa1!";
const ra = await fetch(`${API}/auth/v1/admin/users/${S.adminId}`, {
  method: "PUT",
  headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
  body: JSON.stringify({ password: adminPw, email_confirm: true }),
});
rec("0 local admin gets a password (local admin API)", ra.status === 200, `status ${ra.status}`);

const browser = await chromium.launch();
const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const fx = (page) => page.route(/\/api\/fx(\?.*)?$/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));

// ---- A. signed out on the dashboard origin: the public money routes refuse it (staff session required)
{
  const ctx = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": ip() } });
  const page = await ctx.newPage();
  await fx(page);
  await page.goto(`${D}/login`, { waitUntil: "domcontentloaded" });
  const probe = await page.evaluate(async () => {
    const one = async (p) => { const r = await fetch(p, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }); return `${p} ${r.status} ${(await r.text()).slice(0, 60)}`; };
    return [await one("/api/checkout/price"), await one("/api/checkout/intent")];
  });
  const refused = probe.every((x) => / 403 .*csrf/.test(x));
  rec("A signed-out page on the dashboard origin: price and intent answer 403 csrf", refused,probe.join(" | "));
  await ctx.close();
}

// ---- B. the admin signs in and saves a New trip
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": ip() } });
await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
const page = await ctx.newPage();
await fx(page);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
const calls = [];
page.on("response", async (resp) => {
  const u = new URL(resp.url());
  if (resp.request().method() !== "POST" || !/^\/api\/(quote|checkout)\b/.test(u.pathname)) return;
  const body = (await resp.text().catch(() => "")).slice(0, 90);
  calls.push({ path: u.pathname, status: resp.status(), origin: resp.request().headers()["origin"] ?? "(none)", body });
});
await page.goto(`${D}/login`, { waitUntil: "load", timeout: 60000 });
await page.waitForLoadState("networkidle");
for (let i = 0; i < 4; i++) {
  await page.getByPlaceholder("you@example.com").fill(S.adminEmail);
  await page.getByPlaceholder("••••••••").fill(adminPw);
  if ((await page.getByPlaceholder("you@example.com").inputValue()) === S.adminEmail) break;
  await nap(800);
}
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
rec("B1 admin signs in on the dashboard host", !new URL(page.url()).pathname.startsWith("/login"), page.url());

await page.goto(`${D}/bookings/new`, { waitUntil: "load" });
await page.waitForLoadState("networkidle");
await page.getByLabel("Pickup").fill("Oerlikon");
await page.locator("button", { hasText: "Zurich Oerlikon" }).first().click();
await page.getByLabel("Drop-off").fill("Zug");
await page.locator("button", { hasText: "Zug station" }).first().click();
const day = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
await page.getByLabel("Date").fill(day);
await page.getByLabel("Time").fill("10:00");
await page.getByLabel("Passengers").fill("2");
await page.getByLabel("Passengers").blur();
for (let i = 0; i < 60 && !calls.some((c) => c.path === "/api/checkout/price"); i++) await nap(250);
await nap(1200);
await page.getByLabel("Name").fill(`NT ${LABEL} Test`);
await page.getByLabel("Email").fill(`nt-${LABEL}-${S.tag}@example.test`);
await page.getByLabel("Mobile").fill("+41 79 000 00 00");
await page.screenshot({ path: `${SHOTS}/nt-${LABEL}-filled.png` });
const before = Number(sql("select count(*) from public.bookings"));
const adminCustBefore = Number(sql(`select count(*) from public.customers where user_id='${S.adminId}'`));
const custTotalBefore = Number(sql("select count(*) from public.customers"));
await page.getByRole("button", { name: "Save trip" }).click();
for (let i = 0; i < 60 && !/\/bookings\/VT-/.test(page.url()); i++) await nap(250);
await nap(1500);
await page.screenshot({ path: `${SHOTS}/nt-${LABEL}-after-save.png` });
const after = Number(sql("select count(*) from public.bookings"));

// The intent with the signed-in staff cookie and the dashboard Origin (empty body: never a row).
const direct = await page.evaluate(async () => {
  const r = await fetch("/api/checkout/intent", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
  return `${r.status} ${(await r.text()).slice(0, 60)}`;
});

const priceCalls = calls.filter((c) => c.path === "/api/checkout/price");
const intentCalls = calls.filter((c) => c.path === "/api/checkout/intent");
console.log("calls", JSON.stringify(calls));
const ref = (new URL(page.url()).pathname.match(/\/bookings\/(VT-[^/]+)/) || [])[1] || "";
const row = ref ? sql(`select reference||' '||status from public.bookings where reference='${ref}'`) : "";
if (LABEL === "after") {
  rec("B2 every quote/price/intent call carries the dashboard Origin", calls.length > 0 && calls.every((c) => c.origin === D), [...new Set(calls.map((c) => c.origin))].join(","));
  rec("B3 /api/checkout/price answers 200 (not 403 csrf)", priceCalls.length > 0 && priceCalls.every((c) => c.status === 200), priceCalls.map((c) => `${c.status} ${c.body}`).join(" | "));
  rec("B4 Save trip: /api/checkout/intent 200 with a reference", intentCalls.length === 1 && intentCalls[0].status === 200 && /reference/.test(intentCalls[0].body), intentCalls.map((c) => `${c.status} ${c.body}`).join(" | "));
  rec("B5 the screen moves to the new booking and the row exists", !!ref && row.startsWith(ref) && after === before + 1, `url ${page.url()}; row "${row}"; bookings ${before}→${after}`);
  const custOfBooking = ref ? sql(`select coalesce(customer_id::text,'null') from public.bookings where reference='${ref}'`) : "(no booking)";
  const adminCustAfter = Number(sql(`select count(*) from public.customers where user_id='${S.adminId}'`));
  const custTotalAfter = Number(sql("select count(*) from public.customers"));
  rec("B7 the saved booking has customer_id null and no customers row was created for the admin's auth user", custOfBooking === "null" && adminCustAfter === adminCustBefore, `customer_id ${custOfBooking}; admin customers rows ${adminCustBefore}→${adminCustAfter}; all customers rows ${custTotalBefore}→${custTotalAfter}`);
  rec("B6 staff cookie + dashboard Origin, empty body: intent passes CSRF (400 invalid_request)", /^400 /.test(direct), direct);
} else {
  rec("B3 /api/checkout/price answers 403 csrf (the live bug)", priceCalls.length > 0 && priceCalls.every((c) => c.status === 403 && /csrf/.test(c.body)), priceCalls.map((c) => `${c.status} ${c.body}`).join(" | "));
  rec("B4 Save trip creates no booking", after === before && !ref, `url ${page.url()}; bookings ${before}→${after}; intent calls ${intentCalls.length}`);
  rec("B6 staff cookie + dashboard Origin: intent 403 csrf (the live bug)", /^403 .*csrf/.test(direct), direct);
}
console.log("errors", JSON.stringify(errors));
await browser.close();
fs.writeFileSync(join(here, `nt-${LABEL}.json`), JSON.stringify({ out, calls, errors }, null, 1));
process.exit(out.some((x) => !x.ok) ? 1 : 0);
