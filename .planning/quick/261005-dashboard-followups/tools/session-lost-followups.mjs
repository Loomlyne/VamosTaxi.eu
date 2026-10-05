#!/usr/bin/env node
// Follow-ups to the dashboard session watcher (quick 261005-dashboard-followups), in a real Chromium, offline.
//
//   node session-lost-followups.mjs <public tree> <label> <out dir>
//
// Serves the synced public tree (the job's `../../261005-dashboard-fixes/tools/serve.mjs`: dashboard host mode, the one ops
// shell for every console path), opens the real console with a live session, then the session dies or a file misses.
// /api/** is stubbed by Playwright, never by the server. Runs:
//   write-keeps-form-<dead|mfa|notstaff>  Settings, a typed company name, Save while the session is dead (401 no-session, 403
//                                          needs-mfa, 403 not-staff on a PATCH): the page stays on /settings with the typed
//                                          value and the screen's own refusal; then pressing Customers in the sidebar goes to /login
//   write-then-read                       same, then the next staff read (fetch) goes to /login
//   notstaff-api                          Dashboard, every /api/staff/* answers 403 not-staff, the period switch -> /login
//   notstaff-nav                          Dashboard, the next screen file 404s and /api/staff/me says not-staff -> /login
//   sidebar-slow-auth                     the sidebar file 404s once at boot (slow Auth), the session is alive -> the page reloads
//                                          once and the sidebar is there
//   nested-part                           (unchanged from the dashboard-fixes job) PlaceSearch 404s in edit mode: no reload
//   junk-count (ONLY=junk-count, ~55 s)   a non-numeric reload count and a screen file that 404s while /api/staff/me answers
//                                          slowly: the page may not reload more than twice
// `ONLY=a,b` runs only those. Prints PASS/FAIL per check, writes <label>-<run>.png (bare 1440 x 900 viewport crop), exits 1 on
// any FAIL. Chromium is the full one: chromium.launch({ channel: "chromium" }) (the headless shell 1234 is incomplete here).
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve, gate } from "../../261005-dashboard-fixes/tools/serve.mjs";
import { answer, stubRows, MONEY_AFTER } from "../../261005-dashboard-fixes/tools/fixtures.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , tree, label = "after", outArg = "screens"] = process.argv;
if (!tree) throw new Error("usage: session-lost-followups.mjs <public tree> <label> <out dir>");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = mkdtempSync(join(out, "tmp-"));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const wanted = (name) => (only ? only.includes(name) : name !== "junk-count");

const { server, base } = await serve(resolve(tree));
const browser = await chromium.launch({ channel: "chromium", headless: true });
let bad = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
};

const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };
const SETTINGS = { company: "Vamos Test", address: "", uid: "", phone: "", email: "ops@example.test", defaultLang: "en", defaultCur: "CHF" };
const DEAD = {
  dead: { status: 401, json: { ok: false, code: "no-session" } },
  mfa: { status: 403, json: { ok: false, code: "needs-mfa" } },
  notstaff: { status: 403, json: { ok: false, code: "not-staff" } },
};
let rows = null;

