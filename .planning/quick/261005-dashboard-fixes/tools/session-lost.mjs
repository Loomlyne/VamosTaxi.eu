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
//   missing-file the screen file 404s but the session is alive                  -> must stay (a missing file)
// Prints PASS/FAIL per run and writes <label>-<run>.png (bare viewport crop, 1440 x 900).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { serve, gate } from "./serve.mjs";

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [, , tree, label = "after", outArg = "screens"] = process.argv;
if (!tree) throw new Error("usage: session-lost.mjs <public tree> <label> <out dir>");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };
const { server, base } = await serve(resolve(tree));
const browser = await chromium.launch({ headless: true });
let bad = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) bad += 1;
};

async function scenario(name, { dead, staffAnswer, act, expectLogin }) {
  gate.dead = false;
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
  await page.goto(`${base}/dashboard`, { waitUntil: "load" });
  await page.waitForSelector("text=Money in", { timeout: 15000 });
  await page.waitForTimeout(600);
  // The session dies.
  gate.dead = dead;
  state.answer = staffAnswer;
  await act(page);
  await page.waitForTimeout(2500);
  const path = new URL(page.url()).pathname;
  const flag = await page.evaluate(() => localStorage.getItem("vamosOpsAuth"));
  await page.screenshot({ path: resolve(out, `${label}-${name}.png`) });
  if (expectLogin) {
    check(`${name}: the browser is on /login`, path === "/login", path);
    check(`${name}: the stale sign-in flag is cleared (the login page does not set it)`, flag === null, String(flag));
  } else {
    check(`${name}: the browser stays on the page (not a dead session)`, path === "/customers", path);
    check(`${name}: the sign-in flag is kept`, flag === "1", String(flag));
  }
  await ctx.close();
}

const clickCustomers = async (page) => { await page.locator('a[href="/customers"]').first().click(); };
await scenario("dead-nav", { dead: true, staffAnswer: "dead", act: clickCustomers, expectLogin: true });
await scenario("dead-api", { dead: false, staffAnswer: "dead", act: async (page) => { await page.getByText("7 days", { exact: true }).first().click(); }, expectLogin: true });
await scenario("mfa-api", { dead: false, staffAnswer: "mfa", act: async (page) => { await page.getByText("7 days", { exact: true }).first().click(); }, expectLogin: true });
await scenario("missing-file", { dead: true, staffAnswer: "alive", act: clickCustomers, expectLogin: false });

await browser.close();
server.close();
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
