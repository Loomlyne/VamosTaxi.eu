import { chromium } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/apps/web/node_modules/@playwright/test/index.mjs";
import { execFileSync } from "node:child_process";

export const BASE = "http://localhost:4580";
export const DASH = "http://dashboard.localhost:4581";
export const SHOTS = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a6ce6d39e2579cbf7/.planning/quick/261003-fare-lines/screens/build";
export const sql = (q) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_vamos-taxi-fl", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();

export const results = [];
export const rec = (n, ok, ev) => {
  results.push({ n, ok, ev });
  console.log(`${ok === null ? "INFO" : ok ? "PASS" : "FAIL"} | ${n} | ${ev}`);
};

export async function newContext(browser, { lang = "en", w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    extraHTTPHeaders: { "cf-connecting-ip": `10.${60 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  return ctx;
}

export async function newPage(ctx, errors = []) {
  const page = await ctx.newPage();
  // /api/fx reaches the internet from the local Worker and has crashed wrangler's local proxy; the display-currency rate is not part of this check.
  await page.route(/\/api\/fx(\?.*)?$/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return page;
}

/** Home -> Zurich Airport pickup, Zug drop-off, a day next week -> /checkout. Returns the checkout URL. */
export async function homeToCheckout(page, lang) {
  const prefix = lang === "en" ? "" : "/" + lang;
  await go(page, BASE + prefix + "/", { waitUntil: "networkidle" });
  await page.locator('input[role="combobox"]').nth(0).fill("Zurich Airport");
  await page.locator('[role="listbox"] >> text=Zurich Airport').first().click();
  await page.locator('input[placeholder="LX 318"]').first().fill("LX 318");
  await page.waitForTimeout(1500);
  await page.locator('input[role="combobox"]').nth(1).fill("Zug");
  await page.locator('[role="listbox"] >> text=Zug station').first().click();
  await page.click('[data-bx="when"] button');
  await page.locator('[data-bx="when"] button', { hasText: /^10$/ }).first().click();
  await page.locator('[data-bx="when"] button').last().click();
  await page.waitForTimeout(500);
  await Promise.all([page.waitForURL(/\/checkout/, { timeout: 20000 }), page.locator('[data-bx="cta"] button').click()]);
  return page.url();
}

/** Restarts this job's own public Worker (recorded PID) when wrangler's local proxy has dropped. */
export async function ensureUp() {
  try {
    const r = await fetch(BASE + "/api/auth/session");
    if (r.ok) return;
  } catch {}
  console.log("worker down, restarting");
  try { execFileSync("/private/tmp/vamos-fl/restart-public.sh", { stdio: "inherit" }); } catch (e) { console.log("restart failed"); }
}

export async function go(page, url, opts = { waitUntil: "domcontentloaded" }) {
  await ensureUp();
  try { return await page.goto(url, opts); } catch (e) { await ensureUp(); return page.goto(url, opts); }
}

export async function launch() {
  return chromium.launch();
}