/** Opens the console at `path` with a live session. `state.api` says what /api/staff/* answers from now on. */
async function open(path, { rowsNeeded = false, setup = () => {}, meDelayMs = 0, init = () => {} } = {}) {
  gate.dead = false;
  gate.failNext = 0;
  gate.failFiles = new Set();
  gate.failOnceFiles = new Set();
  gate.hits.length = 0;
  setup(gate);
  if (rowsNeeded && !rows) rows = await stubRows(repo, scratch);
  const state = { api: "alive" };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("vamosLang", "en");
    if (location.pathname !== "/login") localStorage.setItem("vamosOpsAuth", "1");
  });
  await page.addInitScript(init);
  const calls = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${p}`);
    if (p.startsWith("/api/staff/") && state.api !== "alive") {
      const a = DEAD[state.api];
      return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) }).catch(() => {});
    }
    if (p === "/api/staff/me" && meDelayMs) await new Promise((r) => setTimeout(r, meDelayMs));
    let a;
    if (p === "/api/staff/me") a = { status: 200, json: { ok: true, data: ME } };
    else if (p === "/api/staff/settings") a = { status: 200, json: { ok: true, data: req.method() === "GET" ? SETTINGS : { ...SETTINGS, ...JSON.parse(req.postData() || "{}") } } };
    else a = answer(req.method(), p, { rows: rows ?? [], money: MONEY_AFTER });
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) }).catch(() => {});
  });
  const seen = { loads: 0 };
  page.on("load", () => { seen.loads += 1; });
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  return { ctx, page, state, calls, seen };
}

const where = (page) => new URL(page.url()).pathname;
const flagOf = (page) => page.evaluate(() => localStorage.getItem("vamosOpsAuth"));
const shot = (page, name) => page.screenshot({ path: resolve(out, `${label}-${name}.png`) });

// Follow-up 4: a write refused for a dead session keeps the form; the next navigation goes to /login.
for (const kind of ["dead", "mfa", "notstaff"]) {
  const name = `write-keeps-form-${kind}`;
  if (!wanted(name)) continue;
  const { ctx, page, state } = await open("/settings");
  await page.waitForSelector("text=Save changes", { timeout: 15000 });
  await page.waitForTimeout(800);
  const company = page.locator("input:visible").first();
  state.api = kind; // the session dies
  gate.dead = true;
  await company.fill("Typed just before the session died");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1500);
  const kept = where(page) === "/settings";
  const value = kept ? await company.inputValue().catch(() => null) : null;
  const refusal = kept ? await page.evaluate(() => (document.body.innerText.match(/Could not save[^\n]*/) || [""])[0]) : "";
  check(`${name}: the page stays on /settings after the refused save`, kept, where(page));
  check(`${name}: the typed company name is still in the field`, value === "Typed just before the session died", String(value));
  check(`${name}: the screen shows its own refusal ("Could not save")`, /could not save/i.test(refusal), refusal);
  check(`${name}: still marked signed in on this page (no early clear)`, (await flagOf(page)) === "1");
  await shot(page, name);
  if (kept) {
    await page.locator('a[href="/customers"]').first().click();
    await page.waitForTimeout(2000);
  }
  check(`${name}: pressing Customers goes to /login`, where(page) === "/login", where(page));
  check(`${name}: the sign-in flag is cleared on the way out`, (await flagOf(page)) === null, String(await flagOf(page)));
  await ctx.close();
}

if (wanted("write-then-read")) {
  const { ctx, page, state } = await open("/settings");
  await page.waitForSelector("text=Save changes", { timeout: 15000 });
  await page.waitForTimeout(800);
  state.api = "dead";
  await page.locator("input:visible").first().fill("Typed before");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1200);
  const stayed = where(page) === "/settings";
  check("write-then-read: the refused save keeps the page", stayed, where(page));
  await page.evaluate(() => fetch("/api/staff/bookings", { credentials: "include" }).then((r) => r.status)).catch(() => null);
  await page.waitForTimeout(1500);
  check("write-then-read: the next staff read goes to /login", where(page) === "/login", where(page));
  await ctx.close();
}

// Follow-up 3: a switched-off staff row (403 not-staff) is a dead session.
if (wanted("notstaff-api")) {
  const { ctx, page, state } = await open("/dashboard");
  await page.waitForSelector("text=Money in", { timeout: 15000 });
  await page.waitForTimeout(600);
  state.api = "notstaff";
  await page.getByText("7 days", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  check("notstaff-api: a staff call answering 403 not-staff goes to /login", where(page) === "/login", where(page));
  check("notstaff-api: the stale sign-in flag is cleared", (await flagOf(page)) === null, String(await flagOf(page)));
  await shot(page, "notstaff-api");
  await ctx.close();
}

if (wanted("notstaff-nav")) {
  const { ctx, page, state } = await open("/dashboard");
  await page.waitForSelector("text=Money in", { timeout: 15000 });
  await page.waitForTimeout(600);
  state.api = "notstaff";
  gate.dead = true; // the next screen file 404s; /api/staff/me says not-staff
  await page.locator('a[href="/customers"]').first().click();
  await page.waitForTimeout(2500);
  check("notstaff-nav: a screen 404 while /api/staff/me says not-staff goes to /login", where(page) === "/login", where(page));
  await shot(page, "notstaff-nav");
  await ctx.close();
}

// Follow-up 2: the sidebar misses once at boot, the session is alive.
if (wanted("sidebar-slow-auth")) {
  const { ctx, page, seen } = await open("/dashboard", { setup: (g) => g.failOnceFiles.add("/app/ops/OpsSidebar.dc.html") });
  await page.waitForTimeout(5000);
  const sidebar = await page.locator('a[href="/customers"]').count();
  await shot(page, "sidebar-slow-auth");
  check("sidebar-slow-auth: the page reloaded once", seen.loads === 2, `page loads ${seen.loads}`);
  check("sidebar-slow-auth: the sidebar is there after the reload", sidebar > 0, `${sidebar} Customers links`);
  check("sidebar-slow-auth: still on the dashboard, still signed in", where(page) === "/dashboard" && (await flagOf(page)) === "1", where(page));
  await ctx.close();
}

// Unchanged guard (dashboard-fixes review round 2): a nested part never reloads the page.
if (wanted("nested-part")) {
  const { ctx, page, seen } = await open("/bookings/VT-26-0829", { rowsNeeded: true, setup: (g) => g.failFiles.add("/app/ops/PlaceSearch.dc.html") });
  await page.waitForSelector("[data-ops-route-chip]", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator("button:visible", { hasText: /^actions$/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: /^edit booking$/i }).first().click();
  const pax = page.getByLabel(/passengers/i).first();
  const opened = await pax.waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (opened) await pax.fill("7").catch(() => {});
  await page.waitForTimeout(5000);
  const kept = await pax.inputValue({ timeout: 1500 }).catch(() => null);
  check("nested-part: the part was asked for and 404ed", gate.hits.includes("/app/ops/PlaceSearch.dc.html"));
  check("nested-part: no reload, what was typed is still there", seen.loads === 1 && kept === "7", `loads ${seen.loads}, value ${kept}`);
  await ctx.close();
}

// What the hold is worth on a screen that polls: the bookings store re-reads every 3 s while it is loaded (OpsDetail uses it),
// and that next read is the redirect. Informational: prints how long the typed edit stayed.
if (wanted("detail-poll")) {
  const { ctx, page, state } = await open("/bookings/VT-26-0829", { rowsNeeded: true });
  await page.waitForSelector("[data-ops-route-chip]", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator("button:visible", { hasText: /^actions$/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: /^edit booking$/i }).first().click();
  // The note is not a trip field (a changed passenger count turns Save into Continue and the price flow).
  const note = page.getByLabel(/^note$/i).first();
  await note.waitFor({ timeout: 4000 });
  await note.fill("Gate B, he waits with a sign");
  state.api = "dead";
  gate.dead = true;
  await page.getByRole("button", { name: "Save changes" }).click();
  const t0 = Date.now();
  await page.waitForTimeout(300);
  const keptAt300 = where(page) !== "/login" ? await note.inputValue({ timeout: 800 }).catch(() => null) : null;
  let leftAfter = null;
  while (Date.now() - t0 < 7000) {
    if (where(page) === "/login") { leftAfter = Date.now() - t0; break; }
    await page.waitForTimeout(100);
  }
  check("detail-poll: right after the refused save the edit is still on the page", keptAt300 === "Gate B, he waits with a sign", String(keptAt300));
  console.log(`INFO  ${label}: detail-poll: the page went to /login ${leftAfter === null ? "never (within 7 s)" : `${leftAfter} ms after the save`} (the next bookings poll)`);
  await ctx.close();
}

// Follow-up 1: a junk reload count. The dashboard file 404s on every load; /api/staff/me answers alive but slowly (15.5 s),
// the shape of "Auth that stays slow". With the count read as NaN the page reloaded every ~16 s for ever.
if (wanted("junk-count")) {
  const { ctx, page, seen } = await open("/dashboard", {
    setup: (g) => g.failFiles.add("/app/ops/OpsDash.dc.html"),
    meDelayMs: 15500,
    init: () => { if (sessionStorage.getItem("vamosOpsScreenRetryCount") === null) sessionStorage.setItem("vamosOpsScreenRetryCount", "abc"); },
  });
  await page.waitForTimeout(53000);
  const stored = await page.evaluate(() => sessionStorage.getItem("vamosOpsScreenRetryCount")).catch(() => null);
  check("junk-count: the page is reloaded at most twice (3 loads in all) in 53 s", seen.loads <= 3, `page loads ${seen.loads}, stored count ${stored}`);
  await ctx.close();
}

await browser.close();
server.close();
rmSync(scratch, { recursive: true, force: true });
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
