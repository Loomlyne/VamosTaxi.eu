#!/usr/bin/env node
// U8a proof in a real browser: the dashboard session dies while the console is open.
//
//   node session-lost.mjs <public tree> <label> <out dir>
//
// Serves the synced public tree (see serve.mjs), opens /bookings with a live session, then the session dies
// (gate.dead: screen files answer the gate's private 404; /api/staff/* answers 401 no-session) and the
// person presses Customers in the sidebar. Four runs:
//   dead-nav     the next screen file 404s and /api/staff/me says no-session  -> must end on /login
//   dead-api     a staff API call answers 401 no-session (period switch)       -> must end on /login
//   mfa-api      403 needs-mfa on an API call                                    -> must end on /login
//   slow-auth    one screen file 404s (the gate's Auth wait ran out), the session is alive -> reloads once, shows the screen
//   missing-file the screen file 404s for good but the session is alive          -> reloads once, then stays (a missing file)
//   nested-part  PlaceSearch 404s while OpsDetail is in edit mode (session alive) -> no reload, the edit is kept
// Prints PASS/FAIL per run and writes <label>-<run>.png (bare viewport crop, 1440 x 900).
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { serve, gate } from "./serve.mjs";
import { answer, stubRows, MONEY_AFTER } from "./fixtures.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , tree, label = "after", outArg = "screens"] = process.argv;
if (!tree) throw new Error("usage: session-lost.mjs <public tree> <label> <out dir>");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const scratch = mkdtempSync(join(out, "tmp-"));

const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };
const { server, base } = await serve(resolve(tree));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || undefined });
let bad = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
};

async function scenario(name, { dead, staffAnswer, act, expectLogin, slow }) {
  gate.dead = false;
  gate.failNext = 0;
  gate.hits.length = 0;
  const state = { answer: "alive" };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  // serveOpsDc sets the sign-in flag in every console document, not in /login: so does this.
  await page.addInitScript(() => {
    localStorage.setItem("vamosLang", "en");
    if (location.pathname !== "/login") localStorage.setItem("vamosOpsAuth", "1");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (state.answer !== "alive" && path.startsWith("/api/staff/")) {
      const a = state.answer === "mfa" ? { status: 403, json: { ok: false, code: "needs-mfa" } } : { status: 401, json: { ok: false, code: "no-session" } };
      return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
    }
    const json = path === "/api/staff/me" ? { ok: true, data: ME } : { ok: true, data: path === "/api/staff/dashboard" ? { period: "all", incomeRappen: 0, refundRappen: 0, feeRappen: 0, fareCount: 0, byClass: [], refunds: [] } : [] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
  let loads = 0;
  page.on("load", () => { loads += 1; });
  await page.goto(`${base}/dashboard`, { waitUntil: "load" });
  await page.waitForSelector("text=Money in", { timeout: 15000 });
  await page.waitForTimeout(600);
  // The session dies.
  gate.dead = dead;
  gate.failNext = slow ? 1 : 0;
  state.answer = staffAnswer;
  await act(page);
  await page.waitForTimeout(slow ? 5000 : 2500);
  const path = new URL(page.url()).pathname;
  const flag = await page.evaluate(() => localStorage.getItem("vamosOpsAuth"));
  await page.screenshot({ path: resolve(out, `${label}-${name}.png`) });
  if (slow) {
    const text = await page.evaluate(() => (document.querySelector("[data-ops-main]") || document.body).innerText);
    check(`${name}: the page reloaded once and shows the screen`, loads === 2 && /customers/i.test(text) && path === "/customers", `page loads ${loads}, path ${path}`);
    check(`${name}: still signed in (no /login)`, flag === "1", String(flag));
  } else if (expectLogin) {
    check(`${name}: the browser is on /login`, path === "/login", path);
    check(`${name}: the stale sign-in flag is cleared (the login page does not set it)`, flag === null, String(flag));
  } else {
    check(`${name}: the browser stays on the page (not a dead session)`, path === "/customers", path);
    check(`${name}: the sign-in flag is kept`, flag === "1", String(flag));
    if (name === "missing-file") check(`${name}: reloaded once at most, no loop`, loads <= 2, `page loads ${loads}`);
  }
  await ctx.close();
}

const clickCustomers = async (page) => { await page.locator('a[href="/customers"]').first().click(); };
await scenario("dead-nav", { dead: true, staffAnswer: "dead", act: clickCustomers, expectLogin: true });
await scenario("dead-api", { dead: false, staffAnswer: "dead", act: async (page) => { await page.getByText("7 days", { exact: true }).first().click(); }, expectLogin: true });
await scenario("mfa-api", { dead: false, staffAnswer: "mfa", act: async (page) => { await page.getByText("7 days", { exact: true }).first().click(); }, expectLogin: true });
await scenario("slow-auth", { dead: false, staffAnswer: "alive", act: clickCustomers, expectLogin: false, slow: true });
await scenario("missing-file", { dead: true, staffAnswer: "alive", act: clickCustomers, expectLogin: false });

// nested-part: a part a screen fetches while it runs (PlaceSearch, first fetched when OpsDetail enters edit mode) 404s
// while the session is alive. The reload must not happen: it would throw away what the person has typed.
async function nestedPart() {
  gate.dead = false;
  gate.failNext = 0;
  gate.failFiles = new Set(["/app/ops/PlaceSearch.dc.html"]);
  gate.hits.length = 0;
  const rows = await stubRows(repo, scratch);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem("vamosLang", "en"); localStorage.setItem("vamosOpsAuth", "1"); });
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const a = answer(req.method(), new URL(req.url()).pathname, { rows, money: MONEY_AFTER });
    return route.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.json) });
  });
  let loads = 0;
  page.on("load", () => { loads += 1; });
  await page.goto(`${base}/bookings/VT-26-0829`, { waitUntil: "load" });
  await page.waitForSelector("[data-ops-route-chip]", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator("button:visible", { hasText: /^actions$/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button:visible", { hasText: /^edit booking$/i }).first().click();
  const pax = page.getByLabel(/passengers/i).first();
  // With a watcher that reloads on any 404 the page reloads about a second after the click and the form never stays.
  const opened = await pax.waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (opened) await pax.fill("7").catch(() => {});
  await page.waitForTimeout(5000);
  const kept = await pax.inputValue({ timeout: 1500 }).catch(() => null);
  const asked = gate.hits.includes("/app/ops/PlaceSearch.dc.html");
  await page.screenshot({ path: resolve(out, `${label}-nested-part.png`) });
  check("nested-part: the part was asked for and 404ed (the proof is real)", asked);
  check("nested-part: the page was not reloaded", loads === 1, `page loads ${loads}`);
  check("nested-part: what was typed is still there", kept === "7", String(kept));
  gate.failFiles = new Set();
  await ctx.close();
}

await nestedPart();

await browser.close();
server.close();
rmSync(scratch, { recursive: true, force: true });
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
