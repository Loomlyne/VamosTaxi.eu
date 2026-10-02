// Quick 261002-p6-followups: the mirror check (tools/mirror-check.mjs, written for item 5) against the REAL local Worker build:
// the public Worker for home, /checkout, /account, /bookings, /manage-booking and /booking-detail, and the dashboard Worker for
// the calendar, the bookings list and a booking's change row. The stock spot list has no sign-in, so this file gives
// mirror-check.mjs the proof's own list (proof-mirror-spots.mjs): the customer and the dashboard admin sign in once, with a
// password set through the local stack's admin API (in memory only), and their cookies are put on each spot's page.
// usage (from proof-run.sh mirror): PROOF_SEED PROOF_BASE PROOF_DASH PROOF_EVID SB_API_PORT SB_SERVICE_KEY
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./mirror-check.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const env = process.env;
const S = JSON.parse(fs.readFileSync(env.PROOF_SEED, "utf8"));
const BASE = env.PROOF_BASE;
const DASH = env.PROOF_DASH;
const EVID = env.PROOF_EVID;
const API = `http://127.0.0.1:${env.SB_API_PORT ?? "61621"}`;
const SERVICE = env.SB_SERVICE_KEY ?? "";
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const password = () => crypto.randomBytes(12).toString("base64url") + "Aa1!";
const adminApi = (method, p, body) => fetch(`${API}${p}`, { method, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const ip = () => `10.${150 + Math.floor(Math.random() * 90)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

async function setPassword(email, id, pw) {
  let r = await adminApi("POST", "/auth/v1/admin/users", { email, password: pw, email_confirm: true });
  if (r.status === 422) {
    const u = id ? { id } : ((await (await adminApi("GET", "/auth/v1/admin/users?per_page=1000")).json()).users ?? []).find((x) => x.email === email);
    if (u) r = await adminApi("PUT", `/auth/v1/admin/users/${u.id}`, { password: pw, email_confirm: true });
  }
  return r.status;
}

// /api/fx asks an outside provider over the internet; a slow answer has dropped the local Worker runtime before (memory
// local-checkout-browser-run). Every context this process opens, mirror-check.mjs's included (it shares this Playwright module),
// answers it itself with "unavailable" (the pages fall back to CHF).
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const br = await launch(...a);
  const newContext = br.newContext.bind(br);
  br.newContext = async (...b) => {
    const ctx = await newContext(...b);
    await ctx.route("**/api/fx", (r) => r.fulfill({ status: 503, json: { ok: false, code: "fx_unavailable" } }));
    return ctx;
  };
  return br;
};
const browser = await chromium.launch();
async function signIn(label, url, email, pw, fill) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": ip() } });
  await ctx.addInitScript(() => { try { localStorage.setItem("vamosLang", "en"); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Necessary only" }).click({ timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 4; i++) {
    await fill(page, email, pw);
    await nap(700);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL((u) => !/\/(sign-in|login)/.test(u.pathname), { timeout: 30000 });
  await nap(1500);
  const state = await ctx.storageState();
  await ctx.close();
  console.log(`signed in ${label}: ${state.cookies.length} cookie(s), landed ${new URL(page.url()).pathname}`);
  return state;
}

const customerPw = password();
const adminPw = password();
const rc = await setPassword(S.customerEmail, null, customerPw);
const ra = await setPassword(S.adminEmail, S.adminId, adminPw);
console.log(`admin API: customer ${rc}, admin ${ra}`);
const customer = await signIn("customer", `${BASE}/sign-in`, S.customerEmail, customerPw, async (page, email, pw) => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").first().fill(pw);
});
const admin = await signIn("dashboard admin", `${DASH}/login`, S.adminEmail, adminPw, async (page, email, pw) => {
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(pw);
});
await browser.close();

globalThis.__PROOF = { S, BASE, DASH, customer, admin };
const json = path.join(EVID, "mirror-worker.json");
const code = await run([
  "--base", BASE,
  "--ops-base", DASH,
  "--spots", path.resolve(path.dirname(new URL(import.meta.url).pathname), "proof-mirror-spots.mjs"),
  "--lang", "ar,en",
  "--width", "1440,390",
  "--json", json,
]);
void pathToFileURL;
process.exit(code);
